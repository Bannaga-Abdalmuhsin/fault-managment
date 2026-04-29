import { useEffect, useRef, useState, type MutableRefObject } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const STC_GREEN = "#00C878";
const STC_ORANGE = "#F59E0B";
const STC_RED = "#EF4444";

export interface MapSite {
  id: number;
  name: string;
  zone: string;
  status: string;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

interface Map3DProps {
  sites: MapSite[];
  areaFilter: string;
}

const AREA_VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
  All: { center: [21.38, 39.93], zoom: 10.5 },
  Arafat: { center: [21.357, 39.972], zoom: 12.8 },
  Mina: { center: [21.412, 39.898], zoom: 13 },
  Muzdalifah: { center: [21.384, 39.912], zoom: 12.8 },
  Haram: { center: [21.422, 39.826], zoom: 13.5 },
  "Makkah Remote": { center: [21.55, 39.4], zoom: 9.5 },
};

// ── Cell Tower SVG icon ───────────────────────────────────────────────────
// Returns an SVG string representing a GSM/COW tower, color-coded by status
function towerSvg(color: string): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38">
  <defs>
    <filter id="shadow" x="-30%" y="-10%" width="160%" height="160%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="rgba(0,0,0,0.55)"/>
    </filter>
  </defs>
  <!-- Signal waves (top arcs) -->
  <g fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" opacity="0.9">
    <path d="M6 10 Q13 5 20 10"/>
    <path d="M3 7 Q13 1 23 7"/>
  </g>
  <!-- Antenna mast top -->
  <line x1="13" y1="11" x2="13" y2="14" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
  <!-- Crossbar top -->
  <line x1="7" y1="14" x2="19" y2="14" stroke="#ccc" stroke-width="1.4"/>
  <!-- Tower left leg -->
  <line x1="9" y1="14" x2="4" y2="36" stroke="#aaa" stroke-width="1.5" stroke-linecap="round" filter="url(#shadow)"/>
  <!-- Tower right leg -->
  <line x1="17" y1="14" x2="22" y2="36" stroke="#aaa" stroke-width="1.5" stroke-linecap="round" filter="url(#shadow)"/>
  <!-- Cross braces -->
  <line x1="9" y1="20" x2="17" y2="27" stroke="#bbb" stroke-width="1.1"/>
  <line x1="17" y1="20" x2="9" y2="27" stroke="#bbb" stroke-width="1.1"/>
  <line x1="7"  y1="27" x2="15" y2="34" stroke="#bbb" stroke-width="1.1"/>
  <line x1="15" y1="27" x2="7"  y2="34" stroke="#bbb" stroke-width="1.1"/>
  <!-- Base platform -->
  <rect x="3" y="35" width="20" height="3" rx="1.5" fill="${color}" opacity="0.9"/>
  <!-- Status dot at top antenna -->
  <circle cx="13" cy="10.5" r="3" fill="${color}" stroke="white" stroke-width="1.2"/>
