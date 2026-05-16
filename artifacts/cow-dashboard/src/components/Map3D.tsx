/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const GMAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ?? "";
// "alpha" channel is required for the Maps 3D (Map3DElement) API
setOptions({ key: GMAPS_KEY, v: "alpha" });

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

// range = camera distance from center in metres; tilt = 0 top-down, 67.5 near-horizontal
const AREA_VIEWS: Record<string, { lat: number; lng: number; range: number; tilt: number; heading: number }> = {
  All:            { lat: 21.384, lng: 39.920, range: 22000, tilt: 52, heading: 0   },
  Arafat:         { lat: 21.357, lng: 39.972, range:  4000, tilt: 58, heading: 5   },
  Mina:           { lat: 21.412, lng: 39.898, range:  3800, tilt: 58, heading: -8  },
  Muzdalifah:     { lat: 21.384, lng: 39.912, range:  4200, tilt: 58, heading: 0   },
  "Makka Remote": { lat: 21.420, lng: 39.930, range: 45000, tilt: 45, heading: 0   },
};

const BASE        = (import.meta.env.BASE_URL as string) ?? "/";
const ICON_RED    = `${BASE}site-down.svg`;
const ICON_YELLOW = `${BASE}site-alarm.svg`;
const ICON_GREEN  = `${BASE}site-up.svg`;

const STC_GREEN  = "#00C878";
const STC_YELLOW = "#F59E0B";
const STC_RED    = "#EF4444";

interface InfoState {
  name: string;
  zone: string;
  color: string;
  label: string;
}

export default function Map3D({ sites, areaFilter }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const map3DRef     = useRef<HTMLElement | null>(null);
  const markersRef   = useRef<HTMLElement[]>([]);
  const sitesRef     = useRef(sites);
  sitesRef.current   = sites;

  const [info, setInfo] = useState<InfoState | null>(null);

  // ── Mount: create Map3DElement ─────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || map3DRef.current) return;
    const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS.All;

    (async () => {
      // Load 3D + marker libraries in parallel
      const [lib3D, libMarker] = await Promise.all([
        importLibrary("maps3d"),
        importLibrary("marker"),
      ]);

      if (!containerRef.current) return;

      const {
        Map3DElement,
        Marker3DInteractiveElement,
        AltitudeMode,
      } = lib3D as any;

      const { PinElement } = libMarker as any;

      // Create the 3D map element (Web Component)
      const map3D = new Map3DElement({
        center:   { lat: view.lat, lng: view.lng, altitude: 0 },
        range:    view.range,
        tilt:     view.tilt,
        heading:  view.heading,
        defaultLabelsDisabled: false,
      });

      Object.assign(map3D.style, {
        width: "100%",
        height: "100%",
        display: "block",
      });

      containerRef.current.appendChild(map3D);
      map3DRef.current = map3D;

      placeMarkers3D(sitesRef.current, map3D, Marker3DInteractiveElement, AltitudeMode, PinElement);
    })();

    return () => {
      clearMarkers();
      if (map3DRef.current && containerRef.current?.contains(map3DRef.current)) {
        containerRef.current.removeChild(map3DRef.current);
      }
      map3DRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fly to area when filter changes ───────────────────────────────────────
  useEffect(() => {
    const map3D = map3DRef.current as any;
    if (!map3D) return;
    const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS.All;

    map3D.flyCameraTo?.({
      endCamera: {
        center:  { lat: view.lat, lng: view.lng, altitude: 0 },
        range:   view.range,
        tilt:    view.tilt,
        heading: view.heading,
      },
      durationMilliseconds: 1800,
    });
  }, [areaFilter]);

  // ── Refresh markers when site data updates ────────────────────────────────
  useEffect(() => {
    const map3D = map3DRef.current as any;
    if (!map3D) return;

    (async () => {
      const [lib3D, libMarker] = await Promise.all([
        importLibrary("maps3d"),
        importLibrary("marker"),
      ]);
      const { Marker3DInteractiveElement, AltitudeMode } = lib3D as any;
      const { PinElement } = libMarker as any;
      placeMarkers3D(sites, map3D, Marker3DInteractiveElement, AltitudeMode, PinElement);
    })();
  }, [sites]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────
  function clearMarkers() {
    markersRef.current.forEach(m => (m as any).remove?.());
    markersRef.current = [];
  }

  function placeMarkers3D(
    list: MapSite[],
    map3D: any,
    Marker3DInteractiveElement: any,
    AltitudeMode: any,
    PinElement: any,
  ) {
    clearMarkers();

    list
      .filter(s => s.latitude != null && s.longitude != null)
      .forEach(site => {
        const isPower     = !!site.hasPowerTicket;
        const isNsa       = !!site.hasNsaTicket;
        const color       = isPower ? STC_RED : isNsa ? STC_YELLOW : STC_GREEN;
        const statusLabel = isPower ? "DOWN — Power"
                          : isNsa   ? "ALARM — NSA"
                          :           "UP — Operational";

        // Build a PinElement with status colour
        const pin = new PinElement({
          background:   color,
          borderColor:  "rgba(255,255,255,0.85)",
          glyphColor:   "#ffffff",
          scale:        isPower ? 1.3 : isNsa ? 1.15 : 1.0,
        });

        const marker = new Marker3DInteractiveElement({
          position:     { lat: site.latitude!, lng: site.longitude!, altitude: 0 },
          altitudeMode: AltitudeMode.CLAMP_TO_GROUND,
          extruded:     false,
        });

        marker.appendChild(pin.element);
        marker.addEventListener("gmp-click", () => {
          setInfo({ name: site.name, zone: site.zone, color, label: statusLabel });
        });

        map3D.appendChild(marker);
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
      {/* 3D map renders into this div */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Site info popup on marker click */}
      {info && (
        <div
          onClick={() => setInfo(null)}
          style={{
            position: "absolute", bottom: 24, left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(10,0,24,0.88)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(200,140,255,0.28)",
            borderRadius: 12,
            padding: "12px 20px",
            color: "#e8e0f0",
            fontFamily: "system-ui,sans-serif",
            fontSize: 13,
            minWidth: 200,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            cursor: "pointer",
            zIndex: 10,
            lineHeight: 1.7,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{info.name}</div>
          <div style={{ color: "#b89ccc" }}>Zone: <strong style={{ color: "#e8e0f0" }}>{info.zone}</strong></div>
          <div>Status: <strong style={{ color: info.color }}>{info.label}</strong></div>
          <div style={{ color: "#7a6a8a", fontSize: 11, marginTop: 6 }}>click to dismiss</div>
        </div>
      )}
    </div>
  );
}
