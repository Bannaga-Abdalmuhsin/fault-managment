/// <reference types="@types/google.maps" />
import { useEffect, useRef } from "react";
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

const AREA_VIEWS: Record<string, { lat: number; lng: number; zoom: number }> = {
  All:            { lat: 21.38,  lng: 39.93,  zoom: 11  },
  Arafat:         { lat: 21.357, lng: 39.972, zoom: 13  },
  Mina:           { lat: 21.412, lng: 39.898, zoom: 13  },
  Muzdalifah:     { lat: 21.384, lng: 39.912, zoom: 13  },
  "Makka Remote": { lat: 21.42,  lng: 39.93,  zoom: 10  },
};

const BASE     = (import.meta.env.BASE_URL as string) ?? "/";
const ICON_RED    = `${BASE}site-down.svg`;
const ICON_YELLOW = `${BASE}site-alarm.svg`;
const ICON_GREEN  = `${BASE}site-up.svg`;

const STC_GREEN  = "#00C878";
const STC_YELLOW = "#F59E0B";
const STC_RED    = "#EF4444";

export default function Map3D({ sites, areaFilter }: Map3DProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<google.maps.Map | null>(null);
  const markersRef    = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const sitesRef      = useRef(sites);
  sitesRef.current    = sites;

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
        tilt:              45,
        zoomControl:       true,
        mapTypeControl:    false,
        streetViewControl: false,
        fullscreenControl: false,
        rotateControl:     true,
        gestureHandling:   "greedy",
        styles: [
          { featureType: "all", elementType: "labels.text.fill",   stylers: [{ color: "#ffffff" }] },
          { featureType: "all", elementType: "labels.text.stroke",  stylers: [{ color: "#000000" }, { weight: 2 }] },
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

  // ── Pan when area filter changes ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const view = AREA_VIEWS[areaFilter] ?? AREA_VIEWS.All;
    map.panTo({ lat: view.lat, lng: view.lng });
    map.setZoom(view.zoom);
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

    list
      .filter(s => s.latitude != null && s.longitude != null)
      .forEach(site => {
        const isPower     = !!site.hasPowerTicket;
        const isNsa       = !!site.hasNsaTicket;
        const color       = isPower ? STC_RED : isNsa ? STC_YELLOW : STC_GREEN;
        const iconUrl     = isPower ? ICON_RED : isNsa ? ICON_YELLOW : ICON_GREEN;
        const statusLabel = isPower ? "DOWN — Power"
                          : isNsa   ? "ALARM — NSA"
                          :           "UP — Operational";

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
          infoWindowRef.current?.setContent(
            `<div style="font-family:system-ui,sans-serif;font-size:12px;min-width:160px;padding:6px 4px;line-height:1.6">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#1a1a1a">${site.name}</div>
              <div style="color:#555;margin-bottom:2px">Zone: <strong>${site.zone}</strong></div>
              <div>Status: <span style="color:${color};font-weight:700">${statusLabel}</span></div>
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
      <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:"#0a0a1a", color:"#aaa", fontSize:13 }}>
        VITE_GOOGLE_MAPS_API_KEY not configured
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
