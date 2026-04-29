import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const STC_GREEN = "#00A86B";
const STC_ORANGE = "#F59E0B";
const STC_RED = "#D32F2F";

export interface MapSite {
  id: number;
  name: string;
  zone: string;
  status: string;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

interface SatelliteMapProps {
  sites: MapSite[];
}

export default function SatelliteMap({ sites }: SatelliteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [21.38, 39.92],
      zoom: 10,
      zoomControl: true,
    });

    // Satellite layer
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "Esri World Imagery", maxZoom: 18 }
    ).addTo(map);

    // Labels overlay
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { attribution: "", maxZoom: 18, opacity: 0.6 }
    ).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when sites change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Add new markers
    const validSites = sites.filter(
      (s) => s.latitude != null && s.longitude != null
    );

    validSites.forEach((site) => {
      const color =
        site.status === "operational"
          ? STC_GREEN
          : site.status === "degraded"
          ? STC_ORANGE
          : STC_RED;

      const marker = L.circleMarker([site.latitude!, site.longitude!], {
        radius: 6,
        fillColor: color,
        color: "white",
        weight: 1.5,
        fillOpacity: 0.9,
      });

      marker.bindTooltip(
        `<strong>${site.name}</strong><br/>Zone: ${site.zone}<br/>Status: ${site.status.toUpperCase()}`,
        { direction: "top", offset: [0, -8] }
      );

      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [sites]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
