import path from "node:path";
import * as XLSX from "xlsx";
import { logger } from "./logger";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SiteRecord {
  siteId: string;
  powerSource: string;          // raw code: SB, DG, SG, etc.
  powerConfiguration: string;   // human label
  batteryBackupMinutes: number | null;
}

// ── Power source code → human label ──────────────────────────────────────────
function powerLabel(code: string): string {
  const c = (code ?? "").toUpperCase().trim();
  if (c === "SG") return "Commercial + Standby Generator";
  if (c === "SB") return "Commercial + Standby Battery";
  if (c === "CB") return "Commercial + Standby Battery";
  if (c === "DG") return "Diesel Generator Only";
  return c || "Unknown";
}

// ── Parse "1 hr 15 min" → 75, "2 hr" → 120, "45 min" → 45 ──────────────────
function parseBatteryTime(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.toString().trim();
  const hrMatch  = s.match(/(\d+)\s*hr/i);
  const minMatch = s.match(/(\d+)\s*min/i);
  const hrs  = hrMatch  ? parseInt(hrMatch[1],  10) : 0;
  const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
  const total = hrs * 60 + mins;
  return total > 0 ? total : null;
}

// ── Load and parse the Excel reference sheet ─────────────────────────────────
const BATT_COL = "Batteries Strings MAX useful Time\r\nHours";
const DATA_PATH = path.resolve(process.cwd(), "data", "cows-list.xlsx");

let _cache: Map<string, SiteRecord> | null = null;

export function getSiteData(): Map<string, SiteRecord> {
  if (_cache) return _cache;

  try {
    const wb   = XLSX.readFile(DATA_PATH);
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

    _cache = new Map();
    for (const row of rows) {
      const siteId = ((row["COW ID "] ?? row["COW ID"]) ?? "").toString().trim();
      if (!siteId) continue;
      const pwrCode = (row["Power Source"] ?? "").toString().trim();
      const battRaw = (row[BATT_COL] ?? null) as string | null;
      _cache.set(siteId, {
        siteId,
        powerSource: pwrCode,
        powerConfiguration: powerLabel(pwrCode),
        batteryBackupMinutes: parseBatteryTime(battRaw),
      });
    }
    logger.info({ count: _cache.size }, "Site reference data loaded from Excel");
  } catch (err: any) {
    logger.error({ err }, "Failed to load site reference Excel — battery/power data will be unavailable");
    _cache = new Map();
  }

  return _cache;
}
