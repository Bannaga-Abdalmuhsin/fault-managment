import { useEffect, useRef, useState } from "react";

// ── Area camera views [lng, lat] ──────────────────────────────────────────────
const AREA_VIEWS: Record<string, {
  center: [number, number]; zoom: number; pitch: number; bearing: number;
}> = {
  All:             { center: [39.930,  21.380], zoom: 10.5, pitch: 52, bearing: -15 },
  Arafat:          { center: [39.972,  21.357], zoom: 12.8, pitch: 55, bearing: -18 },
  Mina:            { center: [39.898,  21.412], zoom: 13.0, pitch: 55, bearing: -18 },
  Muzdalifah:      { center: [39.912,  21.384], zoom: 12.8, pitch: 55, bearing: -18 },
  "Makkah Remote": { center: [39.930,  21.420], zoom:  9.0, pitch: 45, bearing: -10 },
};

// ── Status palette ────────────────────────────────────────────────────────────
const STATUS = {
  up:    { color: "#00C878", glow: "rgba(0,200,120,0.7)",  bg: "rgba(0,200,120,0.22)",  label: "OPERATIONAL" },
  alarm: { color: "#F59E0B", glow: "rgba(245,158,11,0.7)", bg: "rgba(245,158,11,0.22)", label: "ALARM"       },
  down:  { color: "#EF4444", glow: "rgba(239,68,68,0.7)",  bg: "rgba(239,68,68,0.22)",  label: "OFFLINE"     },
} as const;

