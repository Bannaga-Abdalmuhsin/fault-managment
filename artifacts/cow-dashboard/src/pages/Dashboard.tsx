import { useState, useEffect, useMemo, useCallback } from "react";
import Map3D from "@/components/Map3D";
import GaugeSvg from "@/components/Gauge";

// ─── Brand palette ────────────────────────────────────────────────────────────
const P = {
  purple:     "#6B1FA2",
  purpleDark: "#4B006E",
  purpleDeep: "#1A0533",
  green:      "#00C878",
  greenDark:  "#009955",
  red:        "#EF4444",
  orange:     "#F59E0B",
  grey:       "#E5E0EE",
  greyLight:  "#F7F4FC",
  greyMid:    "#CBC3DB",
  white:      "#ffffff",
  text:       "#1F1235",
  textMuted:  "#6B6880",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface PbiSite {
  id: string; name: string; region: string; zone: string;
  technology: string; siteLabel: string; vendor: string;
  latitude: number | null; longitude: number | null;
  status: "operational" | "offline";
  pmpStatus: string; powerConfig: string; chain: number;
  has2G: boolean; has4G: boolean; has5G: boolean;
}

interface PbiTicket {
  id: string; ttNumber: string; siteId: string; siteName: string;
  type: "power" | "telecom"; status: string; priority: string;
  title: string; description: string; actionTaken: string;
  assignedTo: string; owner: string; powerSource: string;
  durationMin: number | null; totalDuration: string; slaBreach: string;
  siteLabel: string; region: string; createdAt: string;
}

interface PbiKpis {
  sites: {
    total: number; onAir: number; offAir: number; availability: number;
    vvvip: number; vvip: number; vip: number; normal: number;
    with2G: number; with4G: number; with5G: number;
  };
  power:   { open: number; closed: number; high: number; critical: number };
  telecom: { open: number; closed: number; high: number; critical: number };
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Data hook ────────────────────────────────────────────────────────────────
function usePbi<T>(path: string, interval = 60_000) {
  const [data, setData]     = useState<T | null>(null);
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function avail(op: number, total: number) {
  return total ? Math.round((op / total) * 10000) / 100 : 100;
}
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return now;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Gauge({ value, label, size = 90 }: { value: number; label: string; size?: number }) {
  return <GaugeSvg value={value} label={label} size={size} />;
}
function Badge({ text, bg, fg = "#fff" }: { text: string; bg: string; fg?: string }) {
  return (
    <span style={{ background: bg, color: fg, fontSize: 10, fontWeight: 700,
      padding: "2px 8px", borderRadius: 20, textTransform: "uppercase",
      letterSpacing: "0.04em", lineHeight: 1.5, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}
function SideLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color: "rgba(255,255,255,0.45)", padding: "0 2px", marginTop: 2 }}>
      {text}
    </div>
  );
}
function KpiRow({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "5px 10px", borderRadius: 8,
      background: `linear-gradient(90deg, ${P.greyLight} 0%, #fff 100%)`,
      border: `1px solid ${P.grey}` }}>
      <span style={{ fontSize: 11, color: P.textMuted, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</span>
    </div>
  );
}
function AreaStat({ label, op, total, down }: { label: string; op: number; total: number; down: number }) {
  const pct = total ? Math.min((op / total) * 100, 100) : 100;
  return (
    <div style={{ background: "#fff", borderRadius: 8, padding: "7px 8px",
      border: `1px solid ${P.grey}`, flex: 1 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: P.purple, marginBottom: 4 }}>{label}</div>
      <div style={{ height: 5, background: P.grey, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, transition: "width 0.6s ease",
          background: down > 0 ? P.orange : P.green }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: P.textMuted }}>{op}/{total}</span>
        {down > 0 ? <Badge text={`${down} ↓`} bg={P.red} /> : <Badge text="OK" bg={P.green} />}
      </div>
    </div>
  );
}
function ClassCard({ label, count, gradient }: { label: string; count: number; gradient: string }) {
  return (
    <div style={{ background: gradient, borderRadius: 10, flex: 1,
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "6px 4px",
      boxShadow: "0 2px 8px rgba(107,31,162,0.12)" }}>
      <div style={{ fontSize: 26, fontWeight: 900, color: P.white, lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.8)", textAlign: "center",
        lineHeight: 1.3, marginTop: 3, fontWeight: 600, letterSpacing: "0.03em" }}>{label}</div>
    </div>
  );
}
function TicketRow({ ticket, idx }: { ticket: PbiTicket; idx: number }) {
  const statusBg = ticket.status === "open" ? P.red : ticket.status === "in_progress" ? P.orange : P.green;
  const priorityColor = ticket.priority === "critical" ? P.red : ticket.priority === "high" ? P.orange : P.textMuted;
  return (
    <tr style={{ background: idx % 2 === 0 ? "#fff" : P.greyLight, fontSize: 11 }}>
      <td style={{ padding: "4px 8px", fontWeight: 600, color: P.text, whiteSpace: "nowrap" }}>{ticket.siteName}</td>
      <td style={{ padding: "4px 8px" }}>
        <Badge text={ticket.type} bg={ticket.type === "power" ? "#FFF3CD" : "#EDE7F6"}
          fg={ticket.type === "power" ? "#856404" : P.purple} />
      </td>
      <td style={{ padding: "4px 8px", color: P.textMuted, maxWidth: 160,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.title}</td>
      <td style={{ padding: "4px 8px" }}><Badge text={ticket.status.replace("_", " ")} bg={statusBg} /></td>
      <td style={{ padding: "4px 8px", fontWeight: 700, color: priorityColor }}>{ticket.priority}</td>
      <td style={{ padding: "4px 8px", color: P.textMuted, whiteSpace: "nowrap" }}>{ticket.totalDuration ?? "—"}</td>
      <td style={{ padding: "4px 8px", color: P.textMuted }}>{ticket.assignedTo ?? "—"}</td>
    </tr>
  );
}
function TicketTable({ title, tickets, accent, loading }: {
  title: string; tickets: PbiTicket[]; accent: string; loading: boolean;
}) {
  const cols = ["Site", "Type", "Issue", "Status", "Priority", "Duration", "FO Staff"];
  return (
    <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden",
      display: "flex", flexDirection: "column",
      boxShadow: "0 2px 12px rgba(107,31,162,0.08)", border: `1px solid ${P.grey}` }}>
      <div style={{ background: `linear-gradient(90deg, ${P.purpleDark} 0%, ${P.purple} 100%)`,
        color: "#fff", fontSize: 12, fontWeight: 700,
        padding: "7px 12px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%",
          background: accent, boxShadow: `0 0 6px ${accent}` }} />
        {title}
        <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.2)",
          borderRadius: 20, padding: "1px 10px", fontSize: 10 }}>
          {loading ? "…" : `${tickets.length} active`}
        </span>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: P.greyLight }}>
              {cols.map((h) => (
                <th key={h} style={{ padding: "5px 8px", fontSize: 10, fontWeight: 700,
                  textAlign: "left", color: P.purple, borderBottom: `2px solid ${P.grey}`,
                  position: "sticky", top: 0, background: P.greyLight,
                  letterSpacing: "0.04em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: "center", color: P.textMuted, fontSize: 12, padding: 16 }}>
                Loading from Power BI…
              </td></tr>
            ) : tickets.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", color: P.green, fontSize: 12, padding: 16, fontWeight: 600 }}>
                ✓ No active tickets
              </td></tr>
            ) : (
              tickets.map((t, i) => <TicketRow key={`${t.id}-${i}`} ticket={t} idx={i} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Zone definitions matching actual PBI data ───────────────────────────────
// region field = WR-HAJJ, WR, CR, ER, SR
// zone field   = district e.g. MAKKAH, Jeddah, Riyadh District …
const AREA_DEFS = [
  { key: "All",       label: "All",      match: (_s: PbiSite) => true },
  { key: "WR-HAJJ",   label: "Hajj",     match: (s: PbiSite) => s.region === "WR-HAJJ" },
  { key: "MAKKAH",    label: "Makkah",   match: (s: PbiSite) => s.zone?.startsWith("MAKKAH") },
  { key: "Jeddah",    label: "Jeddah",   match: (s: PbiSite) => s.zone?.startsWith("Jeddah") },
  { key: "Riyadh",    label: "Riyadh",   match: (s: PbiSite) => s.zone?.startsWith("Riyadh") },
  { key: "WR",        label: "Western",  match: (s: PbiSite) => s.region === "WR" },
];

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [areaKey, setAreaKey]       = useState("WR-HAJJ");
  const [statusFilter, setStatusFilter] = useState("Open");
  const [cowIdFilter, setCowIdFilter]   = useState("All");
  const clock = useClock();

  const dateStr = clock.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = clock.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const { data: pbiSites,   loading: sitesLoading }   = usePbi<PbiSite[]>("/pbi/sites", 60_000);
  const { data: powerTix,   loading: powerLoading }   = usePbi<PbiTicket[]>("/pbi/tickets/power", 60_000);
  const { data: telecomTix, loading: telecomLoading } = usePbi<PbiTicket[]>("/pbi/tickets/telecom", 60_000);
  const { data: kpis }                                = usePbi<PbiKpis>("/pbi/kpis", 60_000);

  // ── Zone stat groups for right panel + gauges ─────────────────────────────
  const zoneStats = useMemo(() => {
    const all = pbiSites ?? [];
    return {
      hajj:    (() => { const s = all.filter(x => x.region === "WR-HAJJ");    return { total: s.length, op: s.filter(x=>x.status==="operational").length }; })(),
      makkah:  (() => { const s = all.filter(x => x.zone?.startsWith("MAKKAH")); return { total: s.length, op: s.filter(x=>x.status==="operational").length }; })(),
      jeddah:  (() => { const s = all.filter(x => x.zone?.startsWith("Jeddah")); return { total: s.length, op: s.filter(x=>x.status==="operational").length }; })(),
      riyadh:  (() => { const s = all.filter(x => x.zone?.startsWith("Riyadh")); return { total: s.length, op: s.filter(x=>x.status==="operational").length }; })(),
    };
  }, [pbiSites]);

  const activeAreaDef = AREA_DEFS.find(a => a.key === areaKey) ?? AREA_DEFS[0];
  const filteredSites = useMemo(() => (pbiSites ?? []).filter(activeAreaDef.match), [pbiSites, activeAreaDef]);
  const filteredOp    = filteredSites.filter(s => s.status === "operational").length;
  const filteredAvail = avail(filteredOp, filteredSites.length);

  const mapSites = useMemo(() =>
    filteredSites
      .filter(s => s.latitude != null && s.longitude != null)
      .map((s, i) => ({
        id: i as unknown as number,
        name: s.name, zone: s.zone ?? s.region, status: s.status,
        latitude: s.latitude!, longitude: s.longitude!, siteClass: s.siteLabel,
      })),
  [filteredSites]);

  // ── Ticket filtering ───────────────────────────────────────────────────────
  const filterTix = (tix: PbiTicket[] | null) =>
    (tix ?? []).filter(t => statusFilter === "Closed" ? t.status === "closed" : t.status !== "closed");
  const filteredPower   = useMemo(() => filterTix(powerTix),   [powerTix, statusFilter]);
  const filteredTelecom = useMemo(() => filterTix(telecomTix), [telecomTix, statusFilter]);

  // ── Ticker ────────────────────────────────────────────────────────────────
  const tickerZones = [
    { label: "Hajj (WR-HAJJ)", avail: avail(zoneStats.hajj.op,   zoneStats.hajj.total)   },
    { label: "Makkah",         avail: avail(zoneStats.makkah.op, zoneStats.makkah.total) },
    { label: "Jeddah",         avail: avail(zoneStats.jeddah.op, zoneStats.jeddah.total) },
    { label: "Riyadh",         avail: avail(zoneStats.riyadh.op, zoneStats.riyadh.total) },
  ];
  const dotColor = (v: number) => v >= 95 ? P.green : v >= 80 ? P.orange : P.red;
  const sep = <span style={{ margin: "0 18px", opacity: 0.3, fontSize: 14 }}>|</span>;
  const mkItems = (suffix: string) => tickerZones.map(({ label, avail: a }, i) => (
    <span key={`${suffix}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(a),
        boxShadow: `0 0 7px ${dotColor(a)}`, display: "inline-block", flexShrink: 0 }} />
      <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.9)", fontSize: 12 }}>{label}</span>
      <span style={{ color: dotColor(a), fontWeight: 800, fontSize: 12 }}>{a.toFixed(2)}%</span>
      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>available</span>
      {i < tickerZones.length - 1 && sep}
    </span>
  ));

  const totalSites  = kpis?.sites.total   ?? 0;
  const onAirSites  = kpis?.sites.onAir   ?? 0;
  const offAirSites = kpis?.sites.offAir  ?? 0;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#F0EDF5",
      display: "flex", flexDirection: "column", overflow: "hidden",
      fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div style={{ background: `linear-gradient(135deg, ${P.purpleDeep} 0%, ${P.purpleDark} 40%, ${P.purple} 100%)`,
        padding: "0 16px", display: "flex", alignItems: "center", gap: 14,
        flexShrink: 0, height: 58, boxShadow: "0 3px 16px rgba(75,0,110,0.4)" }}>
        <img src="/stc-logo.png" alt="STC" style={{ height: 38, width: "auto", objectFit: "contain" }} />
        <div style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 8, padding: "4px 12px", fontSize: 10, color: "rgba(255,255,255,0.85)",
          flexShrink: 0, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700, fontSize: 11 }}>{dateStr}</div>
          <div style={{ opacity: 0.75 }}>⟳ {timeStr}</div>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 21, fontWeight: 900, color: "#fff", letterSpacing: 0.5,
            textShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>COW HAJJ 1447 — Interactive Status</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Live data from Power BI · {totalSites} sites monitored
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6,
          background: "rgba(0,200,120,0.15)", border: "1px solid rgba(0,200,120,0.4)",
          borderRadius: 20, padding: "4px 12px" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: P.green,
            boxShadow: `0 0 8px ${P.green}`, display: "inline-block", animation: "pulse 2s infinite" }} />
          <span style={{ color: P.green, fontSize: 11, fontWeight: 700 }}>LIVE</span>
        </div>
        <img src="/aces-logo.png" alt="ACES" style={{ height: 42, width: "auto", objectFit: "contain" }} />
      </div>

      {/* ══ MAIN BODY ════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "200px 1fr 190px",
        gap: 6, padding: 6, overflow: "hidden", minHeight: 0 }}>

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
        <div style={{ background: `linear-gradient(160deg, ${P.purpleDeep} 0%, #2D0A5A 100%)`,
          borderRadius: 12, display: "flex", flexDirection: "column", gap: 8,
          padding: "10px 8px", overflow: "hidden", boxShadow: "0 4px 20px rgba(26,5,51,0.5)" }}>

          <SideLabel text="COW ID" />
          <select value={cowIdFilter} onChange={e => setCowIdFilter(e.target.value)}
            style={{ width: "100%", fontSize: 11, background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)", borderRadius: 6,
              padding: "5px 8px", color: "#fff", cursor: "pointer", outline: "none" }}>
            <option value="All" style={{ background: P.purpleDeep }}>All Sites</option>
            {filteredSites.map(s => (
              <option key={s.id} value={s.id} style={{ background: P.purpleDeep }}>{s.id}</option>
            ))}
          </select>

          <SideLabel text="Ticket Status" />
          <div style={{ display: "flex", gap: 4 }}>
            {["Open", "Closed"].map(s => {
              const active = statusFilter === s;
              return (
                <button key={s} onClick={() => setStatusFilter(s)} style={{
                  flex: 1, padding: "5px 0", fontSize: 11, fontWeight: 700,
                  borderRadius: 6, border: "none", cursor: "pointer",
                  background: active ? P.green : "rgba(255,255,255,0.08)",
                  color: active ? P.purpleDeep : "rgba(255,255,255,0.7)",
                  transition: "all 0.15s",
                  boxShadow: active ? `0 2px 8px ${P.greenDark}55` : "none" }}>
                  {s}
                </button>
              );
            })}
          </div>

          <SideLabel text="Area" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {AREA_DEFS.map(({ key, label }) => {
              const active = areaKey === key;
              return (
                <button key={key} onClick={() => setAreaKey(key)} style={{
                  padding: "4px 8px", fontSize: 10, fontWeight: 600,
                  borderRadius: 20, cursor: "pointer", transition: "all 0.15s",
                  border: `1px solid ${active ? P.green : "rgba(255,255,255,0.25)"}`,
                  background: active ? P.green : "rgba(255,255,255,0.06)",
                  color: active ? P.purpleDeep : "rgba(255,255,255,0.8)",
                  boxShadow: active ? `0 2px 8px ${P.greenDark}55` : "none" }}>
                  {label}
                </button>
              );
            })}
          </div>

          <SideLabel text="Classification" />
          <div style={{ display: "flex", gap: 4 }}>
            {["Normal", "VIP", "VVIP"].map(c => (
              <button key={c} style={{ flex: 1, padding: "4px 0", fontSize: 9, fontWeight: 700,
                borderRadius: 6, cursor: "pointer", border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)" }}>
                {c}
              </button>
            ))}
          </div>

          {/* Zone gauges */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, overflow: "hidden" }}>
            {[
              { label: "Hajj",   op: zoneStats.hajj.op,   total: zoneStats.hajj.total   },
              { label: "Makkah", op: zoneStats.makkah.op, total: zoneStats.makkah.total },
              { label: "Jeddah", op: zoneStats.jeddah.op, total: zoneStats.jeddah.total },
              { label: "Riyadh", op: zoneStats.riyadh.op, total: zoneStats.riyadh.total },
            ].map(({ label, op, total }) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", overflow: "hidden", padding: "2px 0" }}>
                <Gauge value={avail(op, total)} label={label} size={82} />
              </div>
            ))}
          </div>
        </div>

        {/* ── CENTER: MAP + SITE CLASS COLUMN ───────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 82px", gap: 6, minHeight: 0, overflow: "hidden" }}>
          <div style={{ borderRadius: 12, overflow: "hidden",
            boxShadow: "0 4px 20px rgba(26,5,51,0.25)", position: "relative", background: "#0a0a1a" }}>

            {/* Scrolling ticker */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000,
              overflow: "hidden", background: "rgba(10,0,30,0.82)", backdropFilter: "blur(8px)",
              borderBottom: "1px solid rgba(255,255,255,0.1)", height: 30,
              display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center",
                animation: "tickerScroll 24s linear infinite", width: "max-content" }}>
                {mkItems("a")}{sep}{mkItems("b")}
              </div>
            </div>

            {/* Small non-blocking loading badge */}
            {sitesLoading && (
              <div style={{ position: "absolute", top: 38, right: 10, zIndex: 1001,
                background: "rgba(10,0,30,0.82)", backdropFilter: "blur(8px)",
                border: "1px solid rgba(0,200,120,0.4)", borderRadius: 20,
                padding: "3px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: P.green,
                  display: "inline-block", animation: "pulse 1.2s infinite" }} />
                <span style={{ color: P.green, fontSize: 10, fontWeight: 600 }}>Loading sites…</span>
              </div>
            )}

            {/* Legend */}
            <div style={{ position: "absolute", bottom: 32, left: 8, zIndex: 1000,
              background: "rgba(10,0,30,0.82)", backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "6px 10px",
              display: "flex", flexDirection: "column", gap: 4 }}>
              {[{ color: P.green, label: "ON-AIR" }, { color: P.orange, label: "Degraded" }, { color: P.red, label: "OFF-AIR" }]
                .map(({ color, label }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 9, height: 9, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>{label}</span>
                  </div>
                ))}
            </div>

            <Map3D sites={mapSites} areaFilter={areaKey} />
          </div>

          {/* Site class cards — from live PBI KPIs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, overflow: "hidden" }}>
            {[
              { label: "VVVIP SITES",  count: kpis?.sites.vvvip  ?? 0, gradient: `linear-gradient(160deg, #8B0000 0%, #C0392B 100%)` },
              { label: "VVIP SITES",   count: kpis?.sites.vvip   ?? 0, gradient: `linear-gradient(160deg, ${P.purpleDark} 0%, ${P.purple} 100%)` },
              { label: "VIP SITES",    count: kpis?.sites.vip    ?? 0, gradient: `linear-gradient(160deg, #1565C0 0%, #1E88E5 100%)` },
              { label: "NORMAL SITES", count: kpis?.sites.normal ?? 0, gradient: `linear-gradient(160deg, #2E7D32 0%, ${P.green} 100%)` },
            ].map(item => <ClassCard key={item.label} {...item} />)}
          </div>
        </div>

        {/* ── RIGHT PANEL ───────────────────────────────────────────────── */}
        <div style={{ background: "#fff", borderRadius: 12, display: "flex", flexDirection: "column",
          gap: 8, padding: "10px 10px", overflow: "hidden",
          boxShadow: "0 4px 20px rgba(107,31,162,0.10)", border: `1px solid ${P.grey}` }}>

          <div style={{ background: `linear-gradient(135deg, ${P.greyLight} 0%, #fff 100%)`,
            borderRadius: 10, padding: "8px 6px", border: `1px solid ${P.grey}`,
            display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: P.purple,
              textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
              {activeAreaDef.label} Availability
            </div>
            <Gauge value={filteredAvail} label="" size={125} />
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%",
              fontSize: 10, color: P.textMuted, marginTop: -4, padding: "0 4px" }}>
              <span style={{ color: P.red, fontWeight: 600 }}>0%</span>
              <span style={{ fontWeight: 600 }}>100%</span>
            </div>
          </div>

          {/* Per-area stats */}
          <div style={{ display: "flex", gap: 5 }}>
            <AreaStat label="Hajj" op={zoneStats.hajj.op} total={zoneStats.hajj.total}
              down={zoneStats.hajj.total - zoneStats.hajj.op} />
            <AreaStat label="Makkah" op={zoneStats.makkah.op} total={zoneStats.makkah.total}
              down={zoneStats.makkah.total - zoneStats.makkah.op} />
            <AreaStat label="Jeddah" op={zoneStats.jeddah.op} total={zoneStats.jeddah.total}
              down={zoneStats.jeddah.total - zoneStats.jeddah.op} />
          </div>

          {/* KPI list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4,
            borderTop: `1px solid ${P.grey}`, paddingTop: 6, flex: 1 }}>
            {[
              { label: "Total Sites",            value: totalSites,                      accent: P.purple },
              { label: "ON-AIR Sites",            value: onAirSites,                     accent: P.green  },
              { label: "OFF-AIR Sites",           value: offAirSites,                    accent: P.red    },
              { label: "Power Tickets (Open)",    value: kpis?.power.open    ?? "…",     accent: P.orange },
              { label: "Telecom Tickets (Open)",  value: kpis?.telecom.open  ?? "…",     accent: P.purple },
              { label: "Critical Power TTs",      value: kpis?.power.critical   ?? "…",  accent: P.red    },
              { label: "Critical Telecom TTs",    value: kpis?.telecom.critical ?? "…",  accent: P.red    },
            ].map(({ label, value, accent }) => (
              <KpiRow key={label} label={label} value={value} accent={accent} />
            ))}
          </div>
        </div>
      </div>

      {/* ══ BOTTOM: TICKET TABLES ════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 6, padding: "0 6px 6px", height: 192, flexShrink: 0, overflow: "hidden" }}>
        <TicketTable title="Running Power Outage Tickets"
          tickets={filteredPower} accent={P.orange} loading={powerLoading} />
        <TicketTable title="Running Telecom (NSA) Outage Tickets"
          tickets={filteredTelecom} accent={P.purple} loading={telecomLoading} />
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px #00C878; }
          50%       { opacity: 0.5; box-shadow: 0 0 3px #00C878; }
        }
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        select option { background: #1A0533; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${P.greyMid}; border-radius: 4px; }
      `}</style>
    </div>
  );
}
