import { useState, useEffect, useMemo } from "react";
import {
  useGetDashboardSummary,
  useGetSiteStatus,
  useListTickets,
  useListSites,
} from "@workspace/api-client-react";
import { PieChart, Pie, Cell } from "recharts";
import SatelliteMap from "@/components/SatelliteMap";

// ─── STC brand palette ────────────────────────────────────────────────────────
const STC_PURPLE = "#6B1FA2";
const STC_PURPLE_DARK = "#4B006E";
const STC_GREEN = "#00A86B";
const STC_RED = "#D32F2F";
const STC_ORANGE = "#F59E0B";
const STC_GREY = "#E5E0EE";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const now = new Date();
const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function availability(operational: number, total: number) {
  if (!total) return 100;
  return Math.round((operational / total) * 10000) / 100;
}

// ─── Semi-circular gauge ──────────────────────────────────────────────────────
function Gauge({ value, label, size = 90 }: { value: number; label: string; size?: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const needleAngle = -90 + pct * 1.8; // -90 = leftmost, +90 = rightmost
  const r = size * 0.42;
  const cx = size / 2;
  const cy = size * 0.6;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const nx = cx + r * Math.cos(rad(needleAngle));
  const ny = cy + r * Math.sin(rad(needleAngle));

  const gaugeData = [
    { value: pct, color: pct > 95 ? STC_GREEN : pct > 80 ? STC_ORANGE : STC_RED },
    { value: 100 - pct, color: STC_GREY },
  ];

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div style={{ position: "relative", width: size, height: size * 0.65 }}>
        <PieChart width={size} height={size}>
          <Pie
            data={gaugeData}
            cx={cx}
            cy={cy}
            startAngle={180}
            endAngle={0}
            innerRadius={r * 0.68}
            outerRadius={r}
            dataKey="value"
            stroke="none"
          >
            {gaugeData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
        {/* Needle */}
        <svg
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
          width={size}
          height={size}
        >
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke="#333"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r={3} fill="#444" />
        </svg>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: pct > 95 ? STC_GREEN : STC_ORANGE, marginTop: -12 }}>
        {pct.toFixed(2)}%
      </div>
      <div style={{ fontSize: 9, color: "#555", textAlign: "center", lineHeight: 1.2 }}>{label}</div>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div
      style={{
        background: "white",
        border: `1px solid ${STC_GREY}`,
        borderRadius: 4,
        padding: "4px 10px",
        textAlign: "center",
        minWidth: 100,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ?? STC_PURPLE }}>{value}</div>
      <div style={{ fontSize: 9, color: "#555", lineHeight: 1.2 }}>{label}</div>
    </div>
  );
}

// ─── Section header bar ───────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        background: STC_PURPLE,
        color: "white",
        fontSize: 9,
        fontWeight: 700,
        textAlign: "center",
        padding: "3px 6px",
        borderRadius: 2,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {title}
    </div>
  );
}

// ─── Progress bar for area stats ──────────────────────────────────────────────
function AreaBar({ label, value, max = 80, downSites }: { label: string; value: number; max?: number; downSites: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 9, fontWeight: 600, color: STC_PURPLE_DARK, marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 2, justifyContent: "center" }}>
        <span style={{ fontSize: 8, color: "#888", width: 14 }}>0</span>
        <div style={{ flex: 1, height: 10, background: STC_GREY, borderRadius: 3, overflow: "hidden", maxWidth: 60 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: STC_GREEN, borderRadius: 3 }} />
        </div>
        <span style={{ fontSize: 8, color: "#888", width: 16 }}>{max}</span>
      </div>
      <div style={{ fontSize: 8, color: "#888", marginTop: 1 }}>{value} operational</div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: downSites > 0 ? STC_RED : STC_GREEN,
          marginTop: 2,
        }}
      >
        {downSites}
      </div>
      <div style={{ fontSize: 8, color: "#888" }}>{label} Down Sites</div>
    </div>
  );
}

