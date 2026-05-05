import { useState, useEffect, useMemo, useCallback } from "react";
import Map3D from "@/components/Map3D";
import GaugeSvg from "@/components/Gauge";

// ─── Brand palette ────────────────────────────────────────────────────────────
const P = {
  purple:      "#6B1FA2",
  purpleDark:  "#4B006E",
  purpleDeep:  "#1A0533",
  green:       "#00C878",
  greenDark:   "#009955",
  red:         "#EF4444",
  orange:      "#F59E0B",
  grey:        "#E5E0EE",
  greyLight:   "#F7F4FC",
  greyMid:     "#CBC3DB",
  white:       "#ffffff",
  text:        "#1F1235",
  textMuted:   "#6B6880",
  glass:       "rgba(15, 5, 40, 0.72)",
  glassBorder: "rgba(255,255,255,0.14)",
};

// ─── Types ────────────────────────────────────────────────────────────────────
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
}
interface PbiKpis {
  sites: { total: number; onAir: number; offAir: number; availability: number;
    vvvip: number; vvip: number; vip: number; normal: number;
    with2G: number; with4G: number; with5G: number; };
  power:   { open: number; closed: number; high: number; critical: number };
  telecom: { open: number; closed: number; high: number; critical: number };
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Data hook ────────────────────────────────────────────────────────────────
function usePbi<T>(path: string, interval = 60_000) {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api${path}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch { /* keep last good data */ }
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
function avail(op: number, total: number) {
  return total ? Math.round((op / total) * 10000) / 100 : 100;
}

// ─── Glass panel wrapper ──────────────────────────────────────────────────────
function Glass({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: P.glass,
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      border: `1px solid ${P.glassBorder}`,
      borderRadius: 14,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ text, bg, fg = "#fff" }: { text: string; bg: string; fg?: string }) {
  return (
    <span style={{ background: bg, color: fg, fontSize: 10, fontWeight: 700,
      padding: "2px 8px", borderRadius: 20, textTransform: "uppercase",
      letterSpacing: "0.04em", lineHeight: 1.5, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

// ─── KPI row inside glass panel ───────────────────────────────────────────────
function KpiRow({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "3px 8px", borderRadius: 6,
      background: "rgba(255,255,255,0.06)",
      borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</span>
    </div>
  );
}

// ─── 2×2 Square class card ────────────────────────────────────────────────────
function ClassSquare({ label, count, gradient }: { label: string; count: number; gradient: string }) {
  return (
    <div style={{ background: gradient, borderRadius: 9, height: 50,
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 3px 10px rgba(0,0,0,0.35)" }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.82)", textAlign: "center",
        lineHeight: 1.3, marginTop: 3, fontWeight: 700, letterSpacing: "0.04em",
        textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

// ─── Ticket row ───────────────────────────────────────────────────────────────
function TicketRow({ ticket, idx }: { ticket: PbiTicket; idx: number }) {
  const statusBg  = ticket.status === "open" ? P.red : ticket.status === "in_progress" ? P.orange : P.green;
  const priColor  = ticket.priority === "critical" ? P.red : ticket.priority === "high" ? P.orange : "rgba(255,255,255,0.55)";
  return (
    <tr style={{ background: idx % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)", fontSize: 11 }}>
      <td style={{ padding: "4px 10px", fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>{ticket.siteName}</td>
      <td style={{ padding: "4px 10px" }}>
        <Badge text={ticket.type} bg={ticket.type === "power" ? "#5a3800" : "#2d1060"}
          fg={ticket.type === "power" ? "#FFC107" : "#C792FF"} />
      </td>
      <td style={{ padding: "4px 10px", color: "rgba(255,255,255,0.6)", maxWidth: 160,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.title}</td>
      <td style={{ padding: "4px 10px" }}><Badge text={ticket.status.replace("_", " ")} bg={statusBg} /></td>
      <td style={{ padding: "4px 10px", fontWeight: 700, color: priColor }}>{ticket.priority}</td>
      <td style={{ padding: "4px 10px", color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>{ticket.totalDuration ?? "—"}</td>
      <td style={{ padding: "4px 10px", color: "rgba(255,255,255,0.55)" }}>{ticket.assignedTo ?? "—"}</td>
    </tr>
  );
}

function TicketTable({ title, tickets, accent, loading }: {
  title: string; tickets: PbiTicket[]; accent: string; loading: boolean;
}) {
  const cols = ["Site", "Type", "Issue", "Status", "Priority", "Duration", "FO Staff"];
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column",
      background: "rgba(15,5,40,0.88)", backdropFilter: "blur(14px)",
      border: `1px solid ${P.glassBorder}` }}>
      <div style={{ background: `linear-gradient(90deg, ${P.purpleDark} 0%, ${P.purple} 100%)`,
        color: "#fff", fontSize: 12, fontWeight: 700,
        padding: "7px 12px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", display: "inline-block",
          background: accent, boxShadow: `0 0 6px ${accent}` }} />
        {title}
        <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.15)",
          borderRadius: 20, padding: "1px 10px", fontSize: 10 }}>
          {loading ? "…" : `${tickets.length} active`}
        </span>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "rgba(107,31,162,0.25)" }}>
              {cols.map(h => (
                <th key={h} style={{ padding: "5px 10px", fontSize: 9, fontWeight: 700,
                  textAlign: "left", color: "rgba(200,160,255,0.9)",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                  position: "sticky", top: 0, background: "rgba(26,5,51,0.9)",
                  letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, padding: 16 }}>
                Loading from Power BI…
              </td></tr>
            ) : tickets.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", color: P.green, fontSize: 12, padding: 16, fontWeight: 600 }}>
                ✓ No active tickets
              </td></tr>
            ) : tickets.map((t, i) => <TicketRow key={`${t.id}-${i}`} ticket={t} idx={i} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Filter button ────────────────────────────────────────────────────────────
function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 9px", fontSize: 10, fontWeight: 600, borderRadius: 20,
      cursor: "pointer", transition: "all 0.15s",
      border: `1px solid ${active ? P.green : "rgba(255,255,255,0.22)"}`,
      background: active ? P.green : "rgba(255,255,255,0.07)",
      color: active ? P.purpleDeep : "rgba(255,255,255,0.82)",
      boxShadow: active ? `0 2px 8px ${P.greenDark}66` : "none",
    }}>{label}</button>
  );
}

// ─── SideLabel ────────────────────────────────────────────────────────────────
function SideLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.12em",
      textTransform: "uppercase", color: "rgba(255,255,255,0.38)", marginBottom: 3 }}>
      {text}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [statusFilter,    setStatusFilter]   = useState("Open");
  const [classFilter,     setClassFilter]    = useState("All");
  const [cowIdFilter,     setCowIdFilter]    = useState("All");

  const clock   = useClock();
  const dateStr = clock.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = clock.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const { data: pbiSites,   loading: sitesLoading }   = usePbi<PbiSite[]>("/pbi/sites", 60_000);
  const { data: powerTix,   loading: powerLoading }   = usePbi<PbiTicket[]>("/pbi/tickets/power", 60_000);
  const { data: telecomTix, loading: telecomLoading } = usePbi<PbiTicket[]>("/pbi/tickets/telecom", 60_000);
  const { data: kpis }                                = usePbi<PbiKpis>("/pbi/kpis", 60_000);

  // ── Map sites (all Hajj 95, optionally filtered by classification) ────────
  const mapSites = useMemo(() =>
    (pbiSites ?? [])
      .filter(s => s.latitude != null && s.longitude != null)
      .filter(s => classFilter === "All" || s.siteLabel === classFilter)
      .filter(s => cowIdFilter === "All" || s.name === cowIdFilter)
      .map((s, i) => ({
        id: i as unknown as number,
        name: s.name, zone: s.zone ?? "Hajj",
        status: s.status, latitude: s.latitude!, longitude: s.longitude!,
        siteClass: s.siteLabel,
      })),
  [pbiSites, classFilter, cowIdFilter]);

  // ── Ticket filtering ──────────────────────────────────────────────────────
  const filterTix = (tix: PbiTicket[] | null) =>
    (tix ?? []).filter(t => statusFilter === "Closed" ? t.status === "closed" : t.status !== "closed");
  const filteredPower   = useMemo(() => filterTix(powerTix),   [powerTix, statusFilter]);
  const filteredTelecom = useMemo(() => filterTix(telecomTix), [telecomTix, statusFilter]);

  const overallAvail = kpis?.sites.availability ?? 100;
  const totalSites   = kpis?.sites.total  ?? 0;
  const onAirSites   = kpis?.sites.onAir  ?? 0;
  const offAirSites  = kpis?.sites.offAir ?? 0;

  // ── Ticker ────────────────────────────────────────────────────────────────
  const dotColor = (v: number) => v >= 95 ? P.green : v >= 80 ? P.orange : P.red;
  const tickerData = [
    { label: "Hajj (WR-HAJJ)",  val: avail(onAirSites, totalSites) },
    { label: "VVVIP Sites",     val: avail(kpis?.sites.vvvip ?? 0, kpis?.sites.vvvip ?? 0) },
    { label: "VVIP Sites",      val: avail(kpis?.sites.vvip  ?? 0, kpis?.sites.vvip  ?? 0) },
    { label: "VIP Sites",       val: avail(kpis?.sites.vip   ?? 0, kpis?.sites.vip   ?? 0) },
  ];
  const sep = <span style={{ margin: "0 18px", opacity: 0.25, fontSize: 14 }}>|</span>;
  const mkTicker = (pfx: string) => tickerData.map(({ label, val }, i) => (
    <span key={`${pfx}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor(val),
        boxShadow: `0 0 6px ${dotColor(val)}`, display: "inline-block" }} />
      <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.9)", fontSize: 11 }}>{label}</span>
      <span style={{ color: dotColor(val), fontWeight: 800, fontSize: 11 }}>{val.toFixed(2)}%</span>
      <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>avail.</span>
      {i < tickerData.length - 1 && sep}
    </span>
  ));

  const classOptions = ["All", "VVVIP", "VVIP", "VIP", "Normal"];

  return (
    <div style={{ width: "100vw", height: "100vh", background: P.purpleDeep,
      display: "flex", flexDirection: "column", overflow: "hidden",
      fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div style={{ background: `linear-gradient(135deg, ${P.purpleDeep} 0%, ${P.purpleDark} 45%, ${P.purple} 100%)`,
        padding: "0 18px", display: "flex", alignItems: "center", gap: 14,
        flexShrink: 0, height: 54, boxShadow: "0 3px 20px rgba(75,0,110,0.5)" }}>

        <img src="/stc-logo.png" alt="STC" style={{ height: 34, objectFit: "contain" }} />

        <div style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${P.glassBorder}`,
          borderRadius: 8, padding: "3px 12px", fontSize: 10, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, fontSize: 11 }}>{dateStr}</div>
          <div style={{ opacity: 0.7 }}>⟳ {timeStr}</div>
        </div>

        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: 0.5,
            textShadow: "0 2px 16px rgba(0,0,0,0.4)" }}>COW HAJJ 1447 — Interactive Status</div>
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.55)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Live Power BI · {sitesLoading ? "…" : totalSites} Hajj sites
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6,
          background: "rgba(0,200,120,0.12)", border: "1px solid rgba(0,200,120,0.35)",
          borderRadius: 20, padding: "4px 13px" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: P.green,
            boxShadow: `0 0 8px ${P.green}`, display: "inline-block", animation: "pulse 2s infinite" }} />
          <span style={{ color: P.green, fontSize: 11, fontWeight: 700 }}>LIVE</span>
        </div>

        <img src="/aces-logo.png" alt="ACES" style={{ height: 38, objectFit: "contain" }} />
      </div>

      {/* ══ FULL-WIDTH MAP AREA ═══════════════════════════════════════════════ */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* MAP (full size) */}
        <Map3D sites={mapSites} areaFilter="WR-HAJJ" />

        {/* ── Scrolling ticker bar (top of map) ─────────────────────────── */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000,
          height: 28, overflow: "hidden",
          background: "rgba(10,0,30,0.78)", backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center",
            animation: "tickerScroll 26s linear infinite", width: "max-content" }}>
            {mkTicker("a")}{sep}{mkTicker("b")}
          </div>
        </div>

