import { db, sitesTable } from "@workspace/db";
import { dax } from "./pbi";
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
  assignedTime: number;          // ms since epoch (from PBI Assigned Time)
  powerConfiguration: string;
  batteryBackupMinutes: number | null;
  etaMinutes: number;
  batteryExpiry: number | null;  // ms — assignedTime + batteryBackupMinutes
  etaExpiry: number | null;      // ms — assignedTime + etaMinutes
  severity: "critical" | "normal" | "cleared";
  clearedAt?: number;            // ms — when cleared (for auto-removal)
}

// ── State ─────────────────────────────────────────────────────────────────────
const activeRiskCards = new Map<string, RiskCard>();
const sseClients = new Set<Response>();

// ── SSE helpers ───────────────────────────────────────────────────────────────
export function addSseClient(res: Response) {
  sseClients.add(res);
  // Send current state immediately on connect
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
    // 1. Fetch open power tickets for WR-HAJJ
    const [ticketRows, siteAreaRows] = await Promise.all([
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
          "description",  'Input Record'[Problem Description],
          "powerSource",  'Input Record'[Power Source]
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

    // 2. DB power config lookup
    const dbSites = await db.select({
      name: sitesTable.name,
      powerConfig: sitesTable.powerConfig,
      batteryUsefulTimeHrs: sitesTable.batteryUsefulTimeHrs,
    }).from(sitesTable);
    const dbMap = new Map(dbSites.map(s => [s.name, s]));

    // 3. Area map for ETA
    const areaMap = new Map<string, string>();
    for (const r of siteAreaRows) {
      const sid  = (r["[siteId]"] ?? r["DB[Site ID]"] ?? "").toString();
      const area = (r["[area]"]   ?? r["DB[Column13]"] ?? "").toString();
      if (sid) areaMap.set(sid, area);
    }

    // 4. All open tickets — classify each as power or nsa
    // 5. Build updated card map
    const incoming = new Set<string>();
    for (const r of ticketRows) {
      const siteId = (r["[siteId]"] ?? "").toString();
      if (!siteId) continue;

      // Parse assignedAt — combine Start Date + Assigned Time (Excel epoch time-only)
      const datePart = (r["[startDate]"] ?? "").toString().split("T")[0];
      const timePart = (r["[assignedTime]"] ?? "").toString().split("T")[1] ?? "";
      const assignedIso = datePart && timePart
        ? `${datePart}T${timePart}+03:00`
        : (r["[startDate]"] ?? "").toString();
      const assignedMs = Date.parse(assignedIso) || Date.now();

      // Preserve original assignedTime if card already active (prevents timer reset)
      const existing = activeRiskCards.get(siteId);
      const assignedTime = (existing && existing.severity !== "cleared")
        ? existing.assignedTime
        : assignedMs;

      // Battery from local DB (batteryUsefulTimeHrs)
      const dbSite = dbMap.get(siteId);
      const batteryBackupMinutes = dbSite?.batteryUsefulTimeHrs != null
        ? Math.round(dbSite.batteryUsefulTimeHrs * 60)
        : null;

      // Power config label
      const cfgCode = (r["[powerSource]"] ?? "").toString().toUpperCase();
      const powerConfiguration = dbSite?.powerConfig
        ?? (cfgCode === "SG" ? "Commercial + Standby Generator"
          : cfgCode === "SB" ? "Commercial + Standby Battery"
          : cfgCode === "DG" ? "Commercial + Diesel Generator"
          : cfgCode || "Unknown");

      // ETA from area: Makkah Remote = 30 min; Arafat / Muzdalifah / Mina / others = 15 min
      const area = areaMap.get(siteId) ?? "";
      const etaMinutes = area.toLowerCase().includes("makkah remote") ? 30 : 15;

      // Expiry timestamps
      const batteryExpiry = batteryBackupMinutes != null
        ? assignedTime + batteryBackupMinutes * 60_000
        : null;
      const etaExpiry = assignedTime + etaMinutes * 60_000;

      // Severity: critical if battery depletes before ETA
      const now = Date.now();
      const battRemain = batteryExpiry != null ? batteryExpiry - now : Infinity;
      const etaRemain  = etaExpiry - now;
      const severity: RiskCard["severity"] = battRemain < etaRemain ? "critical" : "normal";

      const alarmDescription = (r["[description]"] ?? r["[issue]"] ?? "Open Ticket").toString();
      const alarmType: RiskCard["alarmType"] = isPowerAlarm(alarmDescription) ? "power" : "nsa";

      activeRiskCards.set(siteId, {
        siteId,
        alarmType,
        alarmDescription,
        assignedTime,
        powerConfiguration,
        batteryBackupMinutes,
        etaMinutes,
        batteryExpiry,
        etaExpiry,
        severity,
      });
      incoming.add(siteId);
    }

    // 6. Mark cleared — cards no longer in incoming set
    const now = Date.now();
    for (const [siteId, card] of activeRiskCards) {
      if (!incoming.has(siteId) && card.severity !== "cleared") {
        activeRiskCards.set(siteId, { ...card, severity: "cleared", clearedAt: now });
        // Auto-remove after 5 s
        setTimeout(() => {
          activeRiskCards.delete(siteId);
          broadcast();
        }, 5_000);
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
  poll();                                   // immediate first run
  setInterval(poll, 60_000);               // then every 60 s
  logger.info("Risk engine started");
}
