import { dax } from "./pbi";
import { getSiteData } from "./siteData";
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
  ttNumber: string;
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
  // Field team from PBI
  foStaff:  string;
  subcon:   string;
  owner:    string;
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
    // 1. Fetch open tickets from both tables + area data in parallel
    const [powerRows, nsaRows, areaRows] = await Promise.all([
      // Power tickets from Input Record
      dax(`
        EVALUATE
        VAR _hajjSites = SELECTCOLUMNS(FILTER(DB, DB[Region] = "WR-HAJJ"), "sid", DB[Site ID])
        RETURN
        SELECTCOLUMNS(
          FILTER('Input Record',
            'Input Record'[Status] <> "Closed" &&
            CONTAINS(_hajjSites, [sid], 'Input Record'[SITE ID])
          ),
          "ttNumber",     'Input Record'[TT Number],
          "siteId",       'Input Record'[SITE ID],
          "startDate",    'Input Record'[Start Date],
          "assignedTime", 'Input Record'[Assigned Time],
          "issue",        'Input Record'[Issue],
          "description",  'Input Record'[Problem Description],
          "foStaff",      'Input Record'[FO Staff],
          "subcon",       'Input Record'[SubCon],
          "owner",        'Input Record'[Owner (Responsible)]
        )
      `),
      // NSA / telecom tickets from SIR (Telecom COW Risk dashboard)
      dax(`
        EVALUATE
        VAR _hajjSites = SELECTCOLUMNS(FILTER(DB, DB[Region] = "WR-HAJJ"), "sid", DB[Site ID])
        RETURN
        SELECTCOLUMNS(
          FILTER(SIR,
            SIR[Status] <> "Closed" &&
            CONTAINS(_hajjSites, [sid], SIR[Site])
          ),
          "ttNumber",    SIR[TT Number],
          "siteId",      SIR[Site],
          "startDate",   SIR[OOS Start Date],
          "description", SIR[Alarms Description],
          "faultType",   SIR[Fault Type],
          "foStaff",     SIR[FO Staff],
          "owner",       SIR[Owner],
          "area",        SIR[Area]
        )
      `),
      // Area lookup from site master
      dax(`
        EVALUATE
        SELECTCOLUMNS(
          FILTER(DB, DB[Region] = "WR-HAJJ"),
          "siteId", DB[Site ID],
          "area",   DB[Column13]
        )
      `),
    ]);

    // 2. Area map from PBI (DB master — used as fallback)
    const areaMap = new Map<string, string>();
    for (const r of areaRows) {
      const sid  = (r["[siteId]"] ?? "").toString().trim();
      const area = (r["[area]"]   ?? "").toString().trim();
      if (sid) areaMap.set(sid, area);
    }

    // 3. Site reference data from Excel (power source + battery backup)
    const siteData = getSiteData();

    // ── Helper: build a RiskCard from a raw PBI row ───────────────────────────
    function buildCard(
      r: Record<string, unknown>,
      alarmType: RiskCard["alarmType"],
      opts: { areaOverride?: string; subcon?: string },
    ): RiskCard | null {
      const siteId = (r["[siteId]"] ?? "").toString().trim();
      if (!siteId) return null;

      // Parse assigned time
      const datePart = (r["[startDate]"] ?? "").toString().split("T")[0];
      const timePart = (r["[assignedTime]"] ?? r["[startDate]"] ?? "").toString().split("T")[1] ?? "";
      const assignedIso = datePart && timePart
        ? `${datePart}T${timePart}+03:00`
        : (r["[startDate]"] ?? "").toString();
      const assignedMs = Date.parse(assignedIso) || Date.now();

      const existing = activeRiskCards.get(siteId);
      const assignedTime = (existing && existing.severity !== "cleared")
        ? existing.assignedTime : assignedMs;

      const site = siteData.get(siteId);
      const powerConfiguration   = site?.powerConfiguration   ?? "Unknown";
      const batteryBackupMinutes = site?.batteryBackupMinutes ?? null;

      const area       = opts.areaOverride || areaMap.get(siteId) || "";
      const etaMinutes = area.toLowerCase().includes("makkah remote") ? 30 : 15;

      const batteryExpiry = batteryBackupMinutes != null
        ? assignedTime + batteryBackupMinutes * 60_000 : null;
      const etaExpiry = assignedTime + etaMinutes * 60_000;

      const now        = Date.now();
      const battRemain = batteryExpiry != null ? batteryExpiry - now : Infinity;
      const severity: RiskCard["severity"] = battRemain < (etaExpiry - now) ? "critical" : "normal";

      const alarmDescription = (
        r["[description]"] ?? r["[faultType]"] ?? r["[issue]"] ?? "Open Ticket"
      ).toString();

      return {
        siteId,
        ttNumber:           (r["[ttNumber]"] ?? "").toString().trim(),
        alarmType,
        alarmDescription,
        assignedTime,
        powerConfiguration,
        batteryBackupMinutes,
        etaMinutes,
        batteryExpiry,
        etaExpiry,
        severity,
        foStaff: (r["[foStaff]"] ?? "").toString().trim(),
        subcon:  (opts.subcon    ?? "").toString().trim(),
        owner:   (r["[owner]"]   ?? "").toString().trim(),
      };
    }

    // 4. Build updated card map — NSA first, then power (power overwrites if same site)
    const incoming = new Set<string>();

    // NSA tickets (SIR table — Telecom COW Risk dashboard)
    for (const r of nsaRows) {
      const areaOverride = (r["[area]"] ?? "").toString().trim();
      const card = buildCard(r, "nsa", { areaOverride });
      if (!card) continue;
      activeRiskCards.set(card.siteId, card);
      incoming.add(card.siteId);
    }

    // Power tickets (Input Record) — overwrites NSA if same site
    for (const r of powerRows) {
      const subcon = (r["[subcon]"] ?? "").toString().trim();
      const alarmDescription = (r["[description]"] ?? r["[issue]"] ?? "").toString();
      const alarmType: RiskCard["alarmType"] = isPowerAlarm(alarmDescription) ? "power" : "nsa";
      const card = buildCard(r, alarmType, { subcon });
      if (!card) continue;
      activeRiskCards.set(card.siteId, card);
      incoming.add(card.siteId);
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
