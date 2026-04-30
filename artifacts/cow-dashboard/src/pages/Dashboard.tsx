import { useState, useEffect, useMemo } from "react";
import {
  useGetDashboardSummary,
  useGetSiteStatus,
  useListTickets,
  useListSites,
} from "@workspace/api-client-react";
import Map3D from "@/components/Map3D";
import GaugeSvg from "@/components/Gauge";

// ─── Brand palette ────────────────────────────────────────────────────────────
const P = {
  purple:     "#6B1FA2",
  purpleDark: "#4B006E",
  purpleDeep: "#1A0533",
  purpleGlass:"rgba(107,31,162,0.15)",
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function availability(op: number, total: number) {
  if (!total) return 100;
  return Math.round((op / total) * 10000) / 100;
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── Gauge wrapper ────────────────────────────────────────────────────────────
function Gauge({ value, label, size = 90 }: { value: number; label: string; size?: number }) {
  return <GaugeSvg value={value} label={label} size={size} />;
}

// ─── Pill badge ───────────────────────────────────────────────────────────────
function Badge({ text, bg, fg = "#fff" }: { text: string; bg: string; fg?: string }) {
  return (
    <span style={{
      background: bg, color: fg, fontSize: 10, fontWeight: 700,
      padding: "2px 8px", borderRadius: 20, textTransform: "uppercase",
      letterSpacing: "0.04em", lineHeight: 1.5, whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  );
}

// ─── Sidebar section label ────────────────────────────────────────────────────
function SideLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color: "rgba(255,255,255,0.45)",
      padding: "0 2px", marginTop: 2,
    }}>
      {text}
    </div>
  );
}

// ─── KPI row (right panel) ────────────────────────────────────────────────────
function KpiRow({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "5px 10px", borderRadius: 8,
      background: `linear-gradient(90deg, ${P.greyLight} 0%, #fff 100%)`,
      border: `1px solid ${P.grey}`,
    }}>
      <span style={{ fontSize: 11, color: P.textMuted, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</span>
    </div>
  );
}