</svg>`.trim();
}

function makeDivElement(color: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = towerSvg(color);
  div.style.cssText =
    "cursor:pointer;transition:transform 0.15s;transform-origin:50% 100%;width:26px;height:38px;line-height:0";
  div.addEventListener("mouseenter", () => (div.style.transform = "scale(1.45)"));
  div.addEventListener("mouseleave", () => (div.style.transform = "scale(1)"));
  return div;
}

// ── WebGL check ────────────────────────────────────────────────────────────
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

// ── MapLibre 3D (WebGL) ────────────────────────────────────────────────────
function MapLibre3D({ sites, areaFilter }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import("maplibre-gl").then(({ default: maplibregl }) => {
      import("maplibre-gl/dist/maplibre-gl.css");

      const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS["All"];

      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: {
          version: 8,
          sources: {
            satellite: {
              type: "raster",
              tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
              tileSize: 256,
              attribution: "© Esri",
              maxzoom: 19,
            },
            labels: {
              type: "raster",
              tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
              tileSize: 256,
              attribution: "",
              maxzoom: 19,
            },
            terrain: {
              type: "raster-dem",
              tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
              encoding: "terrarium",
              tileSize: 256,
              maxzoom: 14,
            },
          },
          layers: [
            { id: "satellite", type: "raster", source: "satellite" },
            { id: "labels", type: "raster", source: "labels", paint: { "raster-opacity": 0.65 } },
          ],
          terrain: { source: "terrain", exaggeration: 2.2 },
          sky: {
            "sky-color": "#1a3a5c",
            "sky-horizon-blend": 0.4,
            "horizon-color": "#6ca8d4",
            "horizon-fog-blend": 0.3,
            "fog-color": "#d8e8f0",
            "fog-ground-blend": 0.9,
          },
        } as any,
        center: [view.center[1], view.center[0]],
        zoom: view.zoom,
        pitch: 52,
        bearing: -10,
        antialias: true,
      });

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      mapRef.current = map;

      map.on("load", () => {
        setReady(true);
        addMarkersML(sites, map, maplibregl, markersRef);
      });
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !ready) return;
    const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS["All"];
    mapRef.current.flyTo({ center: [view.center[1], view.center[0]], zoom: view.zoom, pitch: 52, bearing: -10, duration: 1800 });
  }, [areaFilter, ready]);

  useEffect(() => {
    if (!mapRef.current || !ready) return;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      addMarkersML(sites, mapRef.current, maplibregl, markersRef);
    });
  }, [sites, ready]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

function addMarkersML(sites: MapSite[], map: any, maplibregl: any, markersRef: MutableRefObject<any[]>) {
  markersRef.current.forEach((m) => m.remove());
  markersRef.current = [];

  sites.filter((s) => s.latitude != null && s.longitude != null).forEach((site) => {
    const color =
      site.status === "operational" ? STC_GREEN
      : site.status === "degraded" ? STC_ORANGE
      : STC_RED;

    const el = makeDivElement(color);

    const popup = new maplibregl.Popup({ offset: [0, -36], closeButton: false }).setHTML(
      `<div style="font-size:11px;font-family:system-ui;line-height:1.5">
        <strong>${site.name}</strong><br/>
        Zone: ${site.zone}<br/>
        Status: <span style="color:${color};font-weight:700">${site.status.toUpperCase()}</span>
      </div>`
    );

    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([site.longitude!, site.latitude!])
      .setPopup(popup)
      .addTo(map);

    markersRef.current.push(marker);
  });
}

// ── Leaflet fallback (no WebGL) ────────────────────────────────────────────
function LeafletMap({ sites, areaFilter }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS["All"];

    const map = L.map(containerRef.current, { center: view.center, zoom: view.zoom });

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Esri World Imagery", maxZoom: 19 }
    ).addTo(map);

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { attribution: "", maxZoom: 19, opacity: 0.6 }
    ).addTo(map);

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS["All"];
    map.flyTo(view.center, view.zoom, { duration: 1.5 });
  }, [areaFilter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    sites.filter((s) => s.latitude != null && s.longitude != null).forEach((site) => {
      const color =
        site.status === "operational" ? STC_GREEN
        : site.status === "degraded" ? STC_ORANGE
        : STC_RED;

      const icon = L.divIcon({
        html: towerSvg(color),
        iconSize: [26, 38],
        iconAnchor: [13, 38],
        tooltipAnchor: [0, -38],
        className: "",
      });

      const marker = L.marker([site.latitude!, site.longitude!], { icon });
      marker.bindTooltip(
        `<strong>${site.name}</strong><br/>Zone: ${site.zone}<br/>Status: <span style="color:${color};font-weight:700">${site.status.toUpperCase()}</span>`,
        { direction: "top", offset: [0, -4] }
      );
      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [sites]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

// ── Auto-select renderer ───────────────────────────────────────────────────
export default function Map3D(props: Map3DProps) {
  const [webGL] = useState(() => hasWebGL());
  return webGL ? <MapLibre3D {...props} /> : <LeafletMap {...props} />;
}
