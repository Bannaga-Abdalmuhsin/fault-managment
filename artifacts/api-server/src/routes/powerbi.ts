import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const TENANT_ID    = (process.env.PBI_TENANT_ID    ?? "").trim();
const CLIENT_ID    = (process.env.PBI_CLIENT_ID    ?? "").trim();
const CLIENT_SECRET = (process.env.PBI_CLIENT_SECRET ?? "").trim();
const WORKSPACE_ID = (process.env.PBI_WORKSPACE_ID ?? "").trim();
const DATASET_ID   = (process.env.PBI_DATASET_ID   ?? "").trim();

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: "https://analysis.windows.net/powerbi/api/.default",
      }),
    }
  );
  const data = await res.json() as { access_token: string; expires_in: number };
  if (!data.access_token) throw new Error("Failed to obtain PBI token");
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function dax(query: string) {
  const token = await getToken();
  const res = await fetch(
    `https://api.powerbi.com/v1.0/myorg/groups/${WORKSPACE_ID}/datasets/${DATASET_ID}/executeQueries`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ queries: [{ query }], serializerSettings: { includeNulls: true } }),
    }
  );
  const data = await res.json() as any;
  if (data.error) throw new Error(data.error.message ?? JSON.stringify(data.error));
  return data.results?.[0]?.tables?.[0]?.rows ?? [];
}

// ─── /api/pbi/sites ──────────────────────────────────────────────────────────
// Returns HAJJ-only COW sites (WR-HAJJ region) with lat/lon, status, label
router.get("/pbi/sites", async (req, res) => {
  try {
    const rows = await dax(`
      EVALUATE
      SELECTCOLUMNS(
        FILTER(DB, DB[Region] = "WR-HAJJ"),
        "siteId",        DB[Site ID],
        "region",        DB[Region],
        "zone",          DB[District],
        "technology",    DB[Technology],
        "siteLabel",     DB[Site label],
        "vendor",        DB[Vendor],
        "latitude",      DB[Lattitude],
        "longitude",     DB[Longitude],
        "status",        DB[MSC ID],
        "pmpStatus",     DB[PMP Status],
        "powerConfig",   DB[Power Configration],
        "chain",         DB[Chain],
        "has2G",         DB[2G],
        "has4G",         DB[4G],
        "has5G",         DB[5G]
      )
    `);
    // Normalise status: "ON-AIR" → operational, anything else → offline
    const sites = rows.map((r: any) => {
      const mscId = (r["[status]"] ?? "").toString().toUpperCase();
      const pmp   = (r["[pmpStatus]"] ?? "").toString().toUpperCase();
      const operational = mscId === "ON-AIR" && pmp !== "DOWN";
      return {
        id: r["[siteId]"],
        name: r["[siteId]"],
        region: r["[region]"],
        zone: r["[zone]"],      // district value e.g. "MAKKAH", "Riyadh District"
        technology: r["[technology]"],
        siteLabel: r["[siteLabel]"],
        vendor: r["[vendor]"],
        latitude: r["[latitude]"],
        longitude: r["[longitude]"],
        status: operational ? "operational" : "offline",
        pmpStatus: r["[pmpStatus]"],
        powerConfig: r["[powerConfig]"],
        chain: r["[chain]"],
        has2G: r["[has2G]"] === 1,
        has4G: r["[has4G]"] === 1,
        has5G: r["[has5G]"] === 1,
      };
    });
    res.json(sites);
  } catch (err: any) {
    logger.error({ err }, "PBI sites error");
    res.status(500).json({ error: err.message });
  }
});

// ─── /api/pbi/tickets/power ───────────────────────────────────────────────────
// Power outage tickets — WR-HAJJ only, open / in-progress
router.get("/pbi/tickets/power", async (req, res) => {
  try {
    const rows = await dax(`
      EVALUATE
      SELECTCOLUMNS(
        FILTER('Input Record',
          'Input Record'[Status] <> "Closed" &&
          'Input Record'[Region] = "WR-HAJJ"
        ),
        "ttNumber",     'Input Record'[TT Number],
        "siteId",       'Input Record'[SITE ID],
        "startDate",    'Input Record'[Start Date],
        "status",       'Input Record'[Status],
        "severity",     'Input Record'[TT Severity],
        "siteLabel",    'Input Record'[Site label],
        "chain",        'Input Record'[Chain],
        "district",     'Input Record'[District],
        "subcon",       'Input Record'[SubCon],
        "region",       'Input Record'[Region],
        "issue",        'Input Record'[Issue],
        "foStaff",      'Input Record'[FO Staff],
        "description",  'Input Record'[Problem Description],
        "actionTaken",  'Input Record'[Action Taken],
        "owner",        'Input Record'[Owner (Responsible)],
        "powerSource",  'Input Record'[Power Source],
        "durationMin",  'Input Record'[Duration NSA (Min)],
        "totalDuration",'Input Record'[Total Duration NSA(D-H-M)],
        "slaBreach",    'Input Record'[Time to SLA Breach (NSA)]
      )
    `);
    const tickets = rows.map((r: any) => ({
      id: r["[ttNumber]"],
      ttNumber: r["[ttNumber]"],
      siteId: r["[siteId]"],
      siteName: r["[siteId]"],
      type: "power",
      status: mapStatus(r["[status]"]),
      priority: mapSeverity(r["[severity]"]),
      title: r["[issue]"] ?? r["[description]"] ?? "Power Issue",
      description: r["[description]"],
      actionTaken: r["[actionTaken]"],
      assignedTo: r["[foStaff]"],
      owner: r["[owner]"],
      powerSource: r["[powerSource]"],
      durationMin: r["[durationMin]"],
      totalDuration: r["[totalDuration]"],
      slaBreach: r["[slaBreach]"],
      siteLabel: r["[siteLabel]"],
      region: r["[region]"],
      subcon: r["[subcon]"],
      createdAt: r["[startDate]"],
    }));
    res.json(tickets);
  } catch (err: any) {
    logger.error({ err }, "PBI power tickets error");
    res.status(500).json({ error: err.message });
  }
});

