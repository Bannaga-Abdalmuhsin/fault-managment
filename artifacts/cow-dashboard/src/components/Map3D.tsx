/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState, useCallback } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

// Support both VITE_GOOGLE_MAPS_API_KEY and GOOGLE_MAPS_API_KEY (via envPrefix in vite.config)
const GMAPS_KEY = (
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ||
  (import.meta.env.GOOGLE_MAPS_API_KEY as string) ||
  ""
);

setOptions({ key: GMAPS_KEY, v: "weekly" });

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MapSite {
  id: number;
  name: string;
  zone: string;
  status: string;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  hasPowerTicket?: boolean;
  hasNsaTicket?: boolean;
  powerConfig?: string;
  batteryUsefulTimeHrs?: number | null;
  siteClass?: string;
}

interface Map3DProps {
  sites: MapSite[];
  areaFilter: string;
}

interface SelectedSite extends MapSite {
  color: string;
  statusLabel: string;
}

// ── Area camera views ─────────────────────────────────────────────────────────
const AREA_VIEWS: Record<string, { lat: number; lng: number; zoom: number; tilt: number; heading: number }> = {
  All:            { lat: 21.384, lng: 39.920, zoom: 11.2, tilt: 52,   heading: 0   },
  Arafat:         { lat: 21.357, lng: 39.972, zoom: 13.5, tilt: 67.5, heading: 5   },
  Mina:           { lat: 21.412, lng: 39.898, zoom: 13.5, tilt: 67.5, heading: -8  },
  Muzdalifah:     { lat: 21.384, lng: 39.912, zoom: 13.5, tilt: 67.5, heading: 0   },
  "Makka Remote": { lat: 21.420, lng: 39.930, zoom: 9.5,  tilt: 45,   heading: 0   },
};

// ── Colours ───────────────────────────────────────────────────────────────────
const COL = {
  green:  { fill: "#00C878", glow: "#00FF99", stroke: "#00FFB3" },
  yellow: { fill: "#F59E0B", glow: "#FFD060", stroke: "#FFE082" },
  red:    { fill: "#EF4444", glow: "#FF6060", stroke: "#FFA0A0" },
};

// ── SVG glowing pin marker factory ───────────────────────────────────────────
function makeGlowPin(c: { fill: string; glow: string; stroke: string }, critical = false) {
  const s  = critical ? 38 : 30;
  const h  = Math.round(s * 1.35);
  const cx = s / 2;
  const cy = s / 2;
  const r  = cx - 3;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${h}" viewBox="0 0 ${s} ${h}">
  <defs>
    <radialGradient id="rg" cx="38%" cy="32%" r="65%">
      <stop offset="0%" stop-color="${c.glow}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${c.fill}" stop-opacity="1"/>
    </radialGradient>
    <filter id="gf" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${critical ? 4 : 2.5}" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#gf)">
    <circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="${c.glow}" opacity="0.28"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rg)" stroke="${c.stroke}" stroke-width="1.8"/>
  <circle cx="${Math.round(cx * 0.68)}" cy="${Math.round(cy * 0.7)}" r="${Math.round(r * 0.22)}" fill="rgba(255,255,255,0.55)"/>
  <polygon points="${cx - 5},${s - 5} ${cx},${h - 2} ${cx + 5},${s - 5}" fill="${c.fill}"/>