// ─── Ticket row ───────────────────────────────────────────────────────────────
function TicketRow({ ticket, cols }: { ticket: any; cols: string[] }) {
  const statusColor =
    ticket.status === "open" ? STC_RED : ticket.status === "in_progress" ? STC_ORANGE : STC_GREEN;
  const priorityColor =
    ticket.priority === "critical" ? STC_RED : ticket.priority === "high" ? STC_ORANGE : "#888";

  return (
    <tr style={{ borderBottom: `1px solid ${STC_GREY}`, fontSize: 9 }}>
      <td style={{ padding: "2px 4px", whiteSpace: "nowrap" }}>{ticket.siteName}</td>
      <td style={{ padding: "2px 4px", color: ticket.type === "power" ? STC_ORANGE : STC_PURPLE }}>
        {ticket.type}
      </td>
      <td style={{ padding: "2px 4px", whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
        {ticket.title}
      </td>
      <td style={{ padding: "2px 4px" }}>
        <span
          style={{
            background: statusColor,
            color: "white",
            borderRadius: 2,
            padding: "1px 4px",
            fontSize: 8,
            textTransform: "uppercase",
          }}
        >
          {ticket.status}
        </span>
      </td>
      <td style={{ padding: "2px 4px" }}>
        <span style={{ color: priorityColor, fontWeight: 600, fontSize: 8 }}>{ticket.priority}</span>
      </td>
      <td style={{ padding: "2px 4px", color: "#888" }}>
        {new Date(ticket.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </td>
      <td style={{ padding: "2px 4px", color: "#888" }}>{ticket.assignedTo ?? "—"}</td>
    </tr>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [areaFilter, setAreaFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("Open");
  const [cowIdFilter, setCowIdFilter] = useState<string>("All");
  const [lastRefresh, setLastRefresh] = useState(timeStr);

  const { data: summary } = useGetDashboardSummary();
  const { data: siteStatus } = useGetSiteStatus();
  const { data: sites } = useListSites();
  const { data: tickets } = useListTickets();

  useEffect(() => {
    const id = setInterval(() => {
      setLastRefresh(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Derived stats per zone ──────────────────────────────────────────────────
  const zones = useMemo(() => {
    const allSites = sites ?? [];
    const areas = ["Arafat", "Mina", "Muzdalifah", "Haram", "Makkah Remote"];
    return areas.map((area) => {
      const zoneSites = allSites.filter((s) => s.zone === area);
      const op = zoneSites.filter((s) => s.status === "operational").length;
      const down = zoneSites.filter((s) => s.status !== "operational").length;
      return { area, total: zoneSites.length, op, down, avail: availability(op, zoneSites.length) };
    });
  }, [sites]);

  const arafat = zones.find((z) => z.area === "Arafat");
  const mina = zones.find((z) => z.area === "Mina");
  const muzdalifah = zones.find((z) => z.area === "Muzdalifah");
  const makkahRemote = zones.find((z) => z.area === "Makkah Remote");
  const haram = zones.find((z) => z.area === "Haram");

  const overallAvail = useMemo(() => {
    const allSites = sites ?? [];
    if (!allSites.length) return 100;
    const op = allSites.filter((s) => s.status === "operational").length;
    return availability(op, allSites.length);
  }, [sites]);

  // ── Filtered sites for map markers ─────────────────────────────────────────
  const mapSites = useMemo(() => {
    return (sites ?? []).filter((s) => {
      if (s.latitude == null || s.longitude == null) return false;
      if (areaFilter !== "All" && s.zone !== areaFilter) return false;
      return true;
    });
  }, [sites, areaFilter]);

  // ── Filtered tickets for tables ─────────────────────────────────────────────
  const openTickets = useMemo(() => {
    return (tickets ?? []).filter((t) => t.status === "open" || t.status === "in_progress");
  }, [tickets]);

  const powerTickets = useMemo(() => {
    return openTickets.filter((t) => t.type === "power");
  }, [openTickets]);

  const telecomTickets = useMemo(() => {
    return openTickets.filter((t) => t.type === "telecom");
  }, [openTickets]);

  const totalSites = sites?.length ?? 0;
  const offlineSites = (sites ?? []).filter((s) => s.status !== "operational").length;

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const areas = ["All", "Arafat", "Makkah R...", "Mina", "Muzdalifah"];
  const areaMap: Record<string, string> = {
    "All": "All",
    "Arafat": "Arafat",
    "Makkah R...": "Makkah Remote",
    "Mina": "Mina",
    "Muzdalifah": "Muzdalifah",
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#F0EDF5",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div
        style={{
          background: "white",
          borderBottom: `2px solid ${STC_PURPLE}`,
          padding: "6px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
          height: 52,
        }}
      >
        {/* STC Logo */}
        <div
          style={{
            background: STC_PURPLE,
            color: "white",
            fontWeight: 900,
            fontSize: 18,
            padding: "2px 10px",
            borderRadius: 3,
            letterSpacing: 1,
            fontStyle: "italic",
          }}
        >
          stc
        </div>

        {/* Date box */}
        <div
          style={{
            border: `1px solid ${STC_GREY}`,
            borderRadius: 3,
            padding: "2px 8px",
            fontSize: 9,
            textAlign: "center",
            color: "#555",
          }}
        >
          <div style={{ fontWeight: 600 }}>{dateStr}</div>
          <div>Last Refresh: {lastRefresh}</div>
        </div>

        {/* Title */}
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: STC_PURPLE_DARK, letterSpacing: 0.5 }}>
            COW HAJJ 1447 Interactive Status
          </div>
          <div style={{ fontSize: 9, color: "#888" }}>Real-time monitoring of all deployed COW sites</div>
        </div>

        {/* KPIs inline */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <KpiCard label="No. of 2G Down Sites" value={offlineSites > 0 ? Math.ceil(offlineSites * 0.2) : 0} accent={STC_PURPLE} />
          <KpiCard label="No. of 4G Down Sites" value={offlineSites > 0 ? Math.ceil(offlineSites * 0.5) : 0} accent={STC_PURPLE} />
          <KpiCard label="No. of 5G Down Sites" value={offlineSites > 0 ? Math.floor(offlineSites * 0.3) : 0} accent={STC_PURPLE} />
          <KpiCard label="# Total Outages Tickets" value={openTickets.length} accent={STC_RED} />
          <KpiCard label="# Total Power Tickets" value={powerTickets.length} accent={STC_ORANGE} />
        </div>

        {/* ACES logo */}
        <div
          style={{
            border: `2px solid ${STC_PURPLE}`,
            color: STC_PURPLE,
            fontWeight: 900,
            fontSize: 13,
            padding: "2px 8px",
            borderRadius: 3,
            letterSpacing: 1,
          }}
        >
          /ACES
        </div>
      </div>

      {/* ══ MAIN BODY ════════════════════════════════════════════════════════ */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "210px 1fr 180px",
          gridTemplateRows: "1fr",
          gap: 6,
          padding: 6,
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
        <div
          style={{
            background: "white",
            borderRadius: 4,
            border: `1px solid ${STC_GREY}`,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 6,
            overflow: "hidden",
          }}
        >
          {/* COW ID */}
          <SectionHeader title="COW ID" />
          <select
            value={cowIdFilter}
            onChange={(e) => setCowIdFilter(e.target.value)}
            style={{
              width: "100%",
              fontSize: 9,
              border: `1px solid ${STC_GREY}`,
              borderRadius: 3,
              padding: "3px 6px",
              color: "#333",
              cursor: "pointer",
            }}
          >
            <option value="All">All</option>
            {(sites ?? []).map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Status */}
          <SectionHeader title="Status" />
          <div style={{ display: "flex", gap: 4 }}>
            {["Closed", "Open"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  flex: 1,
                  padding: "3px 0",
                  fontSize: 9,
                  fontWeight: 600,
                  borderRadius: 3,
                  border: "none",
                  cursor: "pointer",
                  background: statusFilter === s ? STC_PURPLE : STC_GREY,
                  color: statusFilter === s ? "white" : "#555",
                  transition: "all 0.15s",
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Area */}
          <SectionHeader title="Area" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {areas.map((a) => (
              <button
                key={a}
                onClick={() => setAreaFilter(areaMap[a])}
                style={{
                  padding: "2px 6px",
                  fontSize: 8,
                  fontWeight: 600,
                  borderRadius: 3,
                  border: `1px solid ${STC_PURPLE}`,
                  cursor: "pointer",
                  background: areaFilter === areaMap[a] ? STC_PURPLE : "white",
                  color: areaFilter === areaMap[a] ? "white" : STC_PURPLE,
                  transition: "all 0.15s",
                }}
              >
                {a}
              </button>
            ))}
          </div>

          {/* Classification */}
          <SectionHeader title="Classification" />
          <div style={{ display: "flex", gap: 4 }}>
            {["Normal", "VIP", "VVVIP"].map((c) => (
              <button
                key={c}
                style={{
                  flex: 1,
                  padding: "2px 0",
                  fontSize: 8,
                  fontWeight: 600,
                  borderRadius: 3,
                  border: `1px solid ${STC_GREY}`,
                  cursor: "pointer",
                  background: "white",
                  color: STC_PURPLE,
                }}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Availability gauges */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, flex: 1, overflow: "hidden" }}>
            <div style={{ textAlign: "center" }}>
              <Gauge value={arafat?.avail ?? 100} label="Arafat Availability" size={95} />
            </div>
            <div style={{ textAlign: "center" }}>
              <Gauge value={muzdalifah?.avail ?? 100} label="Muzdalifah Availability" size={95} />
            </div>
            <div style={{ textAlign: "center" }}>
              <Gauge value={mina?.avail ?? 100} label="Mina Availability" size={95} />
            </div>
            <div style={{ textAlign: "center" }}>
              <Gauge value={makkahRemote?.avail ?? 100} label="Makkah Remote" size={95} />
            </div>
          </div>
        </div>

        {/* ── CENTER: MAP + SITE COUNTS ───────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 90px",
            gridTemplateRows: "1fr",
            gap: 6,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {/* Map */}
          <div
            style={{
              background: "#0a0a1a",
              borderRadius: 4,
              overflow: "hidden",
              border: `1px solid ${STC_GREY}`,
              position: "relative",
            }}
          >
            {/* Area availability overlay */}
            <div
              style={{
                position: "absolute",
                top: 6,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 1000,
                background: "rgba(0,0,0,0.75)",
                color: "white",
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 3,
                whiteSpace: "nowrap",
              }}
            >
              {areaFilter === "All" ? "All Areas" : areaFilter} —{" "}
              {areaFilter === "All"
                ? overallAvail.toFixed(2)
                : areaFilter === "Arafat"
                ? arafat?.avail.toFixed(2)
                : areaFilter === "Mina"
                ? mina?.avail.toFixed(2)
                : areaFilter === "Muzdalifah"
                ? muzdalifah?.avail.toFixed(2)
                : areaFilter === "Makkah Remote"
                ? makkahRemote?.avail.toFixed(2)
                : overallAvail.toFixed(2)}
              % Available
            </div>

            {/* Legend */}
            <div
              style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                zIndex: 1000,
                background: "rgba(255,255,255,0.9)",
                borderRadius: 3,
                padding: "4px 8px",
                fontSize: 8,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {[
                { color: STC_GREEN, label: "ON-AIR" },
                { color: STC_ORANGE, label: "Degraded" },
                { color: STC_RED, label: "OFF-AIR" },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            <SatelliteMap sites={mapSites} />
          </div>

          {/* Site type count column */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              overflow: "hidden",
            }}
          >
            {[
              { label: "# OF VVVIP SITES", count: 3 },
              { label: "# OF VVIP SITES", count: 7 },
              { label: "# OF VIP SITES", count: 15 },
              { label: "# OF NORMAL SITES", count: totalSites - 25 },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: "white",
                  border: `2px solid ${STC_PURPLE}`,
                  borderRadius: 4,
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 4,
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 700, color: STC_PURPLE }}>
                  {item.count}
                </div>
                <div style={{ fontSize: 8, color: "#555", textAlign: "center", lineHeight: 1.2 }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
        <div
          style={{
            background: "white",
            borderRadius: 4,
            border: `1px solid ${STC_GREY}`,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: 8,
            overflow: "hidden",
            alignItems: "center",
          }}
        >
          {/* Main availability gauge */}
          <div
            style={{
              border: `2px solid ${STC_GREEN}`,
              borderRadius: 6,
              padding: 8,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, color: "#444" }}>Availability</div>
            <Gauge value={overallAvail} label="" size={120} />
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: 9, color: "#888" }}>
              <span style={{ color: STC_RED }}>0.00 ↑</span>
              <span>80.00</span>
            </div>
          </div>

          {/* Per-area bars */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, width: "100%" }}>
            <AreaBar label="Arafat" value={arafat?.op ?? 0} max={arafat?.total ?? 30} downSites={arafat?.down ?? 0} />
            <AreaBar label="Muzdalifah" value={muzdalifah?.op ?? 0} max={muzdalifah?.total ?? 30} downSites={muzdalifah?.down ?? 0} />
            <AreaBar label="Mina" value={mina?.op ?? 0} max={mina?.total ?? 15} downSites={mina?.down ?? 0} />
          </div>
        </div>
      </div>

      {/* ══ BOTTOM: TICKET TABLES ════════════════════════════════════════════ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          padding: "0 6px 6px",
          height: 150,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* Power Tickets Table */}
        <div
          style={{
            background: "white",
            borderRadius: 4,
            border: `1px solid ${STC_GREY}`,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              background: STC_PURPLE,
              color: "white",
              fontSize: 9,
              fontWeight: 700,
              padding: "4px 8px",
              letterSpacing: "0.04em",
            }}
          >
            Running Power Outage Tickets
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F5F0FA" }}>
                  {["Site", "Type", "Title", "Status", "Priority", "Time", "Assigned To"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "2px 4px",
                        fontSize: 8,
                        fontWeight: 700,
                        textAlign: "left",
                        color: STC_PURPLE_DARK,
                        borderBottom: `1px solid ${STC_GREY}`,
                        position: "sticky",
                        top: 0,
                        background: "#F5F0FA",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {powerTickets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ textAlign: "center", color: STC_GREEN, fontSize: 9, padding: "10px", fontWeight: 600 }}
                    >
                      No power outage tickets
                    </td>
                  </tr>
                ) : (
                  powerTickets.map((t) => (
                    <TicketRow key={t.id} ticket={t} cols={[]} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Telecom Tickets Table */}
        <div
          style={{
            background: "white",
            borderRadius: 4,
            border: `1px solid ${STC_GREY}`,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              background: STC_PURPLE,
              color: "white",
              fontSize: 9,
              fontWeight: 700,
              padding: "4px 8px",
              letterSpacing: "0.04em",
            }}
          >
            Running Telecom (NSA) Outage Tickets
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F5F0FA" }}>
                  {["Site", "Type", "Title", "Status", "Priority", "Time", "Assigned To"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "2px 4px",
                        fontSize: 8,
                        fontWeight: 700,
                        textAlign: "left",
                        color: STC_PURPLE_DARK,
                        borderBottom: `1px solid ${STC_GREY}`,
                        position: "sticky",
                        top: 0,
                        background: "#F5F0FA",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {telecomTickets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ textAlign: "center", color: STC_GREEN, fontSize: 9, padding: "10px", fontWeight: 600 }}
                    >
                      No telecom outage tickets
                    </td>
                  </tr>
                ) : (
                  telecomTickets.map((t) => (
                    <TicketRow key={t.id} ticket={t} cols={[]} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
