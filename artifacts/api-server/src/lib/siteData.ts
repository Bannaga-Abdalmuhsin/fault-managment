import path from "node:path";
import ExcelJS from "exceljs";
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

// ── Cell value → string helper ────────────────────────────────────────────────
function cellStr(val: ExcelJS.CellValue): string {
  if (val == null) return "";
  if (typeof val === "object" && "text" in (val as Record<string, unknown>))
    return String((val as Record<string, unknown>).text).trim();
  return String(val).trim();
}

// ── Load and parse the Excel reference sheet ─────────────────────────────────
const BATT_COL = "Batteries Strings MAX useful Time\r\nHours";
const DATA_PATH = path.resolve(process.cwd(), "data", "cows-list.xlsx");

let _cache: Map<string, SiteRecord> | null = null;

export async function getSiteDataAsync(): Promise<Map<string, SiteRecord>> {
  if (_cache) return _cache;

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(DATA_PATH);

    const ws = wb.worksheets[0];
    if (!ws) throw new Error("No worksheet found in Excel file");

    // Build header → column index map from row 1
    const headers: Record<string, number> = {};
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell, colNum) => {
      const key = cellStr(cell.value).trim();
      if (key) headers[key] = colNum;
    });

    // Find the battery column (key may include \r\n)
    const battColNum = headers[BATT_COL]
      ?? Object.entries(headers).find(([k]) => k.includes("Batteries Strings MAX"))?.[1]
      ?? null;

    const cowIdCol = headers["COW ID "] ?? headers["COW ID"] ?? null;
    const pwrSrcCol = headers["Power Source"] ?? null;

    _cache = new Map();

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      const siteId = cowIdCol ? cellStr(row.getCell(cowIdCol).value).trim() : "";
      if (!siteId) return;
      const pwrCode = pwrSrcCol ? cellStr(row.getCell(pwrSrcCol).value).trim() : "";
      const battRaw = battColNum ? cellStr(row.getCell(battColNum).value) : null;
      _cache!.set(siteId, {
        siteId,
        powerSource: pwrCode,
        powerConfiguration: powerLabel(pwrCode),
        batteryBackupMinutes: parseBatteryTime(battRaw),
      });
    });

    logger.info({ count: _cache.size }, "Site reference data loaded from Excel");
  } catch (err: any) {
    logger.error({ err }, "Failed to load site reference Excel — battery/power data will be unavailable");
    _cache = new Map();
  }

  return _cache;
}

// ── Synchronous cache accessor (call after getSiteDataAsync resolves) ─────────
export function getSiteData(): Map<string, SiteRecord> {
  return _cache ?? new Map();
}
