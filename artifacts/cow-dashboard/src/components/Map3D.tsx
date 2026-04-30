import { useEffect, useRef, useState } from "react";
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

// Center/zoom per area
const AREA_VIEWS: Record<string, { center: [number, number]; zoom: number }> = {
  All: { center: [21.38, 39.93], zoom: 10.5 },
  Arafat: { center: [21.357, 39.972], zoom: 12.8 },
  Mina: { center: [21.412, 39.898], zoom: 13 },
  Muzdalifah: { center: [21.384, 39.912], zoom: 12.8 },
  Haram: { center: [21.422, 39.826], zoom: 13.5 },
  "Makkah Remote": { center: [21.55, 39.4], zoom: 9.5 },
};

// Detect WebGL support
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

// ── MapLibre 3D (WebGL available) ─────────────────────────────────────────
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
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              attribution: "© Esri",
              maxzoom: 19,
            },
            labels: {
              type: "raster",
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              attribution: "",
              maxzoom: 19,
            },
            terrain: {
              type: "raster-dem",
              tiles: [
                "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
              ],
              encoding: "terrarium",
              tileSize: 256,
              maxzoom: 14,
            },
          },
          layers: [
            { id: "satellite", type: "raster", source: "satellite" },
            {
              id: "labels",
              type: "raster",
              source: "labels",
              paint: { "raster-opacity": 0.65 },
            },
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

      map.addControl(
        new maplibregl.NavigationControl({ visualizePitch: true }),
        "top-right"
      );

      mapRef.current = map;

      map.on("load", () => {
        setReady(true);
        // Add site markers
        addMarkers(sites, map, maplibregl, markersRef);
      });
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Fly on area change
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS["All"];
    mapRef.current.flyTo({
      center: [view.center[1], view.center[0]],
      zoom: view.zoom,
      pitch: 52,
      bearing: -10,
      duration: 1800,
    });
  }, [areaFilter, ready]);

  // Update markers
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    import("maplibre-gl").then(({ default: maplibregl }) => {
      addMarkers(sites, mapRef.current, maplibregl, markersRef);
    });
  }, [sites, ready]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
  );
}

function addMarkers(sites: MapSite[], map: any, maplibregl: any, markersRef: any) {
  markersRef.current.forEach((m: any) => m.remove());
  markersRef.current = [];

  sites
    .filter((s) => s.latitude != null && s.longitude != null)
    .forEach((site) => {
      const color =
        site.status === "operational"
          ? STC_GREEN
          : site.status === "degraded"
          ? STC_ORANGE
          : STC_RED;

      // Outer wrapper: fixed 28×28 transparent hit-area — never resizes so the
      // cursor can't escape it and trigger the mouseenter/leave flicker loop.
      const el = document.createElement("div");
      el.style.cssText = `
        width:28px;height:28px;display:flex;align-items:center;justify-content:center;
        cursor:pointer;position:relative;
      `;

      // Inner visual dot — this is what actually scales on hover.
      const dot = document.createElement("div");
      dot.style.cssText = `
        width:12px;height:12px;border-radius:50%;
        background:${color};border:2px solid white;
        box-shadow:0 1px 5px rgba(0,0,0,0.6);
        transition:transform 0.15s ease;pointer-events:none;
      `;
      el.appendChild(dot);

      el.addEventListener("mouseenter", () => { dot.style.transform = "scale(1.7)"; });
      el.addEventListener("mouseleave", () => { dot.style.transform = "scale(1)"; });

      const popup = new maplibregl.Popup({ offset: 10, closeButton: false }).setHTML(
        `<div style="font-size:11px;font-family:system-ui"><strong>${site.name}</strong><br/>Zone: ${site.zone}<br/>Status: <span style="color:${color};font-weight:700">${site.status.toUpperCase()}</span></div>`
      );

      const marker = new maplibregl.Marker({ element: el })
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

    const map = L.map(containerRef.current, {
      center: view.center,
      zoom: view.zoom,
      zoomControl: true,
    });

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Esri World Imagery", maxZoom: 19 }
    ).addTo(map);

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { attribution: "", maxZoom: 19, opacity: 0.6 }
    ).addTo(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
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

    sites
      .filter((s) => s.latitude != null && s.longitude != null)
      .forEach((site) => {
        // Status → colour mapping
        //   operational  = green  (ON-AIR, no issues)
        //   degraded     = yellow (power / partial issue)
        //   anything else = red  (outage / OFF-AIR)
        const isOperational = site.status === "operational";
        const isDegraded    = site.status === "degraded";

        // 3-D globe colours: [bgGradient, glowRgba]
        const [bgGrad, glowRgba] = isOperational
          ? ["radial-gradient(ellipse at 38% 30%, #aaffcc 0%, #00C878 45%, #006633 100%)", "rgba(0,200,120,0.75)"]
          : isDegraded
          ? ["radial-gradient(ellipse at 38% 30%, #ffe87a 0%, #F59E0B 45%, #7a4800 100%)", "rgba(245,158,11,0.75)"]
          : ["radial-gradient(ellipse at 38% 30%, #ffaaaa 0%, #EF4444 45%, #7a0000 100%)", "rgba(239,68,68,0.75)"];

        const labelColor = isOperational ? STC_GREEN : isDegraded ? STC_ORANGE : STC_RED;

        // COW truck icon + 3-D status globe below
        const iconHtml = `
          <div style="
            display:flex;flex-direction:column;align-items:center;
            cursor:pointer;width:26px;
          ">
            <img
              src="/cow-icon.png"
              width="26" height="30"
              style="object-fit:contain;display:block;
                filter:drop-shadow(0 2px 4px rgba(0,0,0,0.65));"
            />
            <div style="
              width:13px;height:7px;border-radius:50%;
              margin-top:1px;
              background:${bgGrad};
              box-shadow:0 3px 8px ${glowRgba},
                         0 1px 2px rgba(0,0,0,0.45),
                         inset 0 -1px 3px rgba(0,0,0,0.2);
            "></div>
          </div>`;

        const icon = L.divIcon({
          className: "",
          html: iconHtml,
          iconSize:    [26, 38],   // width × total height
          iconAnchor:  [13, 38],   // bottom-centre → coordinate
          tooltipAnchor: [0, -38],
        });

        const marker = L.marker([site.latitude!, site.longitude!], { icon });

        marker.bindTooltip(
          `<div style="font-family:system-ui;font-size:12px;min-width:140px;">
            <strong style="font-size:13px">${site.name}</strong><br/>
            Zone: <em>${site.zone}</em><br/>
            Status: <span style="color:${labelColor};font-weight:700">
              ${site.status.toUpperCase()}
            </span>
          </div>`,
          { direction: "top", offset: [0, -8], opacity: 0.97 }
        );

        marker.addTo(map);
        markersRef.current.push(marker as any);
      });
  }, [sites]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

// ── Exported component ─────────────────────────────────────────────────────
// Leaflet is used for all cases: it accurately positions markers at every zoom
// level. The MapLibre 3D path is kept in the file but not wired up, as its
// 52° pitch + terrain exaggeration distorts HTML marker positions when zoomed
// out to global scale.
export default function Map3D(props: Map3DProps) {
  return <LeafletMap {...props} />;
}
