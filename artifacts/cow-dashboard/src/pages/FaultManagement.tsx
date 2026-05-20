import { useState, useEffect, useRef, useMemo } from "react";
import FaultMap from "@/components/FaultMap";

// ── Re-exported types (used by FaultMap) ──────────────────────────────────────
export type FaultSeverity = "critical" | "major" | "minor" | "monitoring";
export type FaultStatus   = "Assigned" | "En Route" | "Arrived" | "Working" | "Resolved" | "Closed";
export interface FaultRecord {
  id: string; cowId: string; alarm: string; alarmType: "power" | "nsa";
  severity: FaultSeverity; status: FaultStatus;
  assignedTeam: string; teamId: string;
  dispatchTime: number; etaMinutes: number; etaExpiry: number;
  arrivedAt: number | null; resolvedAt: number | null; closedAt: number | null;
  backupRemainingMin: number | null; area: string;
  teamLat: number; teamLng: number;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const P = {
  purple:     "#4E008E",
  purpleDark: "#38006A",
  purpleDeep: "#14002A",
  glass:      "rgba(78,0,142,0.84)",
  glassBorder:"rgba(200,140,255,0.28)",
  green:      "#00C878", red: "#EF4444", orange: "#F59E0B", blue: "#3B82F6",
};

const SEV: Record<FaultSeverity, { color: string; label: string; bg: string }> = {
  critical:   { color: "#EF4444", label: "CRITICAL",   bg: "rgba(239,68,68,.18)"   },
  major:      { color: "#F59E0B", label: "MAJOR",      bg: "rgba(245,158,11,.18)"  },
  minor:      { color: "#FACC15", label: "MINOR",      bg: "rgba(250,204,21,.18)"  },
  monitoring: { color: "#3B82F6", label: "MONITORING", bg: "rgba(59,130,246,.18)"  },
};

const STAT: Record<FaultStatus, { color: string; bg: string }> = {
  "Assigned":  { color: "#A78BFA", bg: "rgba(167,139,250,.18)" },
  "En Route":  { color: "#60A5FA", bg: "rgba(96,165,250,.18)"  },
  "Arrived":   { color: "#34D399", bg: "rgba(52,211,153,.18)"  },
  "Working":   { color: "#FBBF24", bg: "rgba(251,191,36,.18)"  },
  "Resolved":  { color: "#4ADE80", bg: "rgba(74,222,128,.18)"  },
  "Closed":    { color: "#9CA3AF", bg: "rgba(156,163,175,.18)" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(ms: number) {
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fmtTime(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function nowStr() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
function nowDate() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// ── Glass component ───────────────────────────────────────────────────────────
function Glass({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: P.glass, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      border: `1px solid ${P.glassBorder}`, borderRadius: 12,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, accent, sub }: { label: string; value: string | number; accent: string; sub?: string }) {
  return (
    <Glass style={{ padding: "12px 18px", flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, color: "rgba(200,140,255,.75)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: accent, lineHeight: 1.1, textShadow: `0 0 16px ${accent}88` }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 2 }}>{sub}</div>}
    </Glass>
  );
}

// ── Fault list item ───────────────────────────────────────────────────────────
function FaultItem({ fault, selected, onClick }: { fault: FaultRecord; selected: boolean; onClick: () => void }) {
  const s = SEV[fault.severity];
  const st = STAT[fault.status];
  const elapsed = Date.now() - fault.dispatchTime;
  const etaLeft = fault.status === "En Route"
    ? Math.max(0, Math.round((fault.etaExpiry - Date.now()) / 60_000)) : null;

  return (
    <div onClick={onClick} style={{
      padding: "10px 14px", borderRadius: 10, cursor: "pointer",
      background: selected ? "rgba(200,140,255,.12)" : "rgba(255,255,255,.03)",
      border: selected ? `1px solid rgba(200,140,255,.4)` : "1px solid rgba(255,255,255,.06)",
      marginBottom: 6, transition: "all .15s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: s.color, background: s.bg,
            padding: "1px 7px", borderRadius: 20, letterSpacing: .5 }}>
            {s.label}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", opacity: .7 }}>{fault.id}</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg,
          padding: "1px 8px", borderRadius: 20 }}>
          {fault.status}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{fault.cowId}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", marginBottom: 4,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {fault.alarm}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,.5)" }}>
        <span>👤 {fault.assignedTeam}</span>
        {etaLeft !== null && <span style={{ color: P.orange }}>ETA {etaLeft}m</span>}
        <span>{fmtDuration(elapsed)} ago</span>
      </div>
    </div>
  );
}

// ── Fault detail panel ────────────────────────────────────────────────────────
function FaultDetail({ fault, onClose }: { fault: FaultRecord; onClose: () => void }) {
  const s  = SEV[fault.severity];
  const st = STAT[fault.status];
  const now = Date.now();
  const elapsed = fmtDuration(now - fault.dispatchTime);
  const etaLeft = fault.status === "En Route"
    ? Math.max(0, Math.round((fault.etaExpiry - now) / 60_000)) : null;
  const backupColor = fault.backupRemainingMin == null ? "#888"
    : fault.backupRemainingMin < 30 ? P.red
    : fault.backupRemainingMin < 60 ? P.orange : P.green;

  const Row = ({ label, val, accent }: { label: string; val: React.ReactNode; accent?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
      <span style={{ fontSize: 11, color: "rgba(200,140,255,.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: .5 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: accent ?? "#fff" }}>{val}</span>
    </div>
  );

  return (
    <div style={{ padding: "14px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: s.color, background: s.bg,
              padding: "2px 9px", borderRadius: 20 }}>{s.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg,
              padding: "2px 9px", borderRadius: 20 }}>{fault.status}</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>{fault.cowId}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 2 }}>{fault.id}</div>
        </div>
        <button onClick={onClose} style={{
          background: "rgba(255,255,255,.1)", border: "none", color: "#fff",
          borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 13,
        }}>← Back</button>
      </div>

      {/* Alarm description */}
      <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 8, padding: "10px 12px",
        fontSize: 12, color: "rgba(255,255,255,.8)", marginBottom: 14, lineHeight: 1.5 }}>
        {fault.alarm}
      </div>

      {/* Fields */}
      <Row label="TT ID"          val={fault.id} />
      <Row label="COW ID"         val={fault.cowId} />
      <Row label="Alarm Type"     val={fault.alarmType === "power" ? "⚡ Power" : "📡 NSA"} />
      <Row label="Area"           val={fault.area || "Hajj Zone"} />
      <Row label="Assigned Team"  val={fault.assignedTeam} />
      <Row label="Dispatch Time"  val={fmtTime(fault.dispatchTime)} />
      <Row label="ETA"            val={`${fault.etaMinutes} min`} />
      {fault.arrivedAt  && <Row label="Arrived At"   val={fmtTime(fault.arrivedAt)} accent={P.green} />}
      {fault.resolvedAt && <Row label="Resolved At"  val={fmtTime(fault.resolvedAt)} accent={P.green} />}
      <Row label="Elapsed"        val={elapsed} />
      {etaLeft !== null && <Row label="ETA Remaining" val={`${etaLeft} min`} accent={P.orange} />}
      <Row label="Backup Remaining"
        val={fault.backupRemainingMin != null ? `${fault.backupRemainingMin} min` : "—"}
        accent={backupColor} />

      {/* Backup bar */}
      {fault.backupRemainingMin != null && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", marginBottom: 4 }}>BATTERY BACKUP REMAINING</div>
          <div style={{ height: 6, background: "rgba(255,255,255,.1)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4, transition: "width .5s",
              width: `${Math.min(100, (fault.backupRemainingMin / 480) * 100)}%`,
              background: backupColor, boxShadow: `0 0 8px ${backupColor}`,
            }} />
          </div>
        </div>
      )}

      {/* Team GPS */}
      <div style={{ marginTop: 14, padding: "8px 12px", background: "rgba(255,255,255,.04)",
        borderRadius: 8, fontSize: 11, color: "rgba(255,255,255,.55)" }}>
        <div style={{ fontWeight: 700, color: "rgba(200,140,255,.7)", marginBottom: 3 }}>TEAM GPS</div>
        {fault.teamLat.toFixed(4)}°N, {fault.teamLng.toFixed(4)}°E
      </div>
    </div>
  );
}

