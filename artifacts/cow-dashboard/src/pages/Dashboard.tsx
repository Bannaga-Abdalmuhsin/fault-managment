import { useState, useEffect, useMemo, useCallback } from "react";
import Map3D from "@/components/Map3D";
import GaugeSvg from "@/components/Gauge";

// ─── Brand palette ─────────────────────────────────────────────────────────────
const P = {
  purple:      "#6B1FA2",
  purpleDark:  "#4B006E",
  purpleDeep:  "#1A0533",
  purpleMid:   "#5A1285",
  green:       "#38D4FF",
  greenDark:   "#0090BB",
  red:         "#EF4444",
  orange:      "#F59E0B",
  white:       "#ffffff",
  // Glass: rich purple tint, translucent
  glass:       "rgba(75, 0, 110, 0.84)",
  glassBorder: "rgba(200, 140, 255, 0.28)",
};

// ─── Hajj 1447 area → site mapping (from reference data) ──────────────────────
const SITE_AREA: Record<string, string> = {
  // Arafat (37)
  CWN022:"Arafat", CWN996:"Arafat", CWN092:"Arafat", CWN080:"Arafat",
  CWN960:"Arafat", CWN984:"Arafat", CWN076:"Arafat", CWN073:"Arafat",
  CWN038:"Arafat", CWN923:"Arafat", CWN072:"Arafat", CWN901:"Arafat",
  CWN020:"Arafat", CWN036:"Arafat", CWN085:"Arafat", CWN084:"Arafat",
  CWN087:"Arafat", CWN075:"Arafat", CWN015:"Arafat", CWN078:"Arafat",
  CWN083:"Arafat", CWN203:"Arafat", CWN212:"Arafat", CWN903:"Arafat",
  CWN906:"Arafat", CWN914:"Arafat", CWN951:"Arafat", CWN956:"Arafat",
  CWN980:"Arafat", CWN991:"Arafat", CWN050:"Arafat", CWN093:"Arafat",
  CWN001:"Arafat", CWN108:"Arafat", CWN008:"Arafat", CWN105:"Arafat",
  CWN102:"Arafat",
  // Muzdalifah (29)
  CWN213:"Muzdalifah", CWN208:"Muzdalifah", CWN099:"Muzdalifah",
  CWN955:"Muzdalifah", CWN062:"Muzdalifah", CWN907:"Muzdalifah",
  CWN101:"Muzdalifah", CWN915:"Muzdalifah", CWN997:"Muzdalifah",
  CWH318:"Muzdalifah", CWN922:"Muzdalifah", CWN300:"Muzdalifah",
  CWN992:"Muzdalifah", CWN206:"Muzdalifah", CWN205:"Muzdalifah",
  CWN004:"Muzdalifah", CWN068:"Muzdalifah", CWN074:"Muzdalifah",
  CWN089:"Muzdalifah", CWN202:"Muzdalifah", CWN214:"Muzdalifah",
  CWN301:"Muzdalifah", CWN079:"Muzdalifah", CWN032:"Muzdalifah",
  CWN972:"Muzdalifah", CWN211:"Muzdalifah", CWN104:"Muzdalifah",
  CWN021:"Muzdalifah", CWN066:"Muzdalifah",
  // Mina (10)
  CWN970:"Mina", CWN959:"Mina", CWN961:"Mina", CWN002:"Mina",
  CWN201:"Mina", CWN777:"Mina", CWN953:"Mina", CWN976:"Mina",
  CWN978:"Mina", CWN994:"Mina",
  // Hajj Support (15)
  COW761:"Hajj Support", CWN026:"Hajj Support", CWN053:"Hajj Support",
  CWN950:"Hajj Support", CWN962:"Hajj Support", COWTR01:"Hajj Support",
  COW062:"Hajj Support", COW514:"Hajj Support", COW539:"Hajj Support",
  COW610:"Hajj Support", COW666:"Hajj Support", COWTR02:"Hajj Support",
  COW780:"Hajj Support", COW762:"Hajj Support", CWN103:"Hajj Support",
  // Makka Remote (Miqat Alssail + Behaitah Checkpoint + Shoaibah Checkpoints)
  CWN967:"Makka Remote", CWN998:"Makka Remote", CWN081:"Makka Remote",
};
const AREA_LIST = ["Arafat","Muzdalifah","Mina","Hajj Support","Makka Remote"] as const;

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PbiSite {
  id: string; name: string; region: string; zone: string;
  siteLabel: string; latitude: number | null; longitude: number | null;
  status: "operational" | "offline";
}
interface PbiTicket {
  id: string; ttNumber: string; siteId: string; siteName: string;
  type: "power" | "telecom"; status: string; priority: string;
  title: string; description: string; actionTaken: string;
  assignedTo: string; durationMin: number | null;
  totalDuration: string; slaBreach: string; createdAt: string;
  // NSA-specific fields
  chain?: string | number; district?: string; siteLabel?: string;
  severity?: string; remainingSAL?: number | null; comment?: string;
}
interface PbiKpis {
  sites: { total: number; onAir: number; offAir: number; availability: number;
    vvvip: number; vvip: number; vip: number; normal: number; };
  power:   { open: number; closed: number; high: number; critical: number };
  telecom: { open: number; closed: number; high: number; critical: number };
}
interface PbiZone { district: string; total: number; onAir: number; }

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Data hook ─────────────────────────────────────────────────────────────────
function usePbi<T>(path: string, interval = 60_000) {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api${path}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch { /* keep last */ }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => {
    load();
    const id = setInterval(load, interval);
    return () => clearInterval(id);
  }, [load, interval]);
  return { data, loading };
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return now;
}

