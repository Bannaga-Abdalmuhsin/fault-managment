import path from "node:path";
import ExcelJS from "exceljs";
import { logger } from "./logger";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SiteRecord {
  siteId: string;
  powerSource: string;
  powerConfiguration: string;
  batteryBackupMinutes: number | null;
}

// ── Power source code → human label ──────────────────────────────────────────
function powerLabel(code: string): string {
  const c = (code ?? "").toUpperCase().trim();
  if (c === "SG") return "Commercial + Standby Generator";
  if (c === "SB" || c === "CB") return "Commercial + Standby Battery";
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

// ── Column normalisation ──────────────────────────────────────────────────────
function norm(s: unknown): string {
  return String(s ?? "").replace(/[\r\n\s]+/g, " ").trim().toLowerCase();
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const DATA_PATH = path.resolve(process.cwd(), "data", "cows-list.xlsx");
let _cache: Map<string, SiteRecord> = new Map();
let _ready = false;

// Pre-load at module init (fire-and-forget; warmUp() can be awaited explicitly)
const _loading: Promise<void> = (async () => {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(DATA_PATH);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("No worksheets found in cows-list.xlsx");

    // Map header → column index
    const colMap: Record<string, number> = {};
    ws.getRow(1).eachCell((cell, col) => { colMap[norm(cell.value)] = col; });

    const cowIdCol = colMap["cow id"] ?? colMap["cow id "] ?? 0;
    const pwrCol   = colMap["power source"] ?? 0;
    const battCol  = colMap["batteries strings max useful time hours"] ?? 0;

    const result = new Map<string, SiteRecord>();
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1 || !cowIdCol) return;
      const siteId = String(row.getCell(cowIdCol).value ?? "").trim();
      if (!siteId) return;
      const pwrCode = pwrCol  ? String(row.getCell(pwrCol).value  ?? "").trim() : "";
      const battRaw = battCol ? String(row.getCell(battCol).value ?? "").trim() : null;
      result.set(siteId, {
        siteId,
        powerSource:          pwrCode,
        powerConfiguration:   powerLabel(pwrCode),
        batteryBackupMinutes: parseBatteryTime(battRaw || null),
      });
    });

    _cache = result;
    _ready = true;
    logger.info({ count: _cache.size }, "Site reference data loaded from Excel");
  } catch (err: any) {
    logger.error({ err }, "Failed to load site reference Excel — battery/power data unavailable");
    _ready = true;
  }
})();

/** Await this before starting the risk engine to ensure data is pre-loaded. */
export async function warmUp(): Promise<void> {
  return _loading;
}

/** Synchronous accessor — returns cached data (empty until warmUp resolves). */
export function getSiteData(): Map<string, SiteRecord> {
  return _cache;
}