// ─── Area stat card (right panel) ─────────────────────────────────────────────
function AreaStat({ label, op, total, down }: { label: string; op: number; total: number; down: number }) {
  const pct = total ? Math.min((op / total) * 100, 100) : 100;
  const barColor = down > 0 ? P.orange : P.green;
  return (
    <div style={{
      background: "#fff", borderRadius: 8, padding: "7px 8px",
      border: `1px solid ${P.grey}`, flex: 1,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: P.purple, marginBottom: 4 }}>{label}</div>
      <div style={{ height: 5, background: P.grey, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3,
          transition: "width 0.6s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: P.textMuted }}>{op}/{total}</span>
        {down > 0
          ? <Badge text={`${down} ↓`} bg={P.red} />
          : <Badge text="OK" bg={P.green} />}
      </div>
    </div>
  );
}

// ─── Site class card (center column) ──────────────────────────────────────────
function ClassCard({ label, count, gradient }: { label: string; count: number; gradient: string }) {
  return (
    <div style={{
      background: gradient, borderRadius: 10, flex: 1,
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "6px 4px", boxShadow: "0 2px 8px rgba(107,31,162,0.12)",
    }}>
      <div style={{ fontSize: 26, fontWeight: 900, color: P.white, lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.8)", textAlign: "center",
        lineHeight: 1.3, marginTop: 3, fontWeight: 600, letterSpacing: "0.03em" }}>
        {label}
      </div>
    </div>
  );
}

// ─── Ticket row ───────────────────────────────────────────────────────────────
function TicketRow({ ticket, idx }: { ticket: any; idx: number }) {
  const statusBg =
    ticket.status === "open"        ? P.red
    : ticket.status === "in_progress" ? P.orange
    : P.green;
  const priorityColor =
    ticket.priority === "critical" ? P.red
    : ticket.priority === "high"   ? P.orange
    : P.textMuted;

  return (
    <tr style={{
      background: idx % 2 === 0 ? "#fff" : P.greyLight,
      fontSize: 11, transition: "background 0.12s",
    }}>
      <td style={{ padding: "4px 8px", fontWeight: 600, color: P.text, whiteSpace: "nowrap" }}>
        {ticket.siteName}
      </td>
      <td style={{ padding: "4px 8px" }}>
        <Badge
          text={ticket.type}
          bg={ticket.type === "power" ? "#FFF3CD" : "#EDE7F6"}
          fg={ticket.type === "power" ? "#856404" : P.purple}
        />
      </td>
      <td style={{ padding: "4px 8px", color: P.textMuted, maxWidth: 160,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {ticket.title}
      </td>
      <td style={{ padding: "4px 8px" }}>
        <Badge text={ticket.status.replace("_", " ")} bg={statusBg} />
      </td>
      <td style={{ padding: "4px 8px", fontWeight: 700, color: priorityColor }}>
        {ticket.priority}
      </td>
      <td style={{ padding: "4px 8px", color: P.textMuted, whiteSpace: "nowrap" }}>
        {new Date(ticket.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </td>
      <td style={{ padding: "4px 8px", color: P.textMuted }}>{ticket.assignedTo ?? "—"}</td>
    </tr>
  );
}

// ─── Ticket table ─────────────────────────────────────────────────────────────
function TicketTable({ title, tickets, accent }: { title: string; tickets: any[]; accent: string }) {
  const cols = ["Site", "Type", "Title", "Status", "Priority", "Time", "Assigned To"];
  return (
    <div style={{
      background: "#fff", borderRadius: 10, overflow: "hidden",
      display: "flex", flexDirection: "column",
      boxShadow: "0 2px 12px rgba(107,31,162,0.08)", border: `1px solid ${P.grey}`,
    }}>
      <div style={{
        background: `linear-gradient(90deg, ${P.purpleDark} 0%, ${P.purple} 100%)`,
        color: "#fff", fontSize: 12, fontWeight: 700,
        padding: "7px 12px", display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          display: "inline-block", width: 8, height: 8, borderRadius: "50%",
          background: accent, boxShadow: `0 0 6px ${accent}`,
        }} />
        {title}
        <span style={{
          marginLeft: "auto", background: "rgba(255,255,255,0.2)",
          borderRadius: 20, padding: "1px 10px", fontSize: 10,
        }}>
          {tickets.length} active
        </span>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: P.greyLight }}>
              {cols.map((h) => (
                <th key={h} style={{
                  padding: "5px 8px", fontSize: 10, fontWeight: 700,
                  textAlign: "left", color: P.purple,
                  borderBottom: `2px solid ${P.grey}`,
                  position: "sticky", top: 0, background: P.greyLight,
                  letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={7} style={{
                  textAlign: "center", color: P.green,
                  fontSize: 12, padding: "16px", fontWeight: 600,
                }}>
                  ✓ No active tickets
                </td>
              </tr>
            ) : (
              tickets.map((t, i) => <TicketRow key={t.id} ticket={t} idx={i} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [areaFilter, setAreaFilter]   = useState("All");
  const [statusFilter, setStatusFilter] = useState("Open");
  const [cowIdFilter, setCowIdFilter] = useState("All");
  const clock = useClock();

  const dateStr = clock.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = clock.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const { data: sites }   = useListSites();
  const { data: tickets } = useListTickets();
  useGetDashboardSummary();
  useGetSiteStatus();

  const zones = useMemo(() => {
    const all = sites ?? [];
    return ["Arafat", "Mina", "Muzdalifah", "Haram", "Makkah Remote"].map((area) => {
      const zs = all.filter((s) => s.zone === area);
      const op   = zs.filter((s) => s.status === "operational").length;
      const down = zs.filter((s) => s.status !== "operational").length;
      return { area, total: zs.length, op, down, avail: availability(op, zs.length) };
    });
  }, [sites]);

  const zoneMap = Object.fromEntries(zones.map((z) => [z.area, z]));
  const arafat      = zoneMap["Arafat"];
  const mina        = zoneMap["Mina"];
  const muzdalifah  = zoneMap["Muzdalifah"];
  const makkahRemote = zoneMap["Makkah Remote"];
  const haram       = zoneMap["Haram"];

  const overallAvail = useMemo(() => {
    const all = sites ?? [];
    if (!all.length) return 100;
    return availability(all.filter((s) => s.status === "operational").length, all.length);
  }, [sites]);

  const totalSites   = sites?.length ?? 0;
  const offlineSites = (sites ?? []).filter((s) => s.status !== "operational").length;

  const mapSites = useMemo(() =>
    (sites ?? []).filter((s) =>
      s.latitude != null && s.longitude != null &&
      (areaFilter === "All" || s.zone === areaFilter)
    ), [sites, areaFilter]);

  const openTickets   = useMemo(() => (tickets ?? []).filter((t) => t.status === "open" || t.status === "in_progress"), [tickets]);
  const powerTickets  = useMemo(() => openTickets.filter((t) => t.type === "power"),   [openTickets]);
  const telecomTickets = useMemo(() => openTickets.filter((t) => t.type === "telecom"), [openTickets]);

  const areaOptions = [
    { key: "All",          label: "All" },
    { key: "Arafat",       label: "Arafat" },
    { key: "Mina",         label: "Mina" },
    { key: "Muzdalifah",   label: "Muzdalifah" },
    { key: "Makkah Remote",label: "Makkah R." },
    { key: "Haram",        label: "Haram" },
  ];

  const activeAvail =
    areaFilter === "All"           ? overallAvail
    : areaFilter === "Arafat"      ? (arafat?.avail ?? 100)
    : areaFilter === "Mina"        ? (mina?.avail ?? 100)
    : areaFilter === "Muzdalifah"  ? (muzdalifah?.avail ?? 100)
    : areaFilter === "Makkah Remote" ? (makkahRemote?.avail ?? 100)
    : areaFilter === "Haram"       ? (haram?.avail ?? 100)
    : overallAvail;

  return (
    <div style={{
      width: "100vw", height: "100vh",
      background: "#F0EDF5",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div style={{
        background: `linear-gradient(135deg, ${P.purpleDeep} 0%, ${P.purpleDark} 40%, ${P.purple} 100%)`,
        padding: "0 16px",
        display: "flex", alignItems: "center", gap: 14,
        flexShrink: 0, height: 58,
        boxShadow: "0 3px 16px rgba(75,0,110,0.4)",
      }}>
        <img src="/stc-logo.png" alt="STC" style={{ height: 38, width: "auto", objectFit: "contain" }} />

        <div style={{
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 8, padding: "4px 12px", fontSize: 10, color: "rgba(255,255,255,0.85)",
          flexShrink: 0, lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 700, fontSize: 11 }}>{dateStr}</div>
          <div style={{ opacity: 0.75 }}>⟳ {timeStr}</div>
        </div>

        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 21, fontWeight: 900, color: "#fff", letterSpacing: 0.5,
            textShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>
            COW HAJJ 1447 — Interactive Status
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: "0.06em",
            textTransform: "uppercase" }}>
            Real-time monitoring of all deployed COW sites
          </div>
        </div>

        {/* Live status pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(0,200,120,0.15)", border: "1px solid rgba(0,200,120,0.4)",
          borderRadius: 20, padding: "4px 12px",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%", background: P.green,
            boxShadow: `0 0 8px ${P.green}`, display: "inline-block",
            animation: "pulse 2s infinite",
          }} />
          <span style={{ color: P.green, fontSize: 11, fontWeight: 700 }}>LIVE</span>
        </div>

        <img src="/aces-logo.png" alt="ACES" style={{ height: 42, width: "auto", objectFit: "contain" }} />
      </div>

      {/* ══ MAIN BODY ════════════════════════════════════════════════════════ */}
      <div style={{
        flex: 1, display: "grid",
        gridTemplateColumns: "200px 1fr 190px",
        gap: 6, padding: 6,
        overflow: "hidden", minHeight: 0,
      }}>

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
        <div style={{
          background: `linear-gradient(160deg, ${P.purpleDeep} 0%, #2D0A5A 100%)`,
          borderRadius: 12, display: "flex", flexDirection: "column",
          gap: 8, padding: "10px 8px", overflow: "hidden",
          boxShadow: "0 4px 20px rgba(26,5,51,0.5)",
        }}>

          {/* COW ID */}
          <SideLabel text="COW ID" />
          <select
            value={cowIdFilter}
            onChange={(e) => setCowIdFilter(e.target.value)}
            style={{
              width: "100%", fontSize: 11,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 6, padding: "5px 8px",
              color: "#fff", cursor: "pointer", outline: "none",
            }}
          >
            <option value="All" style={{ background: P.purpleDeep }}>All Sites</option>
            {(sites ?? []).map((s) => (
              <option key={s.id} value={s.name} style={{ background: P.purpleDeep }}>{s.name}</option>
            ))}
          </select>

          {/* Status */}
          <SideLabel text="Status" />
          <div style={{ display: "flex", gap: 4 }}>
            {["Closed", "Open"].map((s) => {
              const active = statusFilter === s;
              return (
                <button key={s} onClick={() => setStatusFilter(s)} style={{
                  flex: 1, padding: "5px 0", fontSize: 11, fontWeight: 700,
                  borderRadius: 6, border: "none", cursor: "pointer",
                  background: active ? P.green : "rgba(255,255,255,0.08)",
                  color: active ? P.purpleDeep : "rgba(255,255,255,0.7)",
                  transition: "all 0.15s",
                  boxShadow: active ? `0 2px 8px ${P.greenDark}55` : "none",
                }}>
                  {s}
                </button>
              );
            })}
          </div>

          {/* Area */}
          <SideLabel text="Area" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {areaOptions.map(({ key, label }) => {
              const active = areaFilter === key;
              return (
                <button key={key} onClick={() => setAreaFilter(key)} style={{
                  padding: "4px 8px", fontSize: 10, fontWeight: 600,
                  borderRadius: 20, cursor: "pointer", transition: "all 0.15s",
                  border: `1px solid ${active ? P.green : "rgba(255,255,255,0.25)"}`,
                  background: active ? P.green : "rgba(255,255,255,0.06)",
                  color: active ? P.purpleDeep : "rgba(255,255,255,0.8)",
                  boxShadow: active ? `0 2px 8px ${P.greenDark}55` : "none",
                }}>
                  {label}
                </button>
              );
            })}
          </div>

          {/* Classification */}
          <SideLabel text="Classification" />
          <div style={{ display: "flex", gap: 4 }}>
            {["Normal", "VIP", "VVVIP"].map((c) => (
              <button key={c} style={{
                flex: 1, padding: "4px 0", fontSize: 9, fontWeight: 700,
                borderRadius: 6, cursor: "pointer", transition: "all 0.15s",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.75)",
              }}>
                {c}
              </button>
            ))}
          </div>

          {/* Zone gauges */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, overflow: "hidden" }}>
            {[
              { label: "Arafat",   val: arafat?.avail   ?? 100 },
              { label: "Muzdalifah", val: muzdalifah?.avail ?? 100 },
              { label: "Mina",     val: mina?.avail     ?? 100 },
              { label: "Makkah R.", val: makkahRemote?.avail ?? 100 },
            ].map(({ label, val }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.05)", borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", overflow: "hidden", padding: "2px 0",
              }}>
                <Gauge value={val} label={label} size={82} />
              </div>
            ))}
          </div>
        </div>

        {/* ── CENTER: MAP + SITE CLASS COLUMN ───────────────────────────── */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 82px",
          gap: 6, minHeight: 0, overflow: "hidden",
        }}>
          {/* Map */}
          <div style={{
            borderRadius: 12, overflow: "hidden",
            boxShadow: "0 4px 20px rgba(26,5,51,0.25)",
            position: "relative", background: "#0a0a1a",
          }}>
            {/* Scrolling availability ticker */}
            {(() => {
              const tickerZones = [
                { label: "Mina",          avail: mina?.avail          ?? 100 },
                { label: "Muzdalifah",    avail: muzdalifah?.avail    ?? 100 },
                { label: "Arafat",        avail: arafat?.avail        ?? 100 },
                { label: "Makkah Remote", avail: makkahRemote?.avail  ?? 100 },
              ];
              const itemColor = (v: number) => v >= 95 ? P.green : v >= 80 ? P.orange : P.red;
              const sep = <span style={{ margin: "0 18px", opacity: 0.3, fontSize: 14 }}>|</span>;

              const items = tickerZones.map(({ label, avail }, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: itemColor(avail),
                    boxShadow: `0 0 7px ${itemColor(avail)}`,
                    display: "inline-block", flexShrink: 0,
                  }} />
                  <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.9)", fontSize: 12 }}>{label}</span>
                  <span style={{ color: itemColor(avail), fontWeight: 800, fontSize: 12 }}>
                    {avail.toFixed(2)}%
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 500 }}>available</span>
                  {i < tickerZones.length - 1 && sep}
                </span>
              ));

              return (
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0,
                  zIndex: 1000, overflow: "hidden",
                  background: "rgba(10,0,30,0.82)",
                  backdropFilter: "blur(8px)",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                  height: 30, display: "flex", alignItems: "center",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center",
                    animation: "tickerScroll 22s linear infinite",
                    width: "max-content",
                    gap: 0,
                  }}>
                    {/* Duplicate so the loop is seamless: animation moves -50% = exactly one full copy */}
                    {items}{sep}{items}
                  </div>
                </div>
              );
            })()}

            {/* Legend */}
            <div style={{
              position: "absolute", bottom: 32, left: 8, zIndex: 1000,
              background: "rgba(10,0,30,0.82)", backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "6px 10px",
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              {[
                { color: P.green,  label: "ON-AIR" },
                { color: P.orange, label: "Degraded" },
                { color: P.red,    label: "OFF-AIR" },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 9, height: 9, borderRadius: "50%", background: color,
                    boxShadow: `0 0 6px ${color}`,
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#fff" }}>{label}</span>
                </div>
              ))}
            </div>

            <Map3D sites={[]} areaFilter={areaFilter} />
          </div>

          {/* Site class cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, overflow: "hidden" }}>
            {[
              { label: "VVVIP SITES",  count: 3,                 gradient: `linear-gradient(160deg, #8B0000 0%, #C0392B 100%)` },
              { label: "VVIP SITES",   count: 7,                 gradient: `linear-gradient(160deg, ${P.purpleDark} 0%, ${P.purple} 100%)` },
              { label: "VIP SITES",    count: 15,                gradient: `linear-gradient(160deg, #1565C0 0%, #1E88E5 100%)` },
              { label: "NORMAL SITES", count: totalSites - 25,   gradient: `linear-gradient(160deg, #2E7D32 0%, ${P.green} 100%)` },
            ].map((item) => (
              <ClassCard key={item.label} {...item} />
            ))}
          </div>
        </div>

        {/* ── RIGHT PANEL ───────────────────────────────────────────────── */}
        <div style={{
          background: "#fff", borderRadius: 12,
          display: "flex", flexDirection: "column",
          gap: 8, padding: "10px 10px",
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(107,31,162,0.10)",
          border: `1px solid ${P.grey}`,
        }}>
          {/* Main gauge */}
          <div style={{
            background: `linear-gradient(135deg, ${P.greyLight} 0%, #fff 100%)`,
            borderRadius: 10, padding: "8px 6px",
            border: `1px solid ${P.grey}`,
            display: "flex", flexDirection: "column", alignItems: "center",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: P.purple,
              textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
              Overall Availability
            </div>
            <Gauge value={overallAvail} label="" size={125} />
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%",
              fontSize: 10, color: P.textMuted, marginTop: -4, padding: "0 4px" }}>
              <span style={{ color: P.red, fontWeight: 600 }}>0%</span>
              <span style={{ fontWeight: 600 }}>100%</span>
            </div>
          </div>

          {/* Per-area stats */}
          <div style={{ display: "flex", gap: 5 }}>
            <AreaStat label="Arafat"     op={arafat?.op ?? 0}     total={arafat?.total ?? 0}     down={arafat?.down ?? 0} />
            <AreaStat label="Muzdalifah" op={muzdalifah?.op ?? 0} total={muzdalifah?.total ?? 0} down={muzdalifah?.down ?? 0} />
            <AreaStat label="Mina"       op={mina?.op ?? 0}       total={mina?.total ?? 0}       down={mina?.down ?? 0} />
          </div>

          {/* KPI list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4,
            borderTop: `1px solid ${P.grey}`, paddingTop: 6, flex: 1 }}>
            {[
              { label: "2G Down Sites",      value: offlineSites > 0 ? Math.ceil(offlineSites * 0.2)  : 0, accent: P.purple },
              { label: "4G Down Sites",      value: offlineSites > 0 ? Math.ceil(offlineSites * 0.5)  : 0, accent: P.purple },
              { label: "5G Down Sites",      value: offlineSites > 0 ? Math.floor(offlineSites * 0.3) : 0, accent: P.purple },
              { label: "Total Outage Tickets", value: openTickets.length,  accent: P.red },
              { label: "Power Tickets",        value: powerTickets.length, accent: P.orange },
            ].map(({ label, value, accent }) => (
              <KpiRow key={label} label={label} value={value} accent={accent} />
            ))}
          </div>
        </div>
      </div>

      {/* ══ BOTTOM: TICKET TABLES ════════════════════════════════════════════ */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 6, padding: "0 6px 6px",
        height: 192, flexShrink: 0, overflow: "hidden",
      }}>
        <TicketTable title="Running Power Outage Tickets"       tickets={powerTickets}  accent={P.orange} />
        <TicketTable title="Running Telecom (NSA) Outage Tickets" tickets={telecomTickets} accent={P.purple} />
      </div>

      {/* CSS for live-pulse animation */}
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