// ─── Purple Glass panel ────────────────────────────────────────────────────────
function Glass({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: P.glass,
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: `1px solid ${P.glassBorder}`,
      borderRadius: 14,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Section label ─────────────────────────────────────────────────────────────
function SLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.14em",
      textTransform: "uppercase", color: "rgba(220,180,255,0.75)", marginBottom: 4 }}>
      {text}
    </div>
  );
}

// ─── KPI row ───────────────────────────────────────────────────────────────────
function KpiRow({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "2px 7px", borderRadius: 5,
      background: "rgba(255,255,255,0.07)",
      border: "1px solid rgba(255,255,255,0.06)" }}>
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.82)", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 900, color: accent, lineHeight: 1 }}>{value}</span>
    </div>
  );
}

// ─── Zone progress bar ─────────────────────────────────────────────────────────
function ZoneBar({ label, total, onAir }: { label: string; total: number; onAir: number }) {
  const pct   = total > 0 ? (onAir / total) * 100 : 0;
  const noData = total === 0;
  const color = noData ? "rgba(255,255,255,0.3)" : pct >= 95 ? P.green : pct >= 80 ? P.orange : P.red;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: "#fff" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 900, color }}>
          {noData ? "N/A" : `${pct.toFixed(1)}%`}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${noData ? 0 : pct}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>
        {noData ? "loading…" : `${onAir} / ${total} on-air`}
      </div>
    </div>
  );
}

// ─── Filter button ─────────────────────────────────────────────────────────────
function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 9px", fontSize: 10, fontWeight: 700, borderRadius: 20,
      cursor: "pointer", transition: "all 0.15s",
      border: `1px solid ${active ? P.green : "rgba(255,255,255,0.28)"}`,
      background: active ? P.green : "rgba(255,255,255,0.1)",
      color: active ? P.purpleDeep : "#fff",
      boxShadow: active ? `0 2px 8px ${P.greenDark}66` : "none",
    }}>{label}</button>
  );
}

// ─── Shared table chrome ───────────────────────────────────────────────────────
const TH_STYLE: React.CSSProperties = {
  padding: "4px 8px", fontSize: 9, fontWeight: 700, textAlign: "left",
  color: "rgba(220,180,255,0.9)", borderBottom: "1px solid rgba(255,255,255,0.1)",
  position: "sticky", top: 0, background: "rgba(55,0,88,0.97)",
  letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
};
const TD_STYLE: React.CSSProperties = { padding: "3px 8px", fontSize: 11 };

