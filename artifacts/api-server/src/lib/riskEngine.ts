import { dax } from "./pbi";
import { getSiteDataAsync } from "./siteData";
import { logger } from "./logger";
import type { Response } from "express";

// ── Alarm type classifier ─────────────────────────────────────────────────────
const POWER_KEYWORDS = ["power", "high temp", "battery", "rectifier", "generator", "mains", "outage", "fuel", "ups"];
function isPowerAlarm(text: string): boolean {
  const lower = (text ?? "").toLowerCase();
  return POWER_KEYWORDS.some(kw => lower.includes(kw));
}

// ── RiskCard type ─────────────────────────────────────────────────────────────
export interface RiskCard {
  siteId: string;
  alarmType: "power" | "nsa";
  alarmDescription: string;
  assignedTime: number;
  powerConfiguration: string;
  batteryBackupMinutes: number | null;
  etaMinutes: number;
  batteryExpiry: number | null;
  etaExpiry: number | null;
  severity: "critical" | "normal" | "cleared";
  clearedAt?: number;
}

// ── State ─────────────────────────────────────────────────────────────────────
const activeRiskCards = new Map<string, RiskCard>();
const sseClients = new Set<Response>();

// ── SSE helpers ───────────────────────────────────────────────────────────────
export function addSseClient(res: Response) {
  sseClients.add(res);
  const payload = JSON.stringify([...activeRiskCards.values()]);
  res.write(`data: ${payload}\n\n`);
}

export function removeSseClient(res: Response) {
  sseClients.delete(res);
}

function broadcast() {
  const payload = JSON.stringify([...activeRiskCards.values()]);
  const msg = `data: ${payload}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

// ── Poll engine ───────────────────────────────────────────────────────────────
async function poll() {
  try {
    // 1. Fetch open tickets + area data from PBI in parallel
    const [ticketRows, areaRows] = await Promise.all([
      dax(`
        EVALUATE
        VAR _hajjSites = SELECTCOLUMNS(FILTER(DB, DB[Region] = "WR-HAJJ"), "sid", DB[Site ID])
        RETURN
        SELECTCOLUMNS(
          FILTER('Input Record',
            'Input Record'[Status] <> "Closed" &&
            CONTAINS(_hajjSites, [sid], 'Input Record'[SITE ID])
          ),
          "siteId",       'Input Record'[SITE ID],
          "startDate",    'Input Record'[Start Date],
          "assignedTime", 'Input Record'[Assigned Time],
          "issue",        'Input Record'[Issue],
          "description",  'Input Record'[Problem Description]
        )
      `),
      dax(`
        EVALUATE
        SELECTCOLUMNS(
          FILTER(DB, DB[Region] = "WR-HAJJ"),
          "siteId", DB[Site ID],
          "area",   DB[Column13]
        )
      `),
    ]);

    // 2. Area map from PBI
    const areaMap = new Map<string, string>();
    for (const r of areaRows) {
      const sid  = (r["[siteId]"] ?? "").toString().trim();
      const area = (r["[area]"]   ?? "").toString().trim();
      if (sid) areaMap.set(sid, area);
    }

    // 3. Site reference data from Excel (power source + battery backup)
    const siteData = await getSiteDataAsync();

    // 4. Build updated card map
    const incoming = new Set<string>();
    for (const r of ticketRows) {
      const siteId = (r["[siteId]"] ?? "").toString().trim();
      if (!siteId) continue;

      // Parse assigned time — combine Start Date + Assigned Time (Excel epoch time-only)
      const datePart = (r["[startDate]"] ?? "").toString().split("T")[0];
      const timePart = (r["[assignedTime]"] ?? "").toString().split("T")[1] ?? "";
      const assignedIso = datePart && timePart
        ? `${datePart}T${timePart}+03:00`
        : (r["[startDate]"] ?? "").toString();
      const assignedMs = Date.parse(assignedIso) || Date.now();

      // Preserve original assignedTime (prevents timer reset on re-poll)
      const existing = activeRiskCards.get(siteId);
      const assignedTime = (existing && existing.severity !== "cleared")
        ? existing.assignedTime : assignedMs;

      // Power config + battery from Excel reference sheet
      const site = siteData.get(siteId);
      const powerConfiguration  = site?.powerConfiguration  ?? "Unknown";
      const batteryBackupMinutes = site?.batteryBackupMinutes ?? null;

      // ETA: Makkah Remote = 30 min, all others (Arafat / Muzdalifah / Mina / etc.) = 15 min
      const area = areaMap.get(siteId) ?? "";
      const etaMinutes = area.toLowerCase().includes("makkah remote") ? 30 : 15;

      // Expiry timestamps
      const batteryExpiry = batteryBackupMinutes != null
        ? assignedTime + batteryBackupMinutes * 60_000 : null;
      const etaExpiry = assignedTime + etaMinutes * 60_000;

      // Severity: critical if battery depletes before ETA arrives
      const now = Date.now();
      const battRemain = batteryExpiry != null ? batteryExpiry - now : Infinity;
      const severity: RiskCard["severity"] = battRemain < (etaExpiry - now) ? "critical" : "normal";

      const alarmDescription = (r["[description]"] ?? r["[issue]"] ?? "Open Ticket").toString();
      const alarmType: RiskCard["alarmType"] = isPowerAlarm(alarmDescription) ? "power" : "nsa";

      activeRiskCards.set(siteId, {
        siteId, alarmType, alarmDescription, assignedTime,
        powerConfiguration, batteryBackupMinutes,
        etaMinutes, batteryExpiry, etaExpiry, severity,
      });
      incoming.add(siteId);
    }

    // 5. Mark cleared cards
    const now = Date.now();
    for (const [siteId, card] of activeRiskCards) {
      if (!incoming.has(siteId) && card.severity !== "cleared") {
        activeRiskCards.set(siteId, { ...card, severity: "cleared", clearedAt: now });
        setTimeout(() => { activeRiskCards.delete(siteId); broadcast(); }, 5_000);
      }
    }

    broadcast();
  } catch (err: any) {
    logger.error({ err }, "Risk engine poll error");
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function getActiveCards(): RiskCard[] {
  return [...activeRiskCards.values()];
}

export function startRiskEngine() {
  poll();
  setInterval(poll, 60_000);
  logger.info("Risk engine started");
}
