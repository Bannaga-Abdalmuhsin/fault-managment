import { getActiveCards, type RiskCard } from "./riskEngine";
import { dax } from "./pbi";
import { logger } from "./logger";
import type { Response } from "express";

// ── ACES API config ────────────────────────────────────────────────────────────
const ACES_POST_URL    = (process.env.ACESMSD_FAULT_API_URL ?? "https://acesmsd.live/api/faults").replace(/\/$/, "");
const ACES_API_KEY     = process.env.ACESMSD_FAULT_API_KEY  ?? "";
const ACES_ACTIVE_URL  = ACES_POST_URL.replace(/\/faults$/, "") + "/faults/active";

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
  siteLat:            number;
  siteLng:            number;
  // ACES dispatch fields
  acesId?:            number;
  assignedTechId?:    number;
  acesStatus?:        string;
  ttNumber?:          string;
  // PBI staff fields (shown in Fault Management detail panel)
  foStaff?:           string;
  subcon?:            string;
  owner?:             string;
}

// ── Site coords cache (loaded once from PBI) ──────────────────────────────────
interface SiteCoord { lat: number; lng: number; area: string }
const siteCoords = new Map<string, SiteCoord>();

async function loadSiteCoords() {
  try {
    const rows = await dax(`
      EVALUATE
      SELECTCOLUMNS(
        FILTER(DB, DB[Region] = "WR-HAJJ"),
        "siteId",    DB[Site ID],
        "lat",       DB[Lattitude],
        "lng",       DB[Longitude],
        "area",      DB[Column13]
      )
    `);
    for (const r of rows) {
      const siteId = (r["[siteId]"] ?? "").toString().trim();
      const lat    = parseFloat(r["[lat]"]  ?? 0);
      const lng    = parseFloat(r["[lng]"]  ?? 0);
      const area   = (r["[area]"] ?? "").toString().trim();
      if (siteId && lat && lng) siteCoords.set(siteId, { lat, lng, area });
    }
    logger.info({ count: siteCoords.size }, "Site coordinates loaded for fault dispatch");
  } catch (err: any) {
    logger.warn({ err }, "Could not load site coords from PBI — using area defaults");
  }
}

// ── Area → fallback center ────────────────────────────────────────────────────
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

// ── Field mappers ─────────────────────────────────────────────────────────────
function mapSeverityToAces(card: RiskCard): "critical" | "major" | "minor" | "warning" {
  if (card.severity === "critical") return "critical";
  if (card.alarmType === "power")   return "major";
  return "minor";
}

function mapSeverityLocal(aces: string): FaultSeverity {
  if (aces === "critical") return "critical";
  if (aces === "major")    return "major";
  if (aces === "minor")    return "minor";
  return "monitoring";
}

function mapAcesStatus(s: string): FaultStatus {
  const v = (s ?? "").toLowerCase().replace(/_/g, " ");
  if (v === "new" || v === "assigned")  return "Assigned";
  if (v === "en route" || v === "en_route") return "En Route";
  if (v === "on site"  || v === "on_site")  return "Arrived";
  if (v === "resolved") return "Resolved";
  if (v === "closed")   return "Closed";
  return "Working";
}