function TableShell({ title, accent, count, loading, cols, children }: {
  title: string; accent: string; count: number; loading: boolean;
  cols: string[]; children: React.ReactNode;
}) {
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column",
      background: "rgba(75,0,110,0.88)", backdropFilter: "blur(14px)",
      border: `1px solid ${P.glassBorder}` }}>
      <div style={{ background: `linear-gradient(90deg, ${P.purpleDark}, ${P.purple})`,
        color: "#fff", fontSize: 12, fontWeight: 700,
        padding: "5px 12px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", display: "inline-block",
          background: accent, boxShadow: `0 0 6px ${accent}` }} />
        {title}
        <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.15)",
          borderRadius: 20, padding: "1px 10px", fontSize: 10 }}>
          {loading ? "…" : `${count} active`}
        </span>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{cols.map(h => <th key={h} style={TH_STYLE}>{h}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

// SLA thresholds
const POWER_SLA_MIN = 480;    // 8 hours for power outage (SIR)
const NSA_SLA_MIN   = 2160;   // 36 hours for NSA (Input Record)

// ─── Power ticket row (SIR data) ───────────────────────────────────────────────
function PowerTicketRow({ ticket, idx }: { ticket: PbiTicket; idx: number }) {
  const salNum   = ticket.durationMin != null ? POWER_SLA_MIN - ticket.durationMin : null;
  const salColor = salNum === null ? "rgba(255,255,255,0.55)"
    : salNum < 0 ? P.red : salNum < 60 ? P.orange : P.green;
  const district = (ticket as any).area || ticket.district || "MAKKAH";
  const physical = (ticket.chain !== undefined && ticket.chain !== "") ? ticket.chain : "1";
  return (
    <tr style={{ background: idx % 2 === 0 ? "rgba(255,255,255,0.05)" : "transparent" }}>
      <td style={{ ...TD_STYLE, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{ticket.siteId}</td>
      <td style={{ ...TD_STYLE, color: "rgba(255,255,255,0.75)" }}>{physical}</td>
      <td style={{ ...TD_STYLE, color: "rgba(255,255,255,0.75)" }}>{district}</td>
      <td style={{ ...TD_STYLE, color: "rgba(255,255,255,0.75)" }}>{ticket.siteLabel || "—"}</td>
      <td style={{ ...TD_STYLE, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" }}>{ticket.totalDuration || "—"}</td>
      <td style={{ ...TD_STYLE, color: ticket.slaBreach ? P.red : "rgba(255,255,255,0.75)",
        whiteSpace: "nowrap", fontWeight: 600 }}>
        {ticket.slaBreach || "—"}
      </td>
      <td style={{ ...TD_STYLE, fontWeight: 800, color: salColor, whiteSpace: "nowrap" }}>
        {salNum !== null ? salNum.toLocaleString() : "—"}
      </td>
      <td style={{ ...TD_STYLE, color: "rgba(255,255,255,0.65)", maxWidth: 140,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {ticket.description || ticket.title || "—"}
      </td>
      <td style={{ ...TD_STYLE, color: "rgba(255,255,255,0.55)", maxWidth: 120,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {(ticket as any).summary || ticket.comment || ticket.actionTaken || "—"}
      </td>
    </tr>
  );
}

// ─── NSA ticket row ────────────────────────────────────────────────────────────
function NsaTicketRow({ ticket, idx }: { ticket: PbiTicket; idx: number }) {
  const sevStr  = ticket.severity || ticket.priority || "—";
  const sevColor = sevStr.toLowerCase() === "critical" ? P.red
    : sevStr.toLowerCase() === "high" ? P.orange
    : "rgba(255,255,255,0.75)";

  // Compute remaining SAL: threshold - elapsed (negative = breached)
  const salNum  = ticket.durationMin != null
    ? NSA_SLA_MIN - ticket.durationMin
    : null;
  const salColor = salNum === null ? "rgba(255,255,255,0.55)"
    : salNum < 0 ? P.red : salNum < 60 ? P.orange : P.green;

  // District from siteLabel if area/district not available
  const district = (ticket.district && ticket.district !== "") ? ticket.district
    : (ticket as any).area || "MAKKAH";

  return (
    <tr style={{ background: idx % 2 === 0 ? "rgba(255,255,255,0.05)" : "transparent" }}>
      <td style={{ ...TD_STYLE, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{ticket.siteId}</td>
      <td style={{ ...TD_STYLE, color: "rgba(255,255,255,0.75)" }}>
        {(ticket.chain !== undefined && ticket.chain !== "") ? ticket.chain : "1"}
      </td>
      <td style={{ ...TD_STYLE, color: "rgba(255,255,255,0.75)" }}>{district}</td>
      <td style={{ ...TD_STYLE, color: "rgba(255,255,255,0.75)" }}>{ticket.siteLabel || "—"}</td>
      <td style={{ ...TD_STYLE, fontWeight: 700, color: sevColor, textTransform: "capitalize" }}>
        {sevStr}
      </td>
      <td style={{ ...TD_STYLE, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" }}>{ticket.totalDuration || "—"}</td>
      <td style={{ ...TD_STYLE, color: ticket.slaBreach ? P.red : "rgba(255,255,255,0.75)",
        whiteSpace: "nowrap", fontWeight: 600 }}>
        {ticket.slaBreach || "—"}
      </td>
      <td style={{ ...TD_STYLE, fontWeight: 800, color: salColor, whiteSpace: "nowrap" }}>
        {salNum !== null ? salNum.toLocaleString() : "—"}
      </td>
      <td style={{ ...TD_STYLE, color: "rgba(255,255,255,0.65)", maxWidth: 150,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {ticket.description || ticket.title || "—"}
      </td>
    </tr>
  );
}

// ─── Power ticket table ────────────────────────────────────────────────────────
function PowerTicketTable({ tickets, loading }: { tickets: PbiTicket[]; loading: boolean }) {
  const cols = ["Site","#Physical","District","Site label","Total Duration","Time to SLA Breach","Remaining SAL (Min)","Alarms Description","Comment"];
  return (
    <TableShell title="Running Power Outage Tickets" accent={P.orange}
      count={tickets.length} loading={loading} cols={cols}>
      {loading
        ? <tr><td colSpan={cols.length} style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, padding: 14 }}>Loading…</td></tr>
        : tickets.length === 0
          ? <tr><td colSpan={cols.length} style={{ textAlign: "center", color: P.green, fontSize: 12, padding: 12, fontWeight: 600 }}>✓ No active power tickets</td></tr>
          : tickets.map((t, i) => <PowerTicketRow key={`${t.id}-${i}`} ticket={t} idx={i} />)}
    </TableShell>
  );
}

// ─── NSA ticket table ──────────────────────────────────────────────────────────
function NsaTicketTable({ tickets, loading }: { tickets: PbiTicket[]; loading: boolean }) {
  const cols = ["Site ID","Chain","District","Site Label","TT Severity","Total Duration","Time to SLA Breach","Remaining SAL (MIN)","Problem Description"];
  return (
    <TableShell title="Running NSA Tickets" accent="#C792FF"
      count={tickets.length} loading={loading} cols={cols}>
      {loading
        ? <tr><td colSpan={cols.length} style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, padding: 14 }}>Loading…</td></tr>
        : tickets.length === 0
          ? <tr><td colSpan={cols.length} style={{ textAlign: "center", color: P.green, fontSize: 12, padding: 12, fontWeight: 600 }}>✓ No active NSA tickets</td></tr>
          : tickets.map((t, i) => <NsaTicketRow key={`${t.id}-${i}`} ticket={t} idx={i} />)}
    </TableShell>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const avail = (on: number, tot: number) => tot ? Math.round((on / tot) * 1000) / 10 : 0;
const dotC  = (v: number)               => v >= 95 ? P.green : v >= 80 ? P.orange : P.red;

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [statusFilter, setStatusFilter] = useState("Open");
  const [cowIdFilter,  setCowIdFilter]  = useState("All");
  const [areaFilter,   setAreaFilter]   = useState<string | null>(null);

  const clock   = useClock();
  const dateStr = clock.toLocaleDateString("en-GB",  { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = clock.toLocaleTimeString("en-GB",  { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const { data: pbiSites,   loading: sitesLoading }   = usePbi<PbiSite[]>("/pbi/sites",           60_000);
  const { data: powerTix,   loading: powerLoading }   = usePbi<PbiTicket[]>("/pbi/tickets/power",  60_000);
  const { data: telecomTix, loading: telecomLoading } = usePbi<PbiTicket[]>("/pbi/tickets/telecom", 60_000);
  const { data: kpis }                                = usePbi<PbiKpis>("/pbi/kpis",              60_000);

  // ── Area-filtered sites ────────────────────────────────────────────────────
  const areaSites = useMemo(() => {
    const sites = pbiSites ?? [];
    return areaFilter ? sites.filter(s => SITE_AREA[s.name] === areaFilter) : sites;
  }, [pbiSites, areaFilter]);

  // ── Area classification rows — computed from pbiSites ─────────────────────
  const areaRows = useMemo(() => {
    const sites = pbiSites ?? [];
    return AREA_LIST.map(area => {
      const s = sites.filter(x => SITE_AREA[x.name] === area);
      return { label: area, total: s.length, onAir: s.filter(x => x.status === "operational").length };
    });
  }, [pbiSites]);

  // ── Availability ───────────────────────────────────────────────────────────
  const overallAvail = kpis?.sites.availability ?? 100;
  const areaAvail = useMemo(() => {
    if (!areaFilter || areaSites.length === 0) return overallAvail;
    const on = areaSites.filter(s => s.status === "operational").length;
    return Math.round((on / areaSites.length) * 1000) / 10;
  }, [areaFilter, areaSites, overallAvail]);

  const totalSites = areaFilter ? areaSites.length : (kpis?.sites.total ?? 0);

  // ── Map sites ──────────────────────────────────────────────────────────────
  const mapSites = useMemo(() => {
    const openPower = new Set(
      (powerTix ?? []).filter(t => t.status !== "closed").map(t => t.siteName)
    );
    const openNsa = new Set(
      (telecomTix ?? []).filter(t => t.status !== "closed").map(t => t.siteName)
    );
    return areaSites
      .filter(s => s.latitude != null && s.longitude != null)
      .filter(s => cowIdFilter === "All" || s.name === cowIdFilter)
      .map((s, i) => ({
        id: i as unknown as number, name: s.name, zone: s.zone ?? "Hajj",
        status: s.status, latitude: s.latitude!, longitude: s.longitude!,
        siteClass: s.siteLabel,
        hasPowerTicket: openPower.has(s.name),
        hasNsaTicket:   openNsa.has(s.name),
      }));
  }, [areaSites, cowIdFilter, powerTix, telecomTix]);

  // ── Ticket filtering (area + status) ──────────────────────────────────────
  const areaNames = useMemo(() => new Set(areaSites.map(s => s.name)), [areaSites]);
  const fTix = (tix: PbiTicket[] | null) =>
    (tix ?? [])
      .filter(t => !areaFilter || areaNames.has(t.siteName))
      .filter(t => statusFilter === "Closed" ? t.status === "closed" : t.status !== "closed");
  const filteredPower   = useMemo(() => fTix(powerTix),   [powerTix,   statusFilter, areaFilter, areaNames]);
  const filteredTelecom = useMemo(() => fTix(telecomTix), [telecomTix, statusFilter, areaFilter, areaNames]);

  // ── Ticker ─────────────────────────────────────────────────────────────────
  const tickerItems = [
    { label: "Hajj Overall", val: areaAvail },
    ...areaRows.map(z => ({ label: z.label, val: avail(z.onAir, z.total) })),
  ];
  const sep = <span style={{ margin: "0 16px", opacity: 0.25 }}>|</span>;
  const mkTicker = (pfx: string) => tickerItems.map(({ label, val }, i) => (
    <span key={`${pfx}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotC(val),
        boxShadow: `0 0 6px ${dotC(val)}`, display: "inline-block" }} />
      <span style={{ fontWeight: 700, color: "#fff", fontSize: 11 }}>{label}</span>
      <span style={{ color: dotC(val), fontWeight: 900, fontSize: 11 }}>{val.toFixed(1)}%</span>
      <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>avail.</span>
      {i < tickerItems.length - 1 && sep}
    </span>
  ));

  return (
    <div style={{ width: "100vw", height: "100vh",
      background: P.purpleDeep, display: "flex", flexDirection: "column",
      overflow: "hidden", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#fff" }}>

      {/* ══ HEADER ════════════════════════════════════════════════════════════ */}
      <div style={{ background: `linear-gradient(135deg, ${P.purpleDeep} 0%, ${P.purpleDark} 45%, ${P.purple} 100%)`,
        padding: "0 18px", display: "flex", alignItems: "center", gap: 14,
        flexShrink: 0, height: 54, boxShadow: "0 3px 20px rgba(75,0,110,0.6)" }}>

        <img src="/stc-logo.png" alt="STC" style={{ height: 34, objectFit: "contain" }} />

        <div style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${P.glassBorder}`,
          borderRadius: 8, padding: "3px 12px", fontSize: 10, color: "#fff", lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, fontSize: 11 }}>{dateStr}</div>
          <div style={{ opacity: 0.7 }}>⟳ {timeStr}</div>
        </div>

        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: 0.5,
            textShadow: "0 2px 16px rgba(0,0,0,0.4)" }}>
            COW HAJJ 1447 — Interactive Status
          </div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.6)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Live Power BI · {sitesLoading ? "…" : totalSites} Hajj sites monitored
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6,
          background: "rgba(0,200,120,0.12)", border: "1px solid rgba(0,200,120,0.35)",
          borderRadius: 20, padding: "4px 13px" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: P.green,
            boxShadow: `0 0 8px ${P.green}`, display: "inline-block", animation: "pulse 2s infinite" }} />
          <span style={{ color: P.green, fontSize: 11, fontWeight: 700 }}>LIVE</span>
        </div>

        <img src="/aces-logo.png" alt="ACES" style={{ height: 52, objectFit: "contain" }} />
      </div>

      {/* ══ MAP (full width) ══════════════════════════════════════════════════ */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <Map3D sites={mapSites} areaFilter={areaFilter ?? "All"} />

        {/* ── Hajj + Kaaba icons — top-center map overlay ──────────────── */}
        {/* At h=140: hajj transparent-top=45px, kaaba=15px; container top=-(45-28)=-17 */}
        <div style={{ position: "absolute", top: -17, left: "50%", transform: "translateX(-50%)",
          zIndex: 950, pointerEvents: "none",
          display: "flex", alignItems: "flex-start", gap: 0 }}>
          <img src="/hajj-icon-nobg.png" alt="Hajj"
            style={{ height: 140, objectFit: "contain",
              filter: "brightness(2.2) sepia(0.3) saturate(2.2) drop-shadow(0 2px 12px rgba(0,0,0,0.7))" }} />
          <img src="/kaaba-icon.png" alt="Kaaba"
            style={{ height: 140, objectFit: "contain", marginTop: 30,
              filter: "drop-shadow(0 2px 14px rgba(0,0,0,0.8))" }} />
        </div>

        {/* ── COW truck icon — left of center ───────────────────────────── */}
        {/* At h=140: transparent-top=15px → top=28-15=13 to align content below ticker */}
        <div style={{ position: "absolute", top: 13, right: "calc(50% + 150px)",
          zIndex: 950, pointerEvents: "none" }}>
          <img src="/cow-truck-icon.png" alt="COW Truck"
            style={{ height: 140, objectFit: "contain",
              filter: "hue-rotate(270deg) saturate(3) brightness(0.45) drop-shadow(0 2px 10px rgba(0,0,0,0.8))" }} />
        </div>

        {/* ── Ticker ────────────────────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000,
          height: 28, overflow: "hidden",
          background: "rgba(55,0,88,0.88)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(200,140,255,0.2)",
          display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center",
            animation: "tickerScroll 30s linear infinite", width: "max-content" }}>
            {mkTicker("a")}{sep}{mkTicker("b")}
          </div>
        </div>

        {/* ── LEFT glass panel: filters + zone gauges ────────────────────── */}
        <Glass style={{ position: "absolute", top: 36, left: 10, zIndex: 900,
          padding: "10px 12px", width: 178,
          display: "flex", flexDirection: "column", gap: 8 }}>

          {/* COW ID */}
          <div>
            <SLabel text="Site ID" />
            <select value={cowIdFilter} onChange={e => setCowIdFilter(e.target.value)}
              style={{ width: "100%", fontSize: 11, background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.22)", borderRadius: 6,
                padding: "5px 8px", color: "#fff", cursor: "pointer", outline: "none" }}>
              <option value="All" style={{ background: P.purpleDeep }}>All Sites</option>
              {(pbiSites ?? []).map(s => (
                <option key={s.id} value={s.name} style={{ background: P.purpleDeep }}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <SLabel text="Ticket Status" />
            <div style={{ display: "flex", gap: 5 }}>
              {["Open", "Closed"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} style={{
                  flex: 1, padding: "5px 0", fontSize: 11, fontWeight: 700, borderRadius: 6,
                  border: "none", cursor: "pointer",
                  background: statusFilter === s ? P.green : "rgba(255,255,255,0.1)",
                  color: statusFilter === s ? P.purpleDeep : "#fff",
                  transition: "all 0.15s" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(200,140,255,0.2)", margin: "0 -2px" }} />

          {/* Area Classification — clickable filter cards with availability bar */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <SLabel text="Area Classification" />
              {areaFilter && (
                <button onClick={() => setAreaFilter(null)} style={{
                  fontSize: 9, padding: "1px 8px", borderRadius: 10, cursor: "pointer",
                  border: "1px solid rgba(200,140,255,0.45)", background: "rgba(200,140,255,0.15)",
                  color: "rgba(200,140,255,0.95)" }}>All</button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {areaRows.map(({ label, total, onAir }) => {
                const pct = total ? Math.round((onAir / total) * 100) : 0;
                const col = total === 0 ? "rgba(255,255,255,0.25)" : pct >= 95 ? P.green : pct >= 80 ? P.orange : P.red;
                const active = areaFilter === label;
                return (
                  <button key={label} onClick={() => setAreaFilter(active ? null : label)} style={{
                    width: "100%", textAlign: "left", cursor: "pointer",
                    background: active ? "rgba(107,31,162,0.6)" : "rgba(255,255,255,0.06)",
                    borderRadius: 7, padding: "5px 8px",
                    border: active ? `1px solid ${P.glassBorder}` : "1px solid rgba(200,140,255,0.15)",
                    boxShadow: active ? "0 0 10px rgba(107,31,162,0.55)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, fontWeight: 600,
                        color: active ? "#fff" : "rgba(255,255,255,0.82)" }}>{label}</span>
                      <span style={{ fontSize: 11, fontWeight: 900, color: col }}>
                        {onAir}<span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)",
                          fontWeight: 400 }}>/{total}</span>
                      </span>
                    </div>
                    <div style={{ marginTop: 3, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.1)" }}>
                      <div style={{ height: "100%", borderRadius: 2, background: col,
                        width: total ? `${pct}%` : "0%", transition: "width 0.5s" }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </Glass>

        {/* ── RIGHT: gauge panel (top) ────────────────────────────────────── */}
        <Glass style={{ position: "absolute", top: 36, right: 10, zIndex: 900,
          width: 228, padding: "6px 10px 6px",
          display: "flex", flexDirection: "column", alignItems: "center" }}>
          <GaugeSvg value={areaAvail} size={178} />
        </Glass>

        {/* ── RIGHT: KPI cards (below gauge, one card each) ───────────────── */}
        <div style={{ position: "absolute", top: 198, right: 10, zIndex: 900,
          width: 228, display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { label: "Total Sites",            value: totalSites,            accent: "#fff"   },
            { label: "Power Tickets (Open)",   value: filteredPower.length,  accent: P.orange },
            { label: "Telecom Tickets (Open)", value: filteredTelecom.length,accent: "#C792FF"},
            { label: "Critical Power TTs",     value: kpis?.power.critical ?? "…", accent: P.red },
          ].map(({ label, value, accent }) => (
            <Glass key={label} style={{ padding: "10px 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.82)", fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: accent, lineHeight: 1 }}>{value}</span>
            </Glass>
          ))}
        </div>

        {/* ── Map legend (bottom-left, above Leaflet attribution) ────────── */}
        <Glass style={{ position: "absolute", bottom: 26, left: 10, zIndex: 900,
          padding: "7px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          {[{ color: "#00C878", label: "Operational" }, { color: P.orange, label: "NSA Ticket" }, { color: P.red, label: "Power Outage" }]
            .map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%",
                  background: color, boxShadow: `0 0 6px ${color}` }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>{label}</span>
              </div>
            ))}
        </Glass>

        {/* ── Syncing badge ──────────────────────────────────────────────── */}
        {sitesLoading && (
          <div style={{ position: "absolute", bottom: 26, right: 248, zIndex: 900,
            background: P.glass, backdropFilter: "blur(8px)",
            border: `1px solid ${P.glassBorder}`, borderRadius: 20,
            padding: "3px 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: P.green,
              display: "inline-block", animation: "pulse 1.2s infinite" }} />
            <span style={{ color: P.green, fontSize: 10, fontWeight: 600 }}>Syncing…</span>
          </div>
        )}
      </div>

      {/* ══ TICKET TABLES ════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
        padding: "0 6px 6px", height: 185, flexShrink: 0, overflow: "hidden" }}>
        <PowerTicketTable tickets={filteredTelecom} loading={telecomLoading} />
        <NsaTicketTable   tickets={filteredPower}   loading={powerLoading} />
      </div>

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.45; }
        }
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        select option { background: #1A0533; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); }
        ::-webkit-scrollbar-thumb { background: rgba(200,140,255,0.35); border-radius: 4px; }
      `}</style>
    </div>
  );
}
