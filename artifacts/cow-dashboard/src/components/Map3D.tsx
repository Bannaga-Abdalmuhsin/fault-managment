/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState, useCallback } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import cowTowerUrl from "../assets/cow-tower.png";

// Support GOOGLE_MAPS_API_KEY (via vite.config envPrefix) or VITE_GOOGLE_MAPS_API_KEY
const GMAPS_KEY = (
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ||
  (import.meta.env.GOOGLE_MAPS_API_KEY as string) ||
  ""
);

// v=beta enables AdvancedMarkerElement + best 3D tilt rendering
setOptions({ key: GMAPS_KEY, v: "beta" });

// Inject pulse keyframe once into document head
if (typeof document !== "undefined") {
  const styleId = "map3d-pin-styles";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes mapPinPulse {
        0%   { transform: scale(1);   opacity: 0.85; }
        100% { transform: scale(2.8); opacity: 0;    }
      }
      @keyframes mapPopUp {
        from { opacity: 0; transform: translateX(-50%) translateY(14px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0);    }
      }
    `;
    document.head.appendChild(style);
  }
}

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

// ── Camera views ──────────────────────────────────────────────────────────────
const AREA_VIEWS: Record<string, { lat: number; lng: number; zoom: number; tilt: number; heading: number }> = {
  All:            { lat: 21.384, lng: 39.920, zoom: 11.2, tilt: 55,   heading: 320 },
  Arafat:         { lat: 21.357, lng: 39.972, zoom: 13.5, tilt: 67.5, heading: 320 },
  Mina:           { lat: 21.412, lng: 39.898, zoom: 13.5, tilt: 67.5, heading: 320 },
  Muzdalifah:     { lat: 21.384, lng: 39.912, zoom: 13.5, tilt: 67.5, heading: 320 },
  "Makka Remote": { lat: 21.420, lng: 39.930, zoom: 9.5,  tilt: 45,   heading: 320 },
};

// ── Colours ───────────────────────────────────────────────────────────────────
const COL = {
  green:  { fill: "#00C878", glow: "#00FF99", ring: "rgba(0,200,120,0.55)"  },
  yellow: { fill: "#F59E0B", glow: "#FFD060", ring: "rgba(245,158,11,0.55)" },
  red:    { fill: "#EF4444", glow: "#FF7070", ring: "rgba(239,68,68,0.6)"   },
};

// ── Build an AdvancedMarkerElement pin as a DOM element ───────────────────────
function buildPinElement(c: typeof COL.green, pulse: boolean): HTMLElement {
  // Outer wrapper — flex column, tower stacked DIRECTLY above status dot
  const wrap = document.createElement("div");
  wrap.style.cssText = `
    display:flex; flex-direction:column; align-items:center; gap:3px;
    cursor:pointer; position:relative;
  `;

  // Tower image with colored drop-shadow matching status
  const img = document.createElement("img");
  img.src = cowTowerUrl;
  img.style.cssText = `
    width:36px; height:auto; display:block; pointer-events:none;
    filter: drop-shadow(0 0 6px ${c.fill}) drop-shadow(0 2px 3px rgba(0,0,0,0.6));
  `;
  wrap.appendChild(img);

  // Status dot — sits cleanly UNDER the tower, horizontally centered
  const dotWrap = document.createElement("div");
  dotWrap.style.cssText = `position:relative; width:14px; height:14px; margin:0 auto;`;

  const dot = document.createElement("div");
  dot.style.cssText = `
    width:14px; height:14px; border-radius:50%;
    background: radial-gradient(circle at 38% 35%, ${c.glow}, ${c.fill});
    box-shadow: 0 0 8px 3px ${c.glow}99, 0 0 2px 1px ${c.fill};
    border: 2px solid rgba(255,255,255,0.85);
    position:relative; z-index:1;
  `;
  dotWrap.appendChild(dot);

  // Pulse rings for DOWN (red) sites
  if (pulse) {
    for (const delay of ["0s", "0.65s"]) {
      const ring = document.createElement("div");
      ring.style.cssText = `
        position:absolute; inset:-7px; border-radius:50%;
        border:2px solid ${c.fill}; pointer-events:none;
        animation: mapPinPulse 1.3s ease-out infinite;
        animation-delay:${delay};
      `;
      dotWrap.appendChild(ring);
    }
  }

  wrap.appendChild(dotWrap);
  return wrap;
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtFuel(battHrs: number | null | undefined): { text: string; pct: number } {
  if (battHrs == null) return { text: "—", pct: -1 };
  const pct = Math.min(100, Math.max(0, Math.round((battHrs / 8) * 100)));
  return { text: `${pct}%`, pct };
}
function fuelColor(pct: number) {
  if (pct < 0)  return "#666";
  if (pct < 25) return "#EF4444";
  if (pct < 50) return "#F59E0B";
  return "#00C878";
}
function fmtGenerator(cfg: string | undefined): string {
  if (!cfg) return "—";
  const u = cfg.toUpperCase();
  if (u.includes("SOLAR"))  return "Solar";
  if (u.includes("GRID"))   return "On-Grid";
  if (u.includes("DIESEL") || u.includes("GEN")) return "Diesel Generator";
  if (u.includes("BATT"))   return "Battery Only";
  return cfg;
}
function fmtTime(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Map3D({ sites, areaFilter }: Map3DProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<google.maps.Map | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef    = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerLibRef  = useRef<any>(null);
  const sitesRef      = useRef(sites);
  sitesRef.current    = sites;

  // Google Maps overlay layers (created lazily on first toggle)
  const trafficLayerRef   = useRef<google.maps.TrafficLayer   | null>(null);
  const transitLayerRef   = useRef<google.maps.TransitLayer   | null>(null);
  const bicyclingLayerRef = useRef<google.maps.BicyclingLayer | null>(null);

  const [selected, setSelected]     = useState<SelectedSite | null>(null);
  const [updateTime, setUpdateTime] = useState(fmtTime());
  // User-facing map type. "satellite" + showLabels=true => effective "hybrid".
  const [mapType, setMapType]       = useState<"satellite" | "roadmap" | "terrain">("satellite");
  const [showLabels, setShowLabels] = useState(true);
  // Overlay layer toggles
  const [trafficOn,   setTrafficOn]   = useState(false);
  const [transitOn,   setTransitOn]   = useState(false);
  const [bicyclingOn, setBicyclingOn] = useState(false);

  useEffect(() => {
    if (!selected) return;
    const id = setInterval(() => setUpdateTime(fmtTime()), 1000);
    return () => clearInterval(id);
  }, [selected]);

  // ── Mount: create map with beta options ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS.All;

    Promise.all([
      importLibrary("maps"),
      importLibrary("marker"),
    ]).then(([mapsLib, markerLib]) => {
      if (!containerRef.current) return;
      const { Map } = mapsLib as google.maps.MapsLibrary;

      markerLibRef.current = markerLib;

      // Initialize exactly as the reference pattern:
      // disableDefaultUI:true then re-enable specific controls
      const map = new Map(containerRef.current, {
        center:          { lat: view.lat, lng: view.lng },
        zoom:            view.zoom,
        heading:         view.heading,
        tilt:            view.tilt,
        mapTypeId:       "hybrid" as google.maps.MapTypeId,
        disableDefaultUI: true,
        // "DEMO_MAP_ID" is Google's built-in test map ID — required for
        // AdvancedMarkerElement to render (without it the cow-tower icons
        // silently disappear).
        mapId:           "DEMO_MAP_ID",
        // ── Hide business/POI clutter — keep streets + admin areas only ──
        // NOTE: on vector maps with a cloud-styled mapId these JS styles can
        // be ignored. DEMO_MAP_ID has no cloud style, so they apply here.
        styles: [
          // Hide all POI icons + labels (restaurants, shops, attractions, etc.)
          { featureType: "poi",            stylers: [{ visibility: "off" }] },
          { featureType: "poi.business",   stylers: [{ visibility: "off" }] },
          { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
          { featureType: "poi.medical",    stylers: [{ visibility: "off" }] },
          { featureType: "poi.school",     stylers: [{ visibility: "off" }] },
          { featureType: "poi.sports_complex", stylers: [{ visibility: "off" }] },
          // Hide transit (bus stops, stations) as well — pure street view
          { featureType: "transit",        stylers: [{ visibility: "off" }] },
          // Keep roads + admin areas (districts / neighborhood labels) visible
          { featureType: "road",                  elementType: "labels", stylers: [{ visibility: "on" }] },
          { featureType: "administrative",        elementType: "labels", stylers: [{ visibility: "on" }] },
          { featureType: "administrative.locality", elementType: "labels.text", stylers: [{ visibility: "on" }] },
        ],
      });

      // Selectively re-enable controls
      map.setOptions({
        rotateControl:    true,
        fullscreenControl: true,
        mapTypeControl:   false,
        streetViewControl: false,
        zoomControl:      true,
        scaleControl:     true,
        gestureHandling:  "greedy",
        keyboardShortcuts: true,
      });

      mapRef.current = map;
      map.addListener("click", () => setSelected(null));
      placeMarkers(sitesRef.current, map, markerLib);
    });

    return () => {
      clearMarkers();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Smooth camera fly on area change ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const v = AREA_VIEWS[areaFilter] ?? AREA_VIEWS.All;
    map.moveCamera({ center: { lat: v.lat, lng: v.lng }, zoom: v.zoom, tilt: v.tilt, heading: v.heading });
    setSelected(null);
  }, [areaFilter]);

  // ── Refresh markers on data change ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !markerLibRef.current) return;
    placeMarkers(sites, map, markerLibRef.current);
  }, [sites]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Map type switcher ────────────────────────────────────────────────────
  // "satellite" + labels-on ⇒ "hybrid" (Google's name for satellite+labels).
  // Roadmap and terrain always include labels.
  useEffect(() => {
    const effective = mapType === "satellite"
      ? (showLabels ? "hybrid" : "satellite")
      : mapType;
    mapRef.current?.setMapTypeId(effective as google.maps.MapTypeId);
  }, [mapType, showLabels]);

  // ── Overlay layers (Traffic / Transit / Bicycling) ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (trafficOn) {
      if (!trafficLayerRef.current) trafficLayerRef.current = new google.maps.TrafficLayer();
      trafficLayerRef.current.setMap(map);
    } else {
      trafficLayerRef.current?.setMap(null);
    }
  }, [trafficOn]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (transitOn) {
      if (!transitLayerRef.current) transitLayerRef.current = new google.maps.TransitLayer();
      transitLayerRef.current.setMap(map);
    } else {
      transitLayerRef.current?.setMap(null);
    }
  }, [transitOn]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (bicyclingOn) {
      if (!bicyclingLayerRef.current) bicyclingLayerRef.current = new google.maps.BicyclingLayer();
      bicyclingLayerRef.current.setMap(map);
    } else {
      bicyclingLayerRef.current?.setMap(null);
    }
  }, [bicyclingOn]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => { m.map = null; });
    markersRef.current = [];
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function placeMarkers(list: MapSite[], map: google.maps.Map, markerLib: any) {
    clearMarkers();
    setSelected(null);

    const { AdvancedMarkerElement } = markerLib;

    list
      .filter(s => s.latitude != null && s.longitude != null)
      .forEach(site => {
        const col         = site.hasPowerTicket ? COL.red : site.hasNsaTicket ? COL.yellow : COL.green;
        const statusLabel = site.hasPowerTicket ? "Power Outage" : site.hasNsaTicket ? "NSA Ticket" : "Operational";
        const isCritical  = !!site.hasPowerTicket;

        const pinEl = buildPinElement(col, isCritical);

        const marker = new AdvancedMarkerElement({
          position: { lat: site.latitude!, lng: site.longitude! },
          map,
          title:   site.name,
          content: pinEl,
        });

        marker.addEventListener("gmp-click", () => {
          setUpdateTime(fmtTime());
          setSelected({ ...site, color: col.fill, statusLabel });
        });

        markersRef.current.push(marker);
      });
  }

  // ── Legend counts ──────────────────────────────────────────────────────
  const upCount   = sites.filter(s => !s.hasPowerTicket && !s.hasNsaTicket).length;
  const almCount  = sites.filter(s =>  s.hasNsaTicket && !s.hasPowerTicket).length;
  const downCount = sites.filter(s =>  s.hasPowerTicket).length;

  // ── No-key fallback ────────────────────────────────────────────────────
  if (!GMAPS_KEY) {
    return (
      <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center",
        justifyContent:"center", background:"#0a0a1a", color:"#ff6060", fontSize:14,
        flexDirection:"column", gap:10 }}>
        <span style={{ fontSize:28 }}>⚠</span>
        <span>No Google Maps API key found.</span>
        <span style={{ color:"#888", fontSize:12 }}>Set GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY</span>
      </div>
    );
  }

  const fuel = selected ? fmtFuel(selected.batteryUsefulTimeHrs) : null;

  return (
    <div style={{ width:"100%", height:"100%", position:"relative" }}>

      {/* ── Map canvas ───────────────────────────────────────────────── */}
      <div ref={containerRef} style={{ width:"100%", height:"100%" }} />

      {/* ── Map controls — bottom-left (where legend was) ───────── */}
      <div style={{
        position:"absolute", bottom:26, left:10, zIndex:20,
        display:"flex", flexDirection:"column", gap:6, alignItems:"flex-start",
      }}>
        {/* Map terrain dropdown */}
        <div style={{
          background:"rgba(6,0,16,0.84)",
          backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
          border:"1px solid rgba(200,140,255,0.22)",
          borderRadius:10, padding:"5px 9px",
          display:"flex", alignItems:"center", gap:8,
          boxShadow:"0 4px 20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}>
          <span style={{
            fontSize:10, fontWeight:800, letterSpacing:"0.12em",
            color:"rgba(200,140,255,0.75)", textTransform:"uppercase",
          }}>
            Map
          </span>
          <select
            value={mapType}
            onChange={e => setMapType(e.target.value as "satellite" | "roadmap" | "terrain")}
            style={{
              background:"rgba(78,0,142,0.45)",
              color:"#ded0f5",
              border:"1px solid rgba(200,140,255,0.4)",
              borderRadius:7,
              padding:"4px 8px",
              fontSize:11, fontWeight:700,
              cursor:"pointer",
              outline:"none",
              letterSpacing:"0.03em",
              fontFamily:"inherit",
            }}
          >
            <option value="satellite" style={{ background:"#1a0033", color:"#fff" }}>🛰 Satellite</option>
            <option value="roadmap"   style={{ background:"#1a0033", color:"#fff" }}>🗺 Road</option>
            <option value="terrain"   style={{ background:"#1a0033", color:"#fff" }}>⛰ Terrain</option>
          </select>
        </div>

        {/* Layers panel — Satellite labels + Google overlay layers */}
        <div style={{
          background:"rgba(6,0,16,0.84)",
          backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
          border:"1px solid rgba(200,140,255,0.22)",
          borderRadius:10, padding:"8px 11px",
          display:"flex", flexDirection:"column", gap:6,
          boxShadow:"0 4px 20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
          minWidth:160,
        }}>
          <div style={{
            fontSize:10, fontWeight:800, letterSpacing:"0.12em",
            color:"rgba(200,140,255,0.75)", textTransform:"uppercase",
            marginBottom:1,
          }}>
            Layers
          </div>

          {([
            {
              key:"labels", icon:"🏷",
              label:"Satellite labels",
              checked: mapType === "satellite" ? showLabels : true,
              disabled: mapType !== "satellite",
              onChange: (v: boolean) => setShowLabels(v),
              tip: mapType === "satellite"
                ? "Toggle place / road labels on satellite imagery"
                : "Labels are always shown on Road and Terrain maps",
            },
            {
              key:"traffic", icon:"🚦",
              label:"Traffic",
              checked: trafficOn,
              disabled: false,
              onChange: (v: boolean) => setTrafficOn(v),
              tip:"Live road traffic conditions",
            },
            {
              key:"transit", icon:"🚌",
              label:"Transit",
              checked: transitOn,
              disabled: false,
              onChange: (v: boolean) => setTransitOn(v),
              tip:"Public transit lines and stations",
            },
            {
              key:"bicycling", icon:"🚴",
              label:"Bicycling",
              checked: bicyclingOn,
              disabled: false,
              onChange: (v: boolean) => setBicyclingOn(v),
              tip:"Bike lanes and trails",
            },
          ] as const).map(({ key, icon, label, checked, disabled, onChange, tip }) => (
            <label
              key={key}
              title={tip}
              style={{
                display:"flex", alignItems:"center", gap:7,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.45 : 1,
                userSelect:"none",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={e => onChange(e.target.checked)}
                style={{
                  width:13, height:13, margin:0,
                  accentColor:"#a78bfa",
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
              />
              <span style={{ fontSize:12 }}>{icon}</span>
              <span style={{
                fontSize:11, fontWeight:700, color:"#ded0f5",
                letterSpacing:"0.03em", whiteSpace:"nowrap",
              }}>
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Legend — bottom-right glassmorphism panel ─────────────── */}
      <div style={{
        position:"absolute", bottom:28, right:12, zIndex:20,
        background:"rgba(6,0,16,0.82)",
        backdropFilter:"blur(16px)", WebkitBackdropFilter:"blur(16px)",
        border:"1px solid rgba(200,140,255,0.22)",
        borderRadius:12,
        padding:"10px 14px", minWidth:155,
        boxShadow:"0 4px 28px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.12em",
          color:"rgba(200,140,255,0.7)", marginBottom:8, textTransform:"uppercase" }}>
          Site Status
        </div>
        {([
          { c: COL.green,  label:"Operational", count: upCount   },
          { c: COL.yellow, label:"NSA Ticket",  count: almCount  },
          { c: COL.red,    label:"Power Outage",count: downCount },
        ] as const).map(({ c, label, count }) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5, fontSize:12 }}>
            <span style={{ width:10, height:10, borderRadius:"50%", flexShrink:0,
              background: c.fill,
              boxShadow:`0 0 6px 2px ${c.glow}` }} />
            <span style={{ color:"rgba(255,255,255,0.85)", flex:1 }}>{label}</span>
            <span style={{ color:c.fill, fontWeight:700, minWidth:22, textAlign:"right" }}>{count}</span>
          </div>
        ))}
        <div style={{ borderTop:"1px solid rgba(255,255,255,0.08)", marginTop:7, paddingTop:6,
          display:"flex", justifyContent:"space-between", fontSize:11, color:"rgba(255,255,255,0.4)" }}>
          <span>Total</span>
          <span style={{ color:"#fff", fontWeight:700 }}>{sites.length}</span>
        </div>
      </div>

      {/* ── Marker detail popup ──────────────────────────────────────── */}
      {selected && fuel && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position:"absolute", bottom:24, left:"50%",
            transform:"translateX(-50%)",
            zIndex:30,
            background:"rgba(6,0,18,0.93)",
            backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
            border:`1px solid ${selected.color}44`,
            borderTop:`2px solid ${selected.color}`,
            borderRadius:14,
            padding:"14px 20px 12px",
            minWidth:275, maxWidth:340,
            boxShadow:`0 8px 40px rgba(0,0,0,0.65), 0 0 24px ${selected.color}22`,
            fontFamily:"'Segoe UI',system-ui,sans-serif",
            color:"#e8e0f0",
            animation:"mapPopUp 0.22s ease-out",
          }}
        >
          {/* close */}
          <button onClick={() => setSelected(null)}
            style={{ position:"absolute", top:8, right:10, background:"transparent",
              border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", fontSize:16, lineHeight:1 }}>
            ✕
          </button>

          {/* Site name */}
          <div style={{ fontWeight:800, fontSize:15, paddingRight:20, color:"#fff", letterSpacing:"0.02em" }}>
            {selected.name}
          </div>
          <div style={{ fontSize:11, color:"rgba(200,140,255,0.65)", marginBottom:10 }}>
            Zone: {selected.zone}{selected.siteClass ? ` · ${selected.siteClass}` : ""}
          </div>

          {/* Status badge */}
          <div style={{ display:"inline-flex", alignItems:"center", gap:6,
            background:`${selected.color}18`, border:`1px solid ${selected.color}50`,
            borderRadius:20, padding:"3px 10px", marginBottom:12 }}>
            <span style={{ width:7, height:7, borderRadius:"50%",
              background:selected.color,
              boxShadow:`0 0 6px 3px ${selected.color}` }} />
            <span style={{ fontSize:12, fontWeight:700, color:selected.color }}>
              {selected.statusLabel}
            </span>
          </div>

          {/* Data grid */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 16px", fontSize:12 }}>
            {/* Fuel with progress bar */}
            <div style={{ gridColumn:"1 / -1" }}>
              <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase",
                letterSpacing:"0.08em", color:"rgba(200,140,255,0.55)", marginBottom:3 }}>
                Fuel / Battery
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ flex:1, height:5, background:"rgba(255,255,255,0.1)",
                  borderRadius:3, overflow:"hidden" }}>
                  {fuel.pct >= 0 && (
                    <div style={{
                      height:"100%", width:`${fuel.pct}%`,
                      background: fuelColor(fuel.pct),
                      borderRadius:3, transition:"width 0.4s ease",
                    }} />
                  )}
                </div>
                <span style={{ fontWeight:700, color: fuelColor(fuel.pct), minWidth:32 }}>
                  {fuel.text}
                </span>
              </div>
            </div>

            <DataRow label="Generator"   value={fmtGenerator(selected.powerConfig)} />
            <DataRow label="Site Class"  value={selected.siteClass ?? "—"} />
            <DataRow label="Last Update" value={updateTime} />
          </div>
        </div>
      )}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color:"rgba(200,140,255,0.55)", fontSize:10, fontWeight:600,
        textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:2 }}>{label}</div>
      <div style={{ color:"#e8e0f0", fontWeight:700, fontSize:12 }}>{value}</div>
    </div>
  );
}