        {/* ── LEFT glass panel: filters ─────────────────────────────────── */}
        <Glass style={{ position: "absolute", top: 36, left: 10, zIndex: 900,
          padding: "12px 12px", width: 172, display: "flex", flexDirection: "column", gap: 10 }}>

          <div>
            <SideLabel text="COW Site ID" />
            <select value={cowIdFilter} onChange={e => setCowIdFilter(e.target.value)}
              style={{ width: "100%", fontSize: 11, background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.18)", borderRadius: 6,
                padding: "5px 8px", color: "#fff", cursor: "pointer", outline: "none" }}>
              <option value="All" style={{ background: P.purpleDeep }}>All Sites</option>
              {(pbiSites ?? []).map(s => (
                <option key={s.id} value={s.name} style={{ background: P.purpleDeep }}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <SideLabel text="Ticket Status" />
            <div style={{ display: "flex", gap: 5 }}>
              {["Open", "Closed"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} style={{
                  flex: 1, padding: "5px 0", fontSize: 11, fontWeight: 700,
                  borderRadius: 6, border: "none", cursor: "pointer",
                  background: statusFilter === s ? P.green : "rgba(255,255,255,0.1)",
                  color: statusFilter === s ? P.purpleDeep : "rgba(255,255,255,0.75)",
                  transition: "all 0.15s" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <SideLabel text="Classification" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {classOptions.map(c => (
                <FilterBtn key={c} label={c} active={classFilter === c} onClick={() => setClassFilter(c)} />
              ))}
            </div>
          </div>

          {/* Mini site count pills */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 8 }}>
            <SideLabel text="On Map" />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
              {[
                { label: "ON-AIR",  val: mapSites.filter(s => s.status === "operational").length, color: P.green },
                { label: "OFF-AIR", val: mapSites.filter(s => s.status !== "operational").length, color: P.red },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5,
                  background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "3px 8px" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: color,
                    boxShadow: `0 0 5px ${color}`, display: "inline-block" }} />
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{val}</span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </Glass>

        {/* ── RIGHT glass panel: gauge + 2×2 cards + KPIs (full height) ── */}
        <Glass style={{ position: "absolute", top: 36, bottom: 26, right: 10, zIndex: 900,
          padding: "10px 12px", width: 228,
          display: "flex", flexDirection: "column", gap: 6 }}>

          {/* Availability gauge */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)" }}>
              Hajj Availability
            </div>
            <GaugeSvg value={overallAvail} label="" size={96} />
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%",
              fontSize: 9, marginTop: -4, padding: "0 6px" }}>
              <span style={{ color: P.red, fontWeight: 600 }}>0%</span>
              <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>100%</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "0 -2px" }} />

          {/* 2×2 square class cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            <ClassSquare label="VVVIP"  count={kpis?.sites.vvvip  ?? 0}
              gradient="linear-gradient(135deg, #8B0000 0%, #C0392B 100%)" />
            <ClassSquare label="VVIP"   count={kpis?.sites.vvip   ?? 0}
              gradient={`linear-gradient(135deg, ${P.purpleDark} 0%, ${P.purple} 100%)`} />
            <ClassSquare label="VIP"    count={kpis?.sites.vip    ?? 0}
              gradient="linear-gradient(135deg, #1565C0 0%, #1E88E5 100%)" />
            <ClassSquare label="Normal" count={kpis?.sites.normal ?? 0}
              gradient="linear-gradient(135deg, #1B5E20 0%, #00C878 100%)" />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "0 -2px" }} />

          {/* KPI rows — fill remaining space */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, justifyContent: "space-evenly" }}>
            {[
              { label: "Total Sites",           value: totalSites,                     accent: "rgba(255,255,255,0.9)" },
              { label: "ON-AIR Sites",          value: onAirSites,                     accent: P.green   },
              { label: "OFF-AIR Sites",         value: offAirSites,                    accent: P.red     },
              { label: "Power Tickets (Open)",  value: kpis?.power.open    ?? "…",     accent: P.orange  },
              { label: "Telecom Tickets (Open)",value: kpis?.telecom.open  ?? "…",     accent: "#C792FF" },
              { label: "Critical Power TTs",    value: kpis?.power.critical   ?? "…",  accent: P.red     },
              { label: "Critical Telecom TTs",  value: kpis?.telecom.critical ?? "…",  accent: P.red     },
            ].map(({ label, value, accent }) => (
              <KpiRow key={label} label={label} value={value} accent={accent} />
            ))}
          </div>
        </Glass>

        {/* ── Map legend (bottom-left) ───────────────────────────────────── */}
        <Glass style={{ position: "absolute", bottom: 36, left: 10, zIndex: 900,
          padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          {[{ color: P.green, label: "ON-AIR" }, { color: P.orange, label: "Degraded" }, { color: P.red, label: "OFF-AIR" }]
            .map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: color,
                  boxShadow: `0 0 6px ${color}` }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{label}</span>
              </div>
            ))}
        </Glass>

        {/* ── Loading badge ─────────────────────────────────────────────── */}
        {sitesLoading && (
          <div style={{ position: "absolute", bottom: 36, right: 10, zIndex: 900,
            background: "rgba(10,0,30,0.8)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(0,200,120,0.3)", borderRadius: 20,
            padding: "4px 12px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: P.green,
              display: "inline-block", animation: "pulse 1.2s infinite" }} />
            <span style={{ color: P.green, fontSize: 10, fontWeight: 600 }}>Syncing…</span>
          </div>
        )}
      </div>

      {/* ══ BOTTOM: TICKET TABLES ════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 6, padding: "0 6px 6px",
        height: 195, flexShrink: 0, overflow: "hidden" }}>
        <TicketTable title="Running Power Outage Tickets"
          tickets={filteredPower} accent={P.orange} loading={powerLoading} />
        <TicketTable title="Running Telecom (NSA) Outage Tickets"
          tickets={filteredTelecom} accent="#C792FF" loading={telecomLoading} />
      </div>

      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; box-shadow:0 0 8px #00C878; }
          50%      { opacity:0.5; box-shadow:0 0 3px #00C878; }
        }
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        select option { background: #1A0533; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(107,31,162,0.5); border-radius: 4px; }
      `}</style>
    </div>
  );
}
