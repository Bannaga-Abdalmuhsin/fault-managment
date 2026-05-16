/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const GMAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ?? "";
setOptions({ key: GMAPS_KEY, v: "weekly" });

export interface MapSite {
  id: number;
  name: string;
  zone: string;
  status: string;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  hasPowerTicket?: boolean;
  hasNsaTicket?: boolean;
}

interface Map3DProps {
  sites: MapSite[];
  areaFilter: string;
}

// tilt=67.5 is the maximum Google Maps supports — gives a near-3D perspective.
// heading gives a slight rotated angle for each area so it feels more spatial.
const AREA_VIEWS: Record<string, { lat: number; lng: number; zoom: number; tilt: number; heading: number }> = {
  All:            { lat: 21.384, lng: 39.920, zoom: 11,   tilt: 52,   heading: 0   },
  Arafat:         { lat: 21.357, lng: 39.972, zoom: 13.5, tilt: 67.5, heading: 5   },
  Mina:           { lat: 21.412, lng: 39.898, zoom: 13.5, tilt: 67.5, heading: -8  },
  Muzdalifah:     { lat: 21.384, lng: 39.912, zoom: 13.5, tilt: 67.5, heading: 0   },
  "Makka Remote": { lat: 21.420, lng: 39.930, zoom: 9.5,  tilt: 45,   heading: 0   },
};

const BASE        = (import.meta.env.BASE_URL as string) ?? "/";
const ICON_RED    = `${BASE}site-down.svg`;
const ICON_YELLOW = `${BASE}site-alarm.svg`;
const ICON_GREEN  = `${BASE}site-up.svg`;

const STC_GREEN  = "#00C878";
const STC_YELLOW = "#F59E0B";
const STC_RED    = "#EF4444";

interface InfoState { name: string; zone: string; color: string; label: string }

export default function Map3D({ sites, areaFilter }: Map3DProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<google.maps.Map | null>(null);
  const markersRef    = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const sitesRef      = useRef(sites);
  sitesRef.current    = sites;

  const [info, setInfo] = useState<InfoState | null>(null);

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS.All;

    importLibrary("maps").then((lib) => {
      const { Map, InfoWindow } = lib as google.maps.MapsLibrary;
      if (!containerRef.current) return;

      const map = new Map(containerRef.current, {
        mapTypeId:         "hybrid" as google.maps.MapTypeId,
        center:            { lat: view.lat, lng: view.lng },
        zoom:              view.zoom,
        tilt:              view.tilt,
        heading:           view.heading,
        zoomControl:       true,
        mapTypeControl:    false,
        streetViewControl: false,
        fullscreenControl: false,
        rotateControl:     true,
        gestureHandling:   "greedy",
        // Boost label readability on satellite imagery
        styles: [
          { featureType: "all", elementType: "labels.text.fill",   stylers: [{ color: "#ffffff" }] },
          { featureType: "all", elementType: "labels.text.stroke",  stylers: [{ color: "#1a1a1a" }, { weight: 3 }] },
        ],
      });

      mapRef.current        = map;
      infoWindowRef.current = new InfoWindow();
      placeMarkers(sitesRef.current, map);
    });

    return () => {
      clearMarkers();
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      mapRef.current        = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Animate camera when area filter changes ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS.All;
    map.moveCamera({ center: { lat: view.lat, lng: view.lng }, zoom: view.zoom, tilt: view.tilt, heading: view.heading });
  }, [areaFilter]);

  // ── Refresh markers when site data updates ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    placeMarkers(sites, map);
  }, [sites]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function clearMarkers() {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
  }

  function placeMarkers(list: MapSite[], map: google.maps.Map) {
    clearMarkers();
    setInfo(null);

    list
      .filter(s => s.latitude != null && s.longitude != null)
      .forEach(site => {
        const isPower     = !!site.hasPowerTicket;
        const isNsa       = !!site.hasNsaTicket;
        const color       = isPower ? STC_RED : isNsa ? STC_YELLOW : STC_GREEN;
        const iconUrl     = isPower ? ICON_RED : isNsa ? ICON_YELLOW : ICON_GREEN;
        const statusLabel = isPower ? "DOWN — Power" : isNsa ? "ALARM — NSA" : "UP — Operational";

        const marker = new google.maps.Marker({
          position: { lat: site.latitude!, lng: site.longitude! },
          map,
          title: site.name,
          icon: {
            url:        iconUrl,
            scaledSize: new google.maps.Size(28, 28),
            anchor:     new google.maps.Point(14, 22),
          },
        });

        marker.addListener("click", () => {
          setInfo({ name: site.name, zone: site.zone, color, label: statusLabel });
          // Also open a native info window anchored to the marker
          infoWindowRef.current?.setContent(
            `<div style="font-family:system-ui,sans-serif;font-size:12px;min-width:150px;line-height:1.6">
              <strong style="font-size:13px">${site.name}</strong><br/>
              Zone: ${site.zone}<br/>
              Status: <span style="color:${color};font-weight:700">${statusLabel}</span>
            </div>`
          );
          infoWindowRef.current?.open(map, marker);
        });

        markersRef.current.push(marker);
      });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!GMAPS_KEY) {
    return (
      <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center",
        justifyContent:"center", background:"#0a0a1a", color:"#aaa", fontSize:13 }}>
        VITE_GOOGLE_MAPS_API_KEY not configured
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Glass info card on marker click */}
      {info && (
        <div
          onClick={() => setInfo(null)}
          style={{
            position: "absolute", bottom: 20, left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(10,0,24,0.88)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(200,140,255,0.28)",
            borderRadius: 12,
            padding: "10px 20px",
            color: "#e8e0f0",
            fontFamily: "system-ui,sans-serif",
            fontSize: 13,
            minWidth: 200,
            boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
            cursor: "pointer",
            zIndex: 10,
            lineHeight: 1.7,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{info.name}</div>
          <div style={{ color: "#b89ccc" }}>Zone: <strong style={{ color: "#e8e0f0" }}>{info.zone}</strong></div>
          <div>Status: <strong style={{ color: info.color }}>{info.label}</strong></div>
          <div style={{ color: "#7a6a8a", fontSize: 11, marginTop: 4 }}>click to dismiss</div>
        </div>
      )}
    </div>
  );
}