function siteStatus(s: MapSite): keyof typeof STATUS {
  if (s.hasPowerTicket) return "down";
  if (s.hasNsaTicket)   return "alarm";
  return "up";
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MapSite {
  id: number;
  name: string;
  zone: string;
  status: string;
  latitude:  number | null | undefined;
  longitude: number | null | undefined;
  hasPowerTicket?: boolean;
  hasNsaTicket?:   boolean;
  fuelPct?: number | null;
}

interface Map3DProps {
  sites: MapSite[];
  areaFilter: string;
}

// ── CSS (injected once) ───────────────────────────────────────────────────────
let _cssReady = false;
function injectMapCSS() {
  if (_cssReady) return;
  _cssReady = true;
  const s = document.createElement("style");
  s.textContent = `
/* ── Pulse rings ──────────────────────────────────────────────────────── */
@keyframes cowPulse {
  0%   { transform:scale(0.88); opacity:0.88; }
  65%  { transform:scale(2.55); opacity:0;    }
  100% { transform:scale(2.55); opacity:0;    }
}
@keyframes cowPulse2 {
  0%   { transform:scale(0.88); opacity:0.52; }
  65%  { transform:scale(2.05); opacity:0;    }
  100% { transform:scale(2.05); opacity:0;    }
}
/* ── Marker base ──────────────────────────────────────────────────────── */
.cow-mkr {
  position:relative; width:46px; height:46px;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer;
}
.cow-ring {
  position:absolute; width:36px; height:36px; border-radius:50%;
  animation:cowPulse 2.5s ease-out infinite;
}
.cow-ring2 {
  position:absolute; width:36px; height:36px; border-radius:50%;
  animation:cowPulse2 2.5s ease-out infinite;
  animation-delay:0.78s;
}
.cow-core {
  position:relative; z-index:1;
  width:34px; height:34px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  border:2.5px solid;
  backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
  transition:transform 0.18s ease, box-shadow 0.18s ease;
}
.cow-core img {
  width:20px; height:20px; object-fit:contain; pointer-events:none;
  filter:brightness(1.4) drop-shadow(0 0 4px rgba(255,255,255,0.45));
}
.cow-mkr:hover .cow-core { transform:scale(1.24); }

/* ── MapLibre control theme ───────────────────────────────────────────── */
.maplibregl-ctrl-group {
  background:rgba(7,2,18,0.92) !important;
  backdrop-filter:blur(20px) !important;
  -webkit-backdrop-filter:blur(20px) !important;
  border:1px solid rgba(175,95,255,0.26) !important;
  box-shadow:0 4px 28px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04) !important;
  border-radius:10px !important;
  overflow:hidden;
}
.maplibregl-ctrl-group button {
  background:transparent !important;
  color:rgba(200,165,255,0.9) !important;
  width:32px !important; height:32px !important;
  border:none !important;
}
.maplibregl-ctrl-group button:hover {
  background:rgba(78,0,142,0.40) !important;
}
.maplibregl-ctrl-group button+button {
  border-top:1px solid rgba(175,95,255,0.14) !important;
}
.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon,
.maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon,
.maplibregl-ctrl-compass .maplibregl-ctrl-icon,
.maplibregl-ctrl-fullscreen .maplibregl-ctrl-icon,
.maplibregl-ctrl-shrink .maplibregl-ctrl-icon {
  filter:brightness(0.85) sepia(0.9) saturate(4.5) hue-rotate(238deg) !important;
}
.maplibregl-ctrl-attrib,
.maplibregl-ctrl-attrib a {
  background:rgba(7,2,18,0.75) !important;
  color:rgba(140,110,180,0.55) !important;
  font-size:9px !important;
}
.maplibregl-ctrl-scale {
  background:rgba(7,2,18,0.75) !important;
  backdrop-filter:blur(8px) !important;
  border:1px solid rgba(175,95,255,0.24) !important;
  border-top:2px solid rgba(200,140,255,0.70) !important;
  color:rgba(195,165,255,0.88) !important;
  font-size:10px !important; font-weight:700 !important;
  padding:2px 6px !important; border-radius:4px !important;
  letter-spacing:0.05em !important;
}

/* ── Popup ────────────────────────────────────────────────────────────── */
.maplibregl-popup-content {
  background:transparent !important;
  padding:0 !important;
  box-shadow:none !important;
  border-radius:0 !important;
}
.maplibregl-popup-tip { display:none !important; }
.maplibregl-popup-close-button {
  color:rgba(200,165,255,0.72) !important;
  font-size:20px !important; line-height:1 !important;
  padding:7px 11px !important;
  right:0 !important; top:0 !important;
  position:absolute !important; z-index:10;
}
.maplibregl-popup-close-button:hover {
  background:rgba(255,255,255,0.10) !important;
  color:#fff !important;
  border-radius:0 13px 0 0 !important;
}
`;
  document.head.appendChild(s);
}

// ── Marker DOM factory ────────────────────────────────────────────────────────
function makeMarkerEl(site: MapSite): HTMLElement {
  const key = siteStatus(site);
  const c   = STATUS[key];
  const el  = document.createElement("div");
  el.className = "cow-mkr";
  el.title = site.name;
  el.innerHTML = `
    <div class="cow-ring"  style="border:2px solid ${c.color};box-shadow:0 0 8px ${c.color};"></div>
    <div class="cow-ring2" style="border:2px solid ${c.color};"></div>
    <div class="cow-core" style="
      background:${c.bg};
      border-color:${c.color};
      box-shadow:0 0 22px ${c.glow},0 2px 14px rgba(0,0,0,0.6);
    ">
      <img src="/cow-truck-icon.png" alt="" />
    </div>
  `;
  return el;
}

// ── Popup HTML factory ────────────────────────────────────────────────────────
function makePopupHTML(site: MapSite): string {
  const key     = siteStatus(site);
  const c       = STATUS[key];
  const battery = site.fuelPct != null ? `${site.fuelPct.toFixed(1)} hrs` : "N/A";
  const ts      = new Date().toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" });

  return `
    <div style="
      font-family:'Inter',system-ui,sans-serif;
      min-width:214px;
      background:linear-gradient(145deg,rgba(8,2,22,0.97) 0%,rgba(16,5,35,0.96) 100%);
      backdrop-filter:blur(28px); -webkit-backdrop-filter:blur(28px);
      border:1px solid ${c.color}55;
      border-radius:14px;
      padding:16px 18px 14px;
      box-shadow:0 8px 48px rgba(0,0,0,0.75),0 0 36px ${c.glow}18;
      position:relative; overflow:hidden;
    ">
      <div style="
        position:absolute;top:0;left:0;right:0;height:3px;
        background:linear-gradient(90deg,transparent 0%,${c.color} 40%,${c.color} 60%,transparent 100%);
        opacity:0.88;
      "></div>
      <div style="
        display:flex;align-items:center;gap:9px;
        margin-bottom:12px;padding-bottom:10px;
        border-bottom:1px solid rgba(255,255,255,0.06);
      ">
        <div style="
          width:9px;height:9px;border-radius:50%;flex-shrink:0;
          background:${c.color};box-shadow:0 0 10px ${c.color};
        "></div>
        <span style="
          font-weight:700;font-size:13.5px;color:#fff;
          letter-spacing:0.04em;line-height:1.2;
        ">${site.name}</span>
      </div>
      <div style="
        display:grid;grid-template-columns:auto 1fr;
        gap:5px 14px;font-size:11.5px;line-height:1.55;
      ">
        <span style="color:rgba(190,155,240,0.5);white-space:nowrap;">Status</span>
        <span style="color:${c.color};font-weight:800;letter-spacing:0.07em;font-size:10.5px;">${c.label}</span>

        <span style="color:rgba(190,155,240,0.5);">Zone</span>
        <span style="color:rgba(230,218,255,0.88);">${site.zone}</span>

        <span style="color:rgba(190,155,240,0.5);">Battery</span>
        <span style="color:rgba(230,218,255,0.88);">${battery}</span>

        <span style="color:rgba(190,155,240,0.5);">Updated</span>
        <span style="color:rgba(190,155,240,0.65);">${ts} AST</span>
      </div>
    </div>
  `;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Map3D({ sites, areaFilter }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const mlRef        = useRef<any>(null);   // cached maplibre-gl module
  const markersRef   = useRef<any[]>([]);
  const [ready, setReady] = useState(false);

  // ── Initialize map (runs once) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    injectMapCSS();

    let alive = true;

    import("maplibre-gl").then(async ({ default: ml }) => {
      if (!alive || !containerRef.current) return;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (!alive || !containerRef.current) return;

      mlRef.current = ml;
      const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS["All"];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = new ml.Map({
        container: containerRef.current!,
        style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        center:    view.center,
        zoom:      view.zoom,
        pitch:     view.pitch,
        bearing:   view.bearing,
        maxPitch:  85,
      } as any);

      // Controls
      map.addControl(new ml.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new ml.FullscreenControl(), "top-right");
      map.addControl(new ml.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

      mapRef.current = map;

      map.on("load", () => {
        if (!alive) return;

        // ── Terrain ──
        map.addSource("terrain-dem", {
          type: "raster-dem",
          tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
          encoding: "terrarium",
          tileSize: 256,
          maxzoom: 14,
        });
        map.setTerrain({ source: "terrain-dem", exaggeration: 1.45 });

        // ── 3D buildings: find existing building layer from the loaded style ──
        try {
          const layers: any[] = map.getStyle()?.layers ?? [];
          const bldg = layers.find(
            (l: any) =>
              l["source-layer"] === "building" ||
              (typeof l.id === "string" && l.id.includes("building"))
          ) as any | undefined;

          if (bldg?.source) {
            map.addLayer(
              {
                id:   "__3d-buildings",
                type: "fill-extrusion",
                source: bldg.source,
                "source-layer": bldg["source-layer"] ?? "building",
                minzoom: 14,
                paint: {
                  "fill-extrusion-color": [
                    "interpolate", ["linear"], ["zoom"],
                    14, "#110326",
                    16, "#1c0840",
                    19, "#280f58",
                  ],
                  "fill-extrusion-height":
                    ["coalesce", ["get", "render_height"],     ["get", "height"],     10],
                  "fill-extrusion-base":
                    ["coalesce", ["get", "render_min_height"], ["get", "min_height"],  0],
                  "fill-extrusion-opacity": 0.82,
                  "fill-extrusion-vertical-gradient": true,
                },
              },
              bldg.id   // insert just before existing flat building layer
            );
          }
        } catch {
          /* 3D buildings unavailable in this style — non-critical */
        }

        setReady(true);
      });
    });

    return () => {
      alive = false;
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Rebuild markers when data or readiness changes ──────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current || !mlRef.current) return;
    const ml = mlRef.current;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    sites
      .filter(s => s.latitude != null && s.longitude != null)
      .forEach(site => {
        const el     = makeMarkerEl(site);
        const popup  = new ml.Popup({ offset: 14, closeButton: true, closeOnClick: false })
          .setHTML(makePopupHTML(site));
        const marker = new ml.Marker({ element: el })
          .setLngLat([site.longitude!, site.latitude!])
          .setPopup(popup)
          .addTo(mapRef.current);
        markersRef.current.push(marker);
      });
  }, [sites, ready]);

  // ── Fly camera on area change ───────────────────────────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const v = AREA_VIEWS[areaFilter] ?? AREA_VIEWS["All"];
    mapRef.current.flyTo({
      center:  v.center,
      zoom:    v.zoom,
      pitch:   v.pitch,
      bearing: v.bearing,
      duration: 2200,
      essential: true,
    });
  }, [areaFilter, ready]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Map canvas */}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", background: "#030712" }}
      />

      {/* NOC scan-line overlay — pure CSS, zero GPU cost */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          pointerEvents: "none", zIndex: 5,
          backgroundImage:
            "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(78,0,142,0.018) 3px,rgba(78,0,142,0.018) 4px)",
        }}
      />

      {/* Legend pill — bottom-right */}
      <div style={{
        position: "absolute", bottom: 32, right: 12, zIndex: 10,
        display: "flex", flexDirection: "column", gap: 5,
        background: "rgba(7,2,18,0.90)",
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(175,95,255,0.22)",
        borderRadius: 10, padding: "9px 13px",
        boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
        pointerEvents: "none",
      }}>
        {(["up","alarm","down"] as const).map(k => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{
              width: 9, height: 9, borderRadius: "50%",
              background: STATUS[k].color,
              boxShadow: `0 0 7px ${STATUS[k].color}`,
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              color: STATUS[k].color, fontFamily: "system-ui",
            }}>{STATUS[k].label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