</svg>`;
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(s, h),
    anchor: new google.maps.Point(cx, h - 2),
  };
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtFuel(battHrs: number | null | undefined): string {
  if (battHrs == null) return "—";
  // Scale: 8h full charge ≈ 100%; clamp 0-100
  const pct = Math.min(100, Math.round((battHrs / 8) * 100));
  return `${pct}%`;
}

function fmtGenerator(cfg: string | undefined): string {
  if (!cfg) return "—";
  const c = cfg.toUpperCase();
  if (c.includes("SOLAR")) return "Solar";
  if (c.includes("GRID")) return "On-Grid";
  if (c.includes("GEN") || c.includes("DIESEL")) return "Generator";
  if (c.includes("BATT")) return "Battery";
  return cfg;
}

function fmtTime(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Map3D({ sites, areaFilter }: Map3DProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<google.maps.Map | null>(null);
  const markersRef    = useRef<google.maps.Marker[]>([]);
  const sitesRef      = useRef(sites);
  sitesRef.current    = sites;

  const [selected, setSelected]   = useState<SelectedSite | null>(null);
  const [updateTime, setUpdateTime] = useState(fmtTime());

  // Tick the update time every second when a popup is open
  useEffect(() => {
    if (!selected) return;
    const id = setInterval(() => setUpdateTime(fmtTime()), 1000);
    return () => clearInterval(id);
  }, [selected]);

  // ── Mount: create the Google Map ─────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS.All;

    importLibrary("maps").then((lib) => {
      const { Map } = lib as google.maps.MapsLibrary;
      if (!containerRef.current) return;

      const map = new Map(containerRef.current, {
        mapTypeId:         "hybrid" as google.maps.MapTypeId,
        center:            { lat: view.lat, lng: view.lng },
        zoom:              view.zoom,
        tilt:              view.tilt,
        heading:           view.heading,
        // Controls
        zoomControl:        true,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
        mapTypeControl:     false,
        streetViewControl:  false,
        fullscreenControl:  true,
        fullscreenControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
        rotateControl:      true,
        rotateControlOptions: { position: google.maps.ControlPosition.RIGHT_CENTER },
        scaleControl:       true,
        // Interaction
        gestureHandling:    "greedy",     // mouse wheel works without Ctrl
        scrollwheel:        true,
        disableDoubleClickZoom: false,
        keyboardShortcuts:  true,
        // Style: boost label contrast on satellite
        styles: [
          { featureType: "all", elementType: "labels.text.fill",
            stylers: [{ color: "#ffffff" }] },
          { featureType: "all", elementType: "labels.text.stroke",
            stylers: [{ color: "#000000" }, { weight: 3 }] },
        ],
      });

      mapRef.current = map;

      // Close popup on map click
      map.addListener("click", () => setSelected(null));

      placeMarkers(sitesRef.current, map);
    });

    return () => {
      clearMarkers();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Camera: smooth fly to area on filter change ──────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS.All;
    map.moveCamera({
      center:  { lat: view.lat, lng: view.lng },
      zoom:    view.zoom,
      tilt:    view.tilt,
      heading: view.heading,
    });
    setSelected(null);
  }, [areaFilter]);

  // ── Markers: refresh when site data changes ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    placeMarkers(sites, map);
  }, [sites]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
  }, []);

  function siteColor(site: MapSite): { fill: string; glow: string; stroke: string } {
    if (site.hasPowerTicket) return COL.red;
    if (site.hasNsaTicket)   return COL.yellow;
    return COL.green;
  }

  function siteStatusLabel(site: MapSite): string {
    if (site.hasPowerTicket) return "DOWN — Power Fault";
    if (site.hasNsaTicket)   return "ALARM — NSA Issue";
    return "UP — Operational";
  }

  function placeMarkers(list: MapSite[], map: google.maps.Map) {
    clearMarkers();
    setSelected(null);

    list
      .filter(s => s.latitude != null && s.longitude != null)
      .forEach(site => {
        const col     = siteColor(site);
        const label   = siteStatusLabel(site);
        const icon    = makeGlowPin(col, !!site.hasPowerTicket);

        const marker = new google.maps.Marker({
          position: { lat: site.latitude!, lng: site.longitude! },
          map,
          title:      site.name,
          icon,
          optimized:  true,
          animation:  site.hasPowerTicket ? google.maps.Animation.BOUNCE : null,
        });

        marker.addListener("click", () => {
          setUpdateTime(fmtTime());
          setSelected({ ...site, color: col.fill, statusLabel: label });
        });

        markersRef.current.push(marker);
      });
  }

  // ── Counts for legend ─────────────────────────────────────────────────────
  const upCount   = sites.filter(s => !s.hasPowerTicket && !s.hasNsaTicket).length;
  const almCount  = sites.filter(s =>  s.hasNsaTicket && !s.hasPowerTicket).length;
  const downCount = sites.filter(s =>  s.hasPowerTicket).length;

  // ── Render ────────────────────────────────────────────────────────────────
  if (!GMAPS_KEY) {
    return (
      <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center",
        justifyContent:"center", background:"#0a0a1a", color:"#ff6060", fontSize:14,
        flexDirection:"column", gap:10 }}>
        <span style={{ fontSize: 28 }}>⚠</span>
        <span>No Google Maps API key found.</span>
        <span style={{ color:"#888", fontSize:12 }}>Set GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY</span>
      </div>
    );
  }

  return (
    <div style={{ width:"100%", height:"100%", position:"relative" }}>

      {/* ── Map canvas ───────────────────────────────────────────────── */}
      <div ref={containerRef} style={{ width:"100%", height:"100%" }} />

      {/* ── Legend panel — bottom-right ──────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 28, right: 12, zIndex: 20,
        background: "rgba(6,0,16,0.82)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(200,140,255,0.22)",
        borderRadius: 12,
        padding: "10px 14px",
        minWidth: 155,
        boxShadow: "0 4px 28px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          color: "rgba(200,140,255,0.7)", marginBottom: 8, textTransform: "uppercase" }}>
          Site Status
        </div>
        {[
          { col: COL.green.fill,  glow: COL.green.glow,  label: "UP",    count: upCount   },
          { col: COL.yellow.fill, glow: COL.yellow.glow, label: "ALARM", count: almCount  },
          { col: COL.red.fill,    glow: COL.red.glow,    label: "DOWN",  count: downCount },
        ].map(({ col, glow, label, count }) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap:8,
            marginBottom: 5, fontSize: 12 }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: col,
              boxShadow: `0 0 6px 2px ${glow}`,
              flexShrink: 0,
            }} />
            <span style={{ color:"rgba(255,255,255,0.85)", flex:1 }}>{label}</span>
            <span style={{ color: col, fontWeight: 700, minWidth: 22, textAlign:"right" }}>{count}</span>
          </div>
        ))}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 7, paddingTop: 6,
          display:"flex", justifyContent:"space-between", fontSize:11,
          color:"rgba(255,255,255,0.4)" }}>
          <span>Total</span>
          <span style={{ color:"#fff", fontWeight:700 }}>{sites.length}</span>
        </div>
      </div>

      {/* ── Marker info popup — slides up from bottom-center ─────────── */}
      {selected && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 30,
            background: "rgba(6,0,18,0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${selected.color}44`,
            borderTop: `2px solid ${selected.color}`,
            borderRadius: 14,
            padding: "14px 20px 12px",
            minWidth: 270,
            maxWidth: 340,
            boxShadow: `0 8px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05), 0 0 24px ${selected.color}22`,
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            color: "#e8e0f0",
            animation: "slideUp 0.22s ease-out",
          }}
        >
          {/* close */}
          <button
            onClick={() => setSelected(null)}
            style={{ position:"absolute", top:8, right:10, background:"transparent",
              border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer",
              fontSize:16, lineHeight:1, padding:"2px 4px" }}
          >✕</button>

          {/* Site name */}
          <div style={{ fontWeight:800, fontSize:15, marginBottom:2, paddingRight:20,
            color:"#fff", letterSpacing:"0.02em" }}>
            {selected.name}
          </div>
          <div style={{ fontSize:11, color:"rgba(200,140,255,0.65)", marginBottom:10 }}>
            Zone: {selected.zone}{selected.siteClass ? ` · ${selected.siteClass}` : ""}
          </div>

          {/* Status badge */}
          <div style={{ display:"inline-flex", alignItems:"center", gap:6,
            background:`${selected.color}1A`, border:`1px solid ${selected.color}55`,
            borderRadius:20, padding:"3px 10px", marginBottom:12 }}>
            <span style={{ width:7, height:7, borderRadius:"50%",
              background:selected.color,
              boxShadow:`0 0 6px 3px ${selected.color}`,
              animation: selected.hasPowerTicket ? "pulse 1s infinite" : undefined
            }} />
            <span style={{ fontSize:12, fontWeight:700, color:selected.color }}>
              {selected.statusLabel}
            </span>
          </div>

          {/* Data rows */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 14px", fontSize:12 }}>
            <DataRow label="Fuel / Battery" value={fmtFuel(selected.batteryUsefulTimeHrs)}
              valueColor={
                selected.batteryUsefulTimeHrs == null ? "#888" :
                (selected.batteryUsefulTimeHrs / 8) < 0.25 ? "#EF4444" :
                (selected.batteryUsefulTimeHrs / 8) < 0.5  ? "#F59E0B" : "#00C878"
              } />
            <DataRow label="Generator" value={fmtGenerator(selected.powerConfig)} />
            <DataRow label="Site Class"
              value={selected.siteClass ?? "—"} />
            <DataRow label="Last Update" value={updateTime} />
          </div>
        </div>
      )}

      {/* slide-up keyframe */}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0);    }
        }
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.4; }
        }
      `}</style>
    </div>
  );
}

function DataRow({ label, value, valueColor = "#e8e0f0" }: { label:string; value:string; valueColor?:string }) {
  return (
    <div>
      <div style={{ color:"rgba(200,140,255,0.55)", fontSize:10, fontWeight:600,
        textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:1 }}>{label}</div>
      <div style={{ color:valueColor, fontWeight:700 }}>{value}</div>
    </div>
  );
}