// ── Site type from PBI ────────────────────────────────────────────────────────
interface PbiSite { id: string; latitude: number | null; longitude: number | null; area: string | null; }

// ── Main page ─────────────────────────────────────────────────────────────────
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function FaultManagement({ onBack }: { onBack: () => void }) {
  const [faults,    setFaults]    = useState<FaultRecord[]>([]);
  const [history,   setHistory]   = useState<FaultRecord[]>([]);
  const [sites,     setSites]     = useState<PbiSite[]>([]);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [time,      setTime]      = useState(nowStr());
  const [sevFilter, setSevFilter] = useState<FaultSeverity | "All">("All");
  const [statFilter,setStatFilter]= useState<FaultStatus | "Active" | "Closed">("Active");
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setTime(nowStr()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch sites once
  useEffect(() => {
    fetch(`${BASE}/api/pbi/sites`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("cow_token") ?? ""}` }
    })
      .then(r => r.ok ? r.json() : [])
      .then((data: PbiSite[]) => setSites(data))
      .catch(() => {});
  }, []);

  // SSE faults stream
  useEffect(() => {
    const token = sessionStorage.getItem("cow_token") ?? "";
    const url   = `${BASE}/api/faults/stream`;
    const es    = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (Array.isArray(data.active))  setFaults(data.active);
        if (Array.isArray(data.history)) setHistory(data.history);
      } catch { /* ignore */ }
    };
    es.onerror = () => setConnected(false);

    return () => { es.close(); esRef.current = null; };
  }, []);

  // Site coords for map
  const siteCoords = useMemo(() =>
    sites
      .filter(s => s.latitude != null && s.longitude != null)
      .map(s => ({ id: s.id, lat: s.latitude!, lng: s.longitude! })),
    [sites]
  );

  // KPIs
  const critical  = faults.filter(f => f.severity === "critical").length;
  const enRoute   = faults.filter(f => f.status === "En Route").length;
  const onSite    = faults.filter(f => f.status === "Arrived" || f.status === "Working").length;
  const resolved  = history.filter(f => f.status === "Resolved" || f.status === "Closed").length;

  // Filtered list
  const displayFaults = useMemo(() => {
    let list = statFilter === "Closed" ? history : faults;
    if (statFilter === "Active") list = list.filter(f => f.status !== "Closed" && f.status !== "Resolved");
    if (sevFilter  !== "All")    list = list.filter(f => f.severity === sevFilter);
    return list.sort((a, b) => {
      const sevOrd = ["critical","major","minor","monitoring"];
      return sevOrd.indexOf(a.severity) - sevOrd.indexOf(b.severity);
    });
  }, [faults, history, sevFilter, statFilter]);

  const selectedFault = faults.find(f => f.id === selected) ?? history.find(f => f.id === selected) ?? null;

  // Filter pill style
  const pill = (active: boolean, color: string) => ({
    padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer",
    border: active ? `1px solid ${color}` : "1px solid rgba(255,255,255,.12)",
    background: active ? `${color}22` : "rgba(255,255,255,.04)",
    color: active ? color : "rgba(255,255,255,.55)",
    transition: "all .15s",
  } as React.CSSProperties);

  return (
    <div style={{
      width: "100vw", height: "100vh",
      background: P.purpleDeep, display: "flex", flexDirection: "column",
      overflow: "hidden", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#fff",
    }}>

      {/* ══ HEADER ════════════════════════════════════════════════════════════ */}
      <div style={{
        background: `linear-gradient(135deg, ${P.purpleDeep} 0%, ${P.purpleDark} 45%, ${P.purple} 100%)`,
        padding: "0 18px", display: "flex", alignItems: "center", gap: 14,
        flexShrink: 0, height: 54, boxShadow: "0 3px 20px rgba(78,0,142,0.6)",
      }}>
        <img src="/stc-logo.png" alt="STC" style={{ height: 34, objectFit: "contain" }} />

        {/* Back button */}
        <button onClick={onBack} style={{
          background: "rgba(255,255,255,.08)", border: `1px solid ${P.glassBorder}`,
          borderRadius: 8, padding: "4px 12px", fontSize: 12, color: "#fff",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
        }}>
          ← Dashboard
        </button>

        <div style={{
          background: "rgba(255,255,255,.08)", border: `1px solid ${P.glassBorder}`,
          borderRadius: 8, padding: "3px 12px", fontSize: 12, color: "#fff", lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{nowDate()}</div>
          <div style={{ opacity: .7 }}>⟳ {time}</div>
        </div>

        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: 1,
            textShadow: "0 2px 16px rgba(0,0,0,.4)" }}>
            ⚠ FAULT MANAGEMENT
          </div>
          <div style={{ fontSize: 10, color: "rgba(200,140,255,.75)", letterSpacing: 2 }}>
            COW HAJJ 1447 — NOC DISPATCH MIRROR
          </div>
        </div>

        {/* Live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 7,
          background: "rgba(0,200,120,.12)", border: "1px solid rgba(0,200,120,.3)",
          borderRadius: 20, padding: "4px 12px" }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: connected ? P.green : P.red,
            boxShadow: `0 0 6px ${connected ? P.green : P.red}`,
            animation: connected ? "pulse 2s ease-in-out infinite" : "none",
          }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: connected ? P.green : P.red }}>
            {connected ? "LIVE" : "RECONNECTING"}
          </span>
        </div>
      </div>

      {/* ══ KPI BAR ═══════════════════════════════════════════════════════════ */}
      <div style={{
        display: "flex", gap: 10, padding: "10px 14px",
        borderBottom: `1px solid ${P.glassBorder}`, flexShrink: 0,
      }}>
        <KpiCard label="Active Faults"  value={faults.length}   accent="#fff"    sub="open incidents" />
        <KpiCard label="Critical"       value={critical}         accent={P.red}   sub="immediate action" />
        <KpiCard label="En Route"       value={enRoute}          accent={P.blue}  sub="teams dispatched" />
        <KpiCard label="On Site"        value={onSite}           accent={P.orange} sub="working / arrived" />
        <KpiCard label="Resolved Today" value={resolved}         accent={P.green} sub="closed faults" />
      </div>

      {/* ══ MAIN CONTENT ══════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", gap: 0 }}>

        {/* ── MAP ─────────────────────────────────────────────────────────── */}
        <div style={{ flex: "0 0 60%", position: "relative", overflow: "hidden" }}>
          <FaultMap
            faults={faults}
            sites={siteCoords}
            selectedId={selected}
            onSelect={id => setSelected(prev => prev === id ? null : id)}
          />

          {/* Map legend */}
          <Glass style={{
            position: "absolute", bottom: 20, right: 14, zIndex: 20,
            padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5,
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(200,140,255,.7)",
              letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>
              Severity
            </div>
            {(Object.entries(SEV) as [FaultSeverity, typeof SEV.critical][]).map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%",
                  background: v.color, boxShadow: `0 0 5px ${v.color}` }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>{v.label}</span>
              </div>
            ))}
            <div style={{ marginTop: 4, fontSize: 9, fontWeight: 800, color: "rgba(200,140,255,.7)",
              letterSpacing: 1, textTransform: "uppercase" }}>
              Teams
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12 }}>🚐</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>Field Team</span>
            </div>
          </Glass>
        </div>

        {/* ── FAULT PANEL ──────────────────────────────────────────────────── */}
        <div style={{
          flex: "0 0 40%", display: "flex", flexDirection: "column", overflow: "hidden",
          borderLeft: `1px solid ${P.glassBorder}`,
        }}>

          {selectedFault ? (
            // Detail view
            <div style={{ flex: 1, overflow: "auto" }}>
              <FaultDetail fault={selectedFault} onClose={() => setSelected(null)} />
            </div>
          ) : (
            <>
              {/* Filters */}
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${P.glassBorder}`, flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(200,140,255,.7)",
                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>
                  Severity
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {(["All","critical","major","minor","monitoring"] as const).map(s => (
                    <button key={s} onClick={() => setSevFilter(s)}
                      style={pill(sevFilter === s, s === "All" ? "#fff" : SEV[s as FaultSeverity]?.color ?? "#fff")}>
                      {s === "All" ? "All" : SEV[s as FaultSeverity].label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(200,140,255,.7)",
                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>
                  Status
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["Active","Closed"] as const).map(s => (
                    <button key={s} onClick={() => setStatFilter(s)}
                      style={pill(statFilter === s, "#C792FF")}>
                      {s}
                    </button>
                  ))}
                  {(["En Route","Working","Arrived","Resolved"] as FaultStatus[]).map(s => (
                    <button key={s} onClick={() => setStatFilter(s)}
                      style={pill(statFilter === s, STAT[s].color)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fault count */}
              <div style={{ padding: "8px 14px", borderBottom: `1px solid ${P.glassBorder}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
                flexShrink: 0, fontSize: 12 }}>
                <span style={{ color: "rgba(255,255,255,.5)" }}>
                  {displayFaults.length} fault{displayFaults.length !== 1 ? "s" : ""}
                </span>
                <span style={{ color: "rgba(200,140,255,.6)", fontSize: 10 }}>
                  Click a fault to view details
                </span>
              </div>

              {/* Fault list */}
              <div style={{ flex: 1, overflow: "auto", padding: "10px 12px" }}>
                {displayFaults.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px",
                    color: "rgba(255,255,255,.3)", fontSize: 13 }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
                    No active faults matching filters
                  </div>
                ) : (
                  displayFaults.map(f => (
                    <FaultItem key={f.id} fault={f}
                      selected={selected === f.id}
                      onClick={() => setSelected(prev => prev === f.id ? null : f.id)} />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity:1; }
          50%       { opacity:.4; }
        }
      `}</style>
    </div>
  );
}