function formatBackupTime(mins: number | null): string {
  if (mins == null) return "00:00";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function mapPowerSource(config: string): string {
  const c = (config ?? "").toLowerCase();
  if (c.includes("battery"))   return "Battery";
  if (c.includes("generator")) return "Generator";
  if (c.includes("mains") || c.includes("commercial")) return "Mains";
  if (c.includes("diesel"))    return "Generator";
  return config || "Unknown";
}

function normalizeLocation(area: string): string {
  const a = (area ?? "").toLowerCase().trim();
  if (a.includes("arafat"))      return "Arafat";
  if (a.includes("mina"))        return "Mina";
  if (a.includes("muzdalif"))    return "Muzdalifa";
  if (a.includes("makkah") || a.includes("remote") || a.includes("haram")) return "Makkah Remote";
  return area || "Makkah Remote";
}

// ── Simulated team GPS (fallback / for map animation) ─────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

const DEPOT_COORDS: [number, number][] = [
  [21.430, 39.826], [21.415, 39.876], [21.350, 39.980],
  [21.384, 39.916], [21.432, 39.848],
];

function computeTeamPos(fault: FaultRecord, status: FaultStatus): [number, number] {
  const hash  = fault.id.charCodeAt(fault.id.length - 1);
  const depot = DEPOT_COORDS[hash % DEPOT_COORDS.length];
  const target: [number, number] = fault.siteLat && fault.siteLng
    ? [fault.siteLat, fault.siteLng]
    : getAreaCenter(fault.area);
  const now = Date.now();

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
  return [target[0] + (hash % 5) * 0.0002, target[1] + (hash % 3) * 0.0002];
}

// ── Simulated status (fallback when ACES unreachable) ─────────────────────────
function workMin(sev: FaultSeverity): number {
  if (sev === "critical") return 45;
  if (sev === "major")    return 30;
  return 20;
}

function simulateStatus(fault: FaultRecord, now: number): FaultStatus {
  const enRouteAt  = fault.dispatchTime + 90_000;
  const arrivedAt  = fault.etaExpiry;
  const resolvedAt = arrivedAt + workMin(fault.severity) * 60_000;
  const closedAt   = resolvedAt + 300_000;
  if (now < enRouteAt)           return "Assigned";
  if (now < arrivedAt)           return "En Route";
  if (now < arrivedAt + 120_000) return "Arrived";
  if (now < resolvedAt)          return "Working";
  if (now < closedAt)            return "Resolved";
  return "Closed";
}

// ── State ──────────────────────────────────────────────────────────────────────
const activeFaults = new Map<string, FaultRecord>();
const closedFaults = new Map<string, FaultRecord>();
const sseClients   = new Set<Response>();
const _siteToFault = new Map<string, string>();   // siteId → faultId
let   _seq         = 1000;
let   _acesOnline  = true;

// ── SSE ────────────────────────────────────────────────────────────────────────
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

// ── ACES: dispatch a new fault ─────────────────────────────────────────────────
async function dispatchToAces(fault: FaultRecord, card: RiskCard): Promise<void> {
  const body = {
    ttId:         card.ttNumber || fault.id,
    cowId:        card.siteId,
    alarmName:    card.alarmDescription,
    severity:     mapSeverityToAces(card),
    siteLat:      fault.siteLat,
    siteLng:      fault.siteLng,
    powerSource:  mapPowerSource(card.powerConfiguration),
    backupTime:   formatBackupTime(card.batteryBackupMinutes),
    location:     normalizeLocation(fault.area),
    autoDispatch: true,
  };

  try {
    const res = await fetch(ACES_POST_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ACES_API_KEY },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, body: text, cowId: card.siteId }, "ACES dispatch rejected");
      return;
    }

    const data = await res.json() as {
      id?: number; assignedTechId?: number; eta?: number;
      dispatchStatus?: string; dispatchedAt?: string;
    };

    const updated = activeFaults.get(card.siteId);
    if (updated) {
      activeFaults.set(card.siteId, {
        ...updated,
        acesId:         data.id,
        assignedTechId: data.assignedTechId,
        acesStatus:     data.dispatchStatus ?? "assigned",
        status:         mapAcesStatus(data.dispatchStatus ?? "assigned"),
        assignedTeam:   data.assignedTechId ? `Tech #${data.assignedTechId}` : updated.assignedTeam,
        teamId:         data.assignedTechId ? `ACES-${data.assignedTechId}` : updated.teamId,
        etaMinutes:     data.eta ?? updated.etaMinutes,
        etaExpiry:      data.eta
          ? updated.dispatchTime + data.eta * 60_000
          : updated.etaExpiry,
      });
    }

    if (!_acesOnline) {
      _acesOnline = true;
      logger.info("ACES fault API back online");
    }
    logger.info({ acesId: data.id, techId: data.assignedTechId, cowId: card.siteId }, "Fault dispatched via ACES");
  } catch (err: any) {
    if (_acesOnline) {
      _acesOnline = false;
      logger.warn({ err: err.message }, "ACES fault API unreachable — using simulation");
    }
  }
}