// ─── /api/pbi/tickets/telecom ─────────────────────────────────────────────────
// NSA outage tickets from SIR table — WR-HAJJ only, open / in-progress
router.get("/pbi/tickets/telecom", async (req, res) => {
  try {
    const rows = await dax(`
      EVALUATE
      SELECTCOLUMNS(
        FILTER(SIR,
          SIR[Status] <> "Closed" &&
          SIR[Region] = "WR-HAJJ"
        ),
        "ttNumber",      SIR[TT Number],
        "siteId",        SIR[Site],
        "startDate",     SIR[OOS Start Date],
        "status",        SIR[Status],
        "severity",      SIR[TT Severity],
        "siteLabel",     SIR[Site label],
        "area",          SIR[Area],
        "region",        SIR[Region],
        "faultType",     SIR[Fault Type],
        "foStaff",       SIR[FO Staff],
        "description",   SIR[Alarms Description],
        "actionTaken",   SIR[Action Taken],
        "owner",         SIR[Owner],
        "powerSource",   SIR[Power source],
        "durationMin",   SIR[Duration (Min)],
        "totalDuration", SIR[Total Duration],
        "slaBreach",     SIR[Time to SLA Breach],
        "batteryStatus", SIR[Battery Status],
        "summary",       SIR[SUMMARY]
      )
    `);
    const tickets = rows.map((r: any) => ({
      id:            r["[ttNumber]"],
      ttNumber:      r["[ttNumber]"],
      siteId:        r["[siteId]"],
      siteName:      r["[siteId]"],
      type:          "telecom" as const,
      status:        mapStatus(r["[status]"]),
      priority:      mapSeverity(r["[severity]"]),
      severity:      r["[severity]"] ?? "",
      title:         r["[faultType]"] ?? r["[description]"] ?? "NSA Issue",
      description:   r["[description]"] ?? r["[alarmsDesc]"] ?? "",
      alarmsDesc:    r["[alarmsDesc]"] ?? "",
      actionTaken:   r["[actionTaken]"] ?? "",
      comment:       r["[summary]"] ?? "",
      summary:       r["[summary]"] ?? "",
      assignedTo:    r["[foStaff]"] ?? "",
      owner:         r["[owner]"] ?? "",
      chain:         r["[chain]"] ?? "",
      district:      r["[area]"] ?? "",
      siteLabel:     r["[siteLabel]"] ?? "",
      area:          r["[area]"] ?? "",
      region:        r["[region]"] ?? "",
      powerSource:   r["[powerSource]"] ?? "",
      remainingSAL:  r["[durationMin]"] ?? null,
      durationMin:   r["[durationMin]"] ?? null,
      totalDuration: r["[totalDuration]"] ?? "",
      slaBreach:     r["[slaBreach]"] ?? "",
      batteryStatus: r["[batteryStatus]"] ?? "",
      createdAt:     r["[startDate]"] ?? "",
    }));
    res.json(tickets);
  } catch (err: any) {
    logger.error({ err }, "PBI telecom tickets error");
    res.status(500).json({ error: err.message });
  }
});

// ─── /api/pbi/zones ──────────────────────────────────────────────────────────
// Returns per-district availability for WR-HAJJ sites
router.get("/pbi/zones", async (req, res) => {
  try {
    const rows = await dax(`
      EVALUATE
      SUMMARIZECOLUMNS(
        DB[District],
        FILTER(DB, DB[Region] = "WR-HAJJ"),
        "total", COUNTROWS(DB),
        "onAir", CALCULATE(COUNTROWS(DB), DB[MSC ID] = "ON-AIR")
      )
    `);
    const zones = rows.map((r: any) => ({
      district: r["DB[District]"] ?? r["[District]"] ?? "",
      total:    Number(r["[total]"] ?? 0),
      onAir:    Number(r["[onAir]"] ?? 0),
    }));
    res.json(zones);
  } catch (err: any) {
    logger.error({ err }, "PBI zones error");
    res.status(500).json({ error: err.message });
  }
});

