import { getActiveCards, type RiskCard } from "./riskEngine";
import { logger } from "./logger";
import type { Response } from "express";

// ── Types ──────────────────────────────────────────────────────────────────────
export type FaultSeverity = "critical" | "major" | "minor" | "monitoring";
export type FaultStatus   = "Assigned" | "En Route" | "Arrived" | "Working" | "Resolved" | "Closed";

export interface FaultRecord {
  id:                 string;
  cowId:              string;
  alarm:              string;
  alarmType:          "power" | "nsa";
  severity:           FaultSeverity;
  status:             FaultStatus;
  assignedTeam:       string;
  teamId:             string;
  dispatchTime:       number;
  etaMinutes:         number;
  etaExpiry:          number;
  arrivedAt:          number | null;
  resolvedAt:         number | null;
  closedAt:           number | null;
  backupRemainingMin: number | null;
  area:               string;
  teamLat:            number;
  teamLng:            number;
}

// ── Team pool ──────────────────────────────────────────────────────────────────
const TEAMS = [
  { id: "T1", name: "Team Alpha",   depot: [21.430, 39.826] as [number, number] },
  { id: "T2", name: "Team Bravo",   depot: [21.415, 39.876] as [number, number] },
  { id: "T3", name: "Team Charlie", depot: [21.350, 39.980] as [number, number] },
  { id: "T4", name: "Team Delta",   depot: [21.384, 39.916] as [number, number] },
  { id: "T5", name: "Team Echo",    depot: [21.432, 39.848] as [number, number] },
];

// ── Area → approximate center coords ──────────────────────────────────────────
const AREA_CENTERS: Record<string, [number, number]> = {
  "arafat":         [21.354, 39.983],
  "mina":           [21.414, 39.878],
  "muzdalifah":     [21.383, 39.918],
  "makkah remote":  [21.432, 39.850],
  "haram":          [21.422, 39.826],
};
const DEFAULT_CENTER: [number, number] = [21.422, 39.826];