// ── ACES: refresh active faults from GET /active ──────────────────────────────
async function refreshFromAces(): Promise<void> {
  if (!_acesOnline) return;

  try {
    const res = await fetch(ACES_ACTIVE_URL, {
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) return;

    const rows = await res.json() as Array<{
      id?: number;
      ttId?: string;
      cowId?: string;
      severity?: string;
      dispatchStatus?: string;
      status?: string;
      assignedTechId?: number;
      eta?: number;
      dispatchedAt?: string;
    }>;

    for (const row of rows) {
      const cowId = (row.cowId ?? row.ttId ?? "").toString().trim();
      const fault = activeFaults.get(cowId);
      if (!fault) continue;

      const acesStatus = row.dispatchStatus ?? row.status ?? "";
      const mappedStatus = mapAcesStatus(acesStatus);
      const now = Date.now();

      activeFaults.set(cowId, {
        ...fault,
        acesId:         row.id          ?? fault.acesId,
        assignedTechId: row.assignedTechId ?? fault.assignedTechId,
        acesStatus,
        status:         mappedStatus,
        severity:       row.severity ? mapSeverityLocal(row.severity) : fault.severity,
        assignedTeam:   row.assignedTechId ? `Tech #${row.assignedTechId}` : fault.assignedTeam,
        etaMinutes:     row.eta ?? fault.etaMinutes,
        arrivedAt:
          (mappedStatus === "Arrived" || mappedStatus === "Working")
            ? (fault.arrivedAt ?? now) : fault.arrivedAt,
        resolvedAt:
          (mappedStatus === "Resolved" || mappedStatus === "Closed")
            ? (fault.resolvedAt ?? now) : fault.resolvedAt,
      });
    }

    // Mark any ACES-confirmed closed fault as closed locally
    const acesIds = new Set(rows.map(r => r.id).filter(Boolean));
    for (const [siteId, fault] of activeFaults) {
      if (fault.acesId && !acesIds.has(fault.acesId)) {
        const resolved: FaultRecord = { ...fault, status: "Closed", closedAt: Date.now() };
        activeFaults.delete(siteId);
        _siteToFault.delete(siteId);
        closedFaults.set(fault.id, resolved);
        setTimeout(() => closedFaults.delete(fault.id), 2 * 3_600_000);
      }
    }
  } catch {
    // Silent — just skip refresh if network blip
  }
}

// ── Main poll ─────────────────────────────────────────────────────────────────
async function poll() {
  const cards  = getActiveCards();
  const now    = Date.now();
  const incoming = new Set<string>();

  for (const card of cards) {
    if (card.severity === "cleared") continue;
    incoming.add(card.siteId);

    const coord = siteCoords.get(card.siteId);
    const [siteLat, siteLng] = coord
      ? [coord.lat, coord.lng]
      : getAreaCenter("");
    const area = coord?.area ?? card.siteId;

    if (!_siteToFault.has(card.siteId)) {
      const faultId = `FM-${++_seq}`;
      _siteToFault.set(card.siteId, faultId);

      const sev = card.severity === "critical" ? "critical"
        : card.alarmType === "power" ? "major" : "minor";

      const etaExpiry = card.etaExpiry ?? (card.assignedTime + card.etaMinutes * 60_000);

      // Real team from PBI — matches the Risk Dashboard "Teams" panel.
      // subcon = field crew dispatched to the site (THE team handling the fault).
      // owner  = responsible owner (fallback when no subcon is assigned, e.g. SIR/NSA).
      // foStaff = Front Office desk engineer (coordinator) — NEVER shown as the field team.
      const assignedTeam = card.subcon || card.owner || "Unassigned";
      const teamId       = card.subcon || card.owner || faultId;

      const fault: FaultRecord = {
        id:                 faultId,
        cowId:              card.siteId,
        alarm:              card.alarmDescription,
        alarmType:          card.alarmType,
        severity:           sev as FaultSeverity,
        status:             "Assigned",
        assignedTeam,
        teamId,
        dispatchTime:       card.assignedTime,
        etaMinutes:         card.etaMinutes,
        etaExpiry,
        arrivedAt:          null,
        resolvedAt:         null,
        closedAt:           null,
        backupRemainingMin: card.batteryBackupMinutes,
        area:               normalizeLocation(area),
        teamLat:            siteLat + 0.01,
        teamLng:            siteLng + 0.01,
        siteLat,
        siteLng,
        ttNumber:           card.ttNumber || faultId,
        foStaff:            card.foStaff  || undefined,
        subcon:             card.subcon   || undefined,
        owner:              card.owner    || undefined,
      };

      activeFaults.set(card.siteId, fault);

      // Fire-and-forget dispatch to ACES (updates the record async)
      dispatchToAces(fault, card);
    }

    const fault = activeFaults.get(card.siteId)!;

    // Update GPS position and battery remaining on every tick
    const status = _acesOnline && fault.acesStatus
      ? mapAcesStatus(fault.acesStatus)
      : simulateStatus(fault, now);

    const [teamLat, teamLng] = computeTeamPos(fault, status);
    const backupRemainingMin = card.batteryExpiry != null
      ? Math.max(0, Math.round((card.batteryExpiry - now) / 60_000))
      : fault.backupRemainingMin;

    // Re-sync team from PBI on every tick (corrects historical misassignments
    // where foStaff was used). Skip when ACES has dispatched a tech — that
    // assignment ("Tech #N") wins over the PBI-derived team.
    const pbiTeam   = card.subcon || card.owner || fault.assignedTeam;
    const pbiTeamId = card.subcon || card.owner || fault.teamId;
    const acesOwned = fault.assignedTechId != null;

    activeFaults.set(card.siteId, {
      ...fault,
      status,
      teamLat,
      teamLng,
      backupRemainingMin,
      assignedTeam: acesOwned ? fault.assignedTeam : pbiTeam,
      teamId:       acesOwned ? fault.teamId       : pbiTeamId,
      foStaff:      card.foStaff || fault.foStaff,
      subcon:       card.subcon  || fault.subcon,
      owner:        card.owner   || fault.owner,
      severity: (card.severity === "critical" ? "critical"
        : card.alarmType === "power" ? "major" : "minor") as FaultSeverity,
      arrivedAt:
        (status !== "Assigned" && status !== "En Route")
          ? (fault.arrivedAt ?? fault.etaExpiry) : null,
      resolvedAt:
        (status === "Resolved" || status === "Closed")
          ? (fault.resolvedAt ?? (fault.etaExpiry + workMin(fault.severity) * 60_000)) : null,
    });
  }

  // Close faults whose PBI ticket has cleared (PBI is the source of truth).
  // When the ticket disappears from the risk engine (i.e. status flipped to
  // "Closed" on the main dashboard) we move the fault straight to the closed
  // history — regardless of what ACES still reports.
  for (const [siteId, fault] of activeFaults) {
    if (incoming.has(siteId)) continue;

    activeFaults.delete(siteId);
    _siteToFault.delete(siteId);
    closedFaults.set(fault.id, {
      ...fault,
      status: "Closed",
      arrivedAt:  fault.arrivedAt  ?? fault.etaExpiry,
      resolvedAt: fault.resolvedAt ?? now,
      closedAt:   now,
    });
    // Keep in closed-history for 24h so the UI can show it on the Closed tab.
    setTimeout(() => closedFaults.delete(fault.id), 24 * 3_600_000);
    logger.info({ faultId: fault.id, cowId: fault.cowId, ttNumber: fault.ttNumber },
      "Fault closed (PBI ticket cleared)");
  }

  // Refresh ACES status for all dispatched faults
  await refreshFromAces();

  broadcast();
}

// ── Public API ─────────────────────────────────────────────────────────────────
export function getActiveFaults():  FaultRecord[] { return [...activeFaults.values()]; }
export function getFaultHistory():  FaultRecord[] { return [...closedFaults.values()]; }

// ── Manual operator overrides (used by REST endpoints) ────────────────────────
function findActiveById(id: string): { siteId: string; fault: FaultRecord } | null {
  for (const [siteId, fault] of activeFaults) {
    if (fault.id === id) return { siteId, fault };
  }
  return null;
}

/** Manually re-dispatch a fault to ACES. Returns true if found. */
export async function manualDispatch(faultId: string): Promise<boolean> {
  const hit = findActiveById(faultId);
  if (!hit) return false;
  // Build a minimal RiskCard-like object for dispatch (reuse fault state)
  const f = hit.fault;
  const card: RiskCard = {
    siteId:               f.cowId,
    ttNumber:             f.ttNumber ?? f.id,
    alarmType:            f.alarmType,
    alarmDescription:     f.alarm,
    assignedTime:         f.dispatchTime,
    powerConfiguration:   "",
    batteryBackupMinutes: f.backupRemainingMin,
    etaMinutes:           f.etaMinutes,
    batteryExpiry:        null,
    etaExpiry:            f.etaExpiry,
    severity:             f.severity === "critical" ? "critical" : "normal",
    foStaff:              f.foStaff ?? "",
    subcon:               f.subcon  ?? "",
    owner:                f.owner   ?? "",
  };
  await dispatchToAces(f, card);
  broadcast();
  return true;
}

/** Manually override the status of a fault. Returns true if found. */
export function manualSetStatus(faultId: string, status: FaultStatus): boolean {
  const hit = findActiveById(faultId);
  if (!hit) return false;
  const now = Date.now();
  const next: FaultRecord = {
    ...hit.fault,
    status,
    arrivedAt:  (status === "Arrived" || status === "Working" || status === "Resolved" || status === "Closed")
                 ? (hit.fault.arrivedAt ?? now) : hit.fault.arrivedAt,
    resolvedAt: (status === "Resolved" || status === "Closed")
                 ? (hit.fault.resolvedAt ?? now) : hit.fault.resolvedAt,
  };
  if (status === "Closed") {
    activeFaults.delete(hit.siteId);
    _siteToFault.delete(hit.siteId);
    closedFaults.set(next.id, { ...next, closedAt: now });
    setTimeout(() => closedFaults.delete(next.id), 24 * 3_600_000);
  } else {
    activeFaults.set(hit.siteId, next);
  }
  broadcast();
  return true;
}

export async function startFaultEngine() {
  await loadSiteCoords();
  await poll();
  setInterval(poll, 15_000);
  logger.info("Fault engine started");
}