// ─── /api/pbi/kpis ───────────────────────────────────────────────────────────
// Aggregated KPIs for the dashboard
router.get("/pbi/kpis", async (req, res) => {
  try {
    const [sitesRows, powerRows, telecomRows] = await Promise.all([
      dax(`
        EVALUATE
        ROW(
          "total",       CALCULATE(COUNTROWS(DB), DB[Region] = "WR-HAJJ"),
          "onAir",       CALCULATE(COUNTROWS(DB), DB[Region] = "WR-HAJJ", DB[MSC ID] = "ON-AIR"),
          "vvvip",       CALCULATE(COUNTROWS(DB), DB[Region] = "WR-HAJJ", DB[Site label] = "VVVIP"),
          "vvip",        CALCULATE(COUNTROWS(DB), DB[Region] = "WR-HAJJ", DB[Site label] = "VVIP"),
          "vip",         CALCULATE(COUNTROWS(DB), DB[Region] = "WR-HAJJ", DB[Site label] = "VIP"),
          "normal",      CALCULATE(COUNTROWS(DB), DB[Region] = "WR-HAJJ", DB[Site label] = "Normal"),
          "with2G",      CALCULATE(COUNTROWS(DB), DB[Region] = "WR-HAJJ", DB[2G] = 1),
          "with4G",      CALCULATE(COUNTROWS(DB), DB[Region] = "WR-HAJJ", DB[4G] = 1),
          "with5G",      CALCULATE(COUNTROWS(DB), DB[Region] = "WR-HAJJ", DB[5G] = 1)
        )
      `),
      dax(`
        EVALUATE
        ROW(
          "open",   CALCULATE(COUNTROWS('Input Record'), 'Input Record'[Status] <> "Closed"),
          "closed", CALCULATE(COUNTROWS('Input Record'), 'Input Record'[Status] = "Closed"),
          "high",   CALCULATE(COUNTROWS('Input Record'), 'Input Record'[Status] <> "Closed", 'Input Record'[TT Severity] = "High"),
          "critical",CALCULATE(COUNTROWS('Input Record'), 'Input Record'[Status] <> "Closed", 'Input Record'[TT Severity] = "Critical")
        )
      `),
      dax(`
        EVALUATE
        ROW(
          "open",   CALCULATE(COUNTROWS(SIR), SIR[Status] <> "Closed"),
          "closed", CALCULATE(COUNTROWS(SIR), SIR[Status] = "Closed"),
          "high",   CALCULATE(COUNTROWS(SIR), SIR[Status] <> "Closed", SIR[TT Severity] = "High"),
          "critical",CALCULATE(COUNTROWS(SIR), SIR[Status] <> "Closed", SIR[TT Severity] = "Critical")
        )
      `),
    ]);

    const s = sitesRows[0] ?? {};
    const p = powerRows[0] ?? {};
    const t = telecomRows[0] ?? {};

    const total  = s["[total]"]  ?? 0;
    const onAir  = s["[onAir]"]  ?? 0;
    const offAir = total - onAir;

    res.json({
      sites: {
        total, onAir, offAir,
        availability: total ? Math.round((onAir / total) * 10000) / 100 : 100,
        vvvip:  s["[vvvip]"]  ?? 0,
        vvip:   s["[vvip]"]   ?? 0,
        vip:    s["[vip]"]    ?? 0,
        normal: s["[normal]"] ?? 0,
        with2G: s["[with2G]"] ?? 0,
        with4G: s["[with4G]"] ?? 0,
        with5G: s["[with5G]"] ?? 0,
      },
      power: {
        open:     p["[open]"]     ?? 0,
        closed:   p["[closed]"]   ?? 0,
        high:     p["[high]"]     ?? 0,
        critical: p["[critical]"] ?? 0,
      },
      telecom: {
        open:     t["[open]"]     ?? 0,
        closed:   t["[closed]"]   ?? 0,
        high:     t["[high]"]     ?? 0,
        critical: t["[critical]"] ?? 0,
      },
    });
  } catch (err: any) {
    logger.error({ err }, "PBI KPIs error");
    res.status(500).json({ error: err.message });
  }
});

// ─── helpers ─────────────────────────────────────────────────────────────────
function mapStatus(s: string | null): string {
  if (!s) return "open";
  const v = s.toLowerCase();
  if (v === "closed") return "closed";
  if (v.includes("progress") || v.includes("assigned")) return "in_progress";
  return "open";
}

function mapSeverity(s: string | null): string {
  if (!s) return "medium";
  const v = s.toLowerCase();
  if (v === "critical") return "critical";
  if (v === "high")     return "high";
  if (v === "low")      return "low";
  return "medium";
}

export default router;