function getAreaCenter(area: string): [number, number] {
  const key = (area ?? "").toLowerCase().trim();
  for (const [k, v] of Object.entries(AREA_CENTERS)) {
    if (key.includes(k)) return v;
  }
  return DEFAULT_CENTER;
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// ── Severity mapping ───────────────────────────────────────────────────────────
function mapSeverity(card: RiskCard): FaultSeverity {
  if (card.severity === "critical") return "critical";
  if (card.alarmType === "power")   return "major";
  return "minor";
}

function workMin(sev: FaultSeverity): number {
  if (sev === "critical") return 45;
  if (sev === "major")    return 30;
  return 20;
}

// ── Status computation ─────────────────────────────────────────────────────────
function computeStatus(fault: FaultRecord, now: number): FaultStatus {
  const enRouteAt  = fault.dispatchTime + 90_000;       // 1.5 min after dispatch
  const arrivedAt  = fault.etaExpiry;
  const resolvedAt = arrivedAt + workMin(fault.severity) * 60_000;
  const closedAt   = resolvedAt + 300_000;               // 5 min after resolve

  if (now < enRouteAt)          return "Assigned";
  if (now < arrivedAt)          return "En Route";
  if (now < arrivedAt + 120_000) return "Arrived";
  if (now < resolvedAt)         return "Working";
  if (now < closedAt)           return "Resolved";
  return "Closed";
}

// ── Team GPS interpolation ─────────────────────────────────────────────────────
function computeTeamPos(fault: FaultRecord, status: FaultStatus): [number, number] {
  const team   = TEAMS.find(t => t.id === fault.teamId) ?? TEAMS[0];
  const depot  = team.depot;
  const target = getAreaCenter(fault.area);
  const hash   = fault.id.charCodeAt(fault.id.length - 1);
  const now    = Date.now();

  if (status === "Assigned") {
    return [depot[0] + (hash % 11) * 0.0004, depot[1] + (hash % 7) * 0.0004];
  }
  if (status === "En Route") {
    const enRouteAt = fault.dispatchTime + 90_000;
    const elapsed   = now - enRouteAt;
    const total     = Math.max(1, fault.etaExpiry - enRouteAt);
    const t = Math.min(0.98, Math.max(0, elapsed / total));
    return [lerp(depot[0], target[0], t), lerp(depot[1], target[1], t)];
  }
  // Arrived / Working / Resolved / Closed — at site
  return [target[0] + (hash % 5) * 0.0002, target[1] + (hash % 3) * 0.0002];
}

// ── State ──────────────────────────────────────────────────────────────────────
const activeFaults = new Map<string, FaultRecord>();
const closedFaults = new Map<string, FaultRecord>();
const sseClients   = new Set<Response>();
const _siteSeq     = new Map<string, string>();
let   _seq         = 1000;

// ── SSE helpers ────────────────────────────────────────────────────────────────
export function addFaultSseClient(res: Response) {
  sseClients.add(res);
  res.write(`data: ${JSON.stringify(buildPayload())}\n\n`);
}
export function removeFaultSseClient(res: Response) {
  sseClients.delete(res);
}
function broadcast() {
  const msg = `data: ${JSON.stringify(buildPayload())}\n\n`;
  for (const c of sseClients) {
    try { c.write(msg); } catch { sseClients.delete(c); }
  }
}
function buildPayload() {
  return { active: [...activeFaults.values()], history: [...closedFaults.values()], ts: Date.now() };
}

// ── Poll ───────────────────────────────────────────────────────────────────────
function poll() {
  const cards    = getActiveCards();
  const now      = Date.now();
  const incoming = new Set<string>();

  for (const card of cards) {
    incoming.add(card.siteId);

    // Area inference from etaMinutes (30 = Makkah Remote, else closer area)
    const area = card.etaMinutes >= 30 ? "Makkah Remote" : "Mina";

    if (!_siteSeq.has(card.siteId)) {
      const faultId = `FM-${++_seq}`;
      _siteSeq.set(card.siteId, faultId);
      const ti    = (card.siteId.charCodeAt(card.siteId.length - 1) +
                     card.siteId.charCodeAt(0)) % TEAMS.length;
      const team  = TEAMS[ti];
      const sev   = mapSeverity(card);
      const eta   = card.etaExpiry ?? (card.assignedTime + card.etaMinutes * 60_000);

      const fault: FaultRecord = {
        id: faultId, cowId: card.siteId,
        alarm: card.alarmDescription, alarmType: card.alarmType,
        severity: sev, status: "Assigned",
        assignedTeam: team.name, teamId: team.id,
        dispatchTime: card.assignedTime, etaMinutes: card.etaMinutes,
        etaExpiry: eta,
        arrivedAt: null, resolvedAt: null, closedAt: null,
        backupRemainingMin: card.batteryBackupMinutes,
        area, teamLat: team.depot[0], teamLng: team.depot[1],
      };
      activeFaults.set(card.siteId, fault);
    }

    const fault  = activeFaults.get(card.siteId)!;
    const status = computeStatus(fault, now);
    const [teamLat, teamLng] = computeTeamPos(fault, status);
    const backupRemainingMin = card.batteryExpiry != null
      ? Math.max(0, Math.round((card.batteryExpiry - now) / 60_000))
      : fault.backupRemainingMin;

    activeFaults.set(card.siteId, {
      ...fault, status, teamLat, teamLng,
      severity:  mapSeverity(card),
      area,
      backupRemainingMin,
      arrivedAt: (status !== "Assigned" && status !== "En Route")
        ? (fault.arrivedAt ?? fault.etaExpiry) : null,
      resolvedAt: (status === "Resolved" || status === "Closed")
        ? (fault.resolvedAt ?? (fault.etaExpiry + workMin(fault.severity) * 60_000)) : null,
    });
  }

  // Faults cleared from PBI
  for (const [siteId, fault] of activeFaults) {
    if (incoming.has(siteId)) continue;
    const status = computeStatus(fault, now);
    if (status === "Closed") {
      activeFaults.delete(siteId);
      _siteSeq.delete(siteId);
      closedFaults.set(fault.id, { ...fault, status: "Closed", closedAt: now });
      setTimeout(() => closedFaults.delete(fault.id), 2 * 3_600_000);
    } else {
      const [teamLat, teamLng] = computeTeamPos(fault, "Working");
      activeFaults.set(siteId, {
        ...fault, status: "Resolved",
        teamLat, teamLng,
        arrivedAt:  fault.arrivedAt  ?? fault.etaExpiry,
        resolvedAt: fault.resolvedAt ?? now,
      });
    }
  }

  broadcast();
}

// ── Public API ─────────────────────────────────────────────────────────────────
export function getActiveFaults():  FaultRecord[] { return [...activeFaults.values()]; }
export function getFaultHistory():  FaultRecord[] { return [...closedFaults.values()]; }

export function startFaultEngine() {
  poll();
  setInterval(poll, 15_000);
  logger.info("Fault engine started");
}
