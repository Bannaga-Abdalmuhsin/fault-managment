/// <reference types="@types/google.maps" />
import { useEffect, useRef } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import cowTowerUrl from "../assets/cow-tower.png";
import type { FaultRecord, FaultSeverity, FaultStatus } from "../pages/FaultManagement";

const GMAPS_KEY = (
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ||
  (import.meta.env.GOOGLE_MAPS_API_KEY      as string) ||
  ""
);
setOptions({ key: GMAPS_KEY, v: "beta" });

// Inject keyframe styles
if (typeof document !== "undefined") {
  const id = "fault-map-styles";
  if (!document.getElementById(id)) {
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @keyframes faultPulse {
        0%   { transform:scale(1);   opacity:.9; }
        100% { transform:scale(2.6); opacity:0;  }
      }
    `;
    document.head.appendChild(s);
  }
}

const SEV_COLOR: Record<FaultSeverity, string> = {
  critical:   "#EF4444",
  major:      "#F59E0B",
  minor:      "#FACC15",
  monitoring: "#3B82F6",
};
const STATUS_TEAM_COLOR: Record<FaultStatus, string> = {
  "Assigned":  "#6366F1",
  "En Route":  "#3B82F6",
  "Arrived":   "#10B981",
  "Working":   "#F59E0B",
  "Resolved":  "#22C55E",
  "Closed":    "#6B7280",
};

interface SiteCoord { id: string; lat: number; lng: number; }

interface Props {
  faults:      FaultRecord[];
  sites:       SiteCoord[];
  selectedId:  string | null;
  onSelect:    (id: string) => void;
}

export default function FaultMap({ faults, sites, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<google.maps.Map | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef   = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylinesRef = useRef<any[]>([]);

  // ── Init map once ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
        importLibrary("maps")  as Promise<google.maps.MapsLibrary>,
        importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
      ]);
      if (cancelled || !containerRef.current) return;

      const map = new Map(containerRef.current, {
        center:          { lat: 21.384, lng: 39.920 },
        zoom:            12,
        tilt:            50,
        heading:         320,
        mapTypeId:       "hybrid" as google.maps.MapTypeId,
        mapId:           "DEMO_MAP_ID",
        gestureHandling: "greedy",
        disableDefaultUI: true,
        zoomControl:      true,
      });
      mapRef.current = map;

      // Bind markers initial render — will be updated by the faults/sites useEffect
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Update markers whenever faults/sites change ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let markerLib: any;

    (async () => {
      markerLib = await importLibrary("marker");
      const { AdvancedMarkerElement } = markerLib;
      const PolylineClass = google.maps.Polyline;

      // Clear old
      for (const m of markersRef.current)   { m.map = null; }
      for (const p of polylinesRef.current) { p.setMap(null); }
      markersRef.current   = [];
      polylinesRef.current = [];

      // Build a site-coord lookup
      const siteCoordMap = new Map<string, { lat: number; lng: number }>();
      for (const s of sites) siteCoordMap.set(s.id, { lat: s.lat, lng: s.lng });

      // ── COW site markers (only sites with active faults) ──────────────────
      for (const fault of faults) {
        if (fault.status === "Closed") continue;
        const coord = siteCoordMap.get(fault.cowId);
        if (!coord) continue;

        const color = SEV_COLOR[fault.severity];
        const isSelected = fault.id === selectedId;

        const wrap = document.createElement("div");
        wrap.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:0;cursor:pointer;position:relative;`;

        const img = document.createElement("img");
        img.src = cowTowerUrl;
        img.style.cssText = `width:${isSelected ? 44 : 32}px;height:auto;display:block;pointer-events:none;
          filter:drop-shadow(0 0 7px ${color}) drop-shadow(0 2px 3px rgba(0,0,0,0.6));
          transition:width .2s;`;
        wrap.appendChild(img);

        const dotWrap = document.createElement("div");
        dotWrap.style.cssText = `position:relative;width:12px;height:12px;margin-top:-3px;`;
        const dot = document.createElement("div");
        dot.style.cssText = `width:12px;height:12px;border-radius:50%;
          background:${color};box-shadow:0 0 8px 3px ${color}88;
          border:2px solid rgba(255,255,255,.85);position:relative;z-index:1;`;
        dotWrap.appendChild(dot);
        if (fault.severity === "critical") {
          for (const delay of ["0s", "0.65s"]) {
            const r = document.createElement("div");
            r.style.cssText = `position:absolute;inset:-6px;border-radius:50%;
              border:2px solid ${color};pointer-events:none;
              animation:faultPulse 1.4s ease-out infinite;animation-delay:${delay};`;
            dotWrap.appendChild(r);
          }
        }
        wrap.appendChild(dotWrap);

        const marker = new AdvancedMarkerElement({
          map, position: coord, content: wrap, zIndex: isSelected ? 200 : 100,
        });
        marker.addListener("gmp-click", () => onSelect(fault.id));
        markersRef.current.push(marker);
      }

      // ── Team vehicle markers ───────────────────────────────────────────────
      for (const fault of faults) {
        if (fault.status === "Closed" || fault.status === "Resolved") continue;
        const teamColor = STATUS_TEAM_COLOR[fault.status];

        const el = document.createElement("div");
        el.style.cssText = `
          display:flex;flex-direction:column;align-items:center;gap:2px;
          cursor:pointer;position:relative;
        `;
        const badge = document.createElement("div");
        badge.style.cssText = `
          background:${teamColor};border:2px solid rgba(255,255,255,.9);
          border-radius:20px;padding:2px 7px;
          font-size:10px;font-weight:800;color:#fff;white-space:nowrap;
          font-family:'Segoe UI',system-ui,sans-serif;
          box-shadow:0 0 8px ${teamColor}99;
        `;
        badge.textContent = `🚐 ${fault.assignedTeam.replace("Team ", "")}`;
        el.appendChild(badge);

        const tri = document.createElement("div");
        tri.style.cssText = `width:0;height:0;
          border-left:5px solid transparent;border-right:5px solid transparent;
          border-top:6px solid ${teamColor};`;
        el.appendChild(tri);

        // Pulse ring when on-site
        if (fault.status === "Arrived" || fault.status === "Working") {
          const ring = document.createElement("div");
          ring.style.cssText = `
            position:absolute;inset:-8px;border-radius:50%;
            border:2px solid ${teamColor};pointer-events:none;
            animation:faultPulse 1.4s ease-out infinite;`;
          el.appendChild(ring);
        }

        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: fault.teamLat, lng: fault.teamLng },
          content: el,
          zIndex: 50,
        });
        marker.addListener("gmp-click", () => onSelect(fault.id));
        markersRef.current.push(marker);

        // ── Route polyline from team → site ──────────────────────────────
        // Show route from the moment the team is Assigned until they Arrive on-site.
        const siteCoord = siteCoordMap.get(fault.cowId);
        const showRoute = siteCoord
          && (fault.status === "Assigned" || fault.status === "En Route")
          && (fault.teamLat !== siteCoord.lat || fault.teamLng !== siteCoord.lng);
        if (showRoute && siteCoord) {
          // Dashed style while Assigned (pre-departure), solid while En Route.
          const dashed = fault.status === "Assigned";
          const line = new PolylineClass({
            path: [
              { lat: fault.teamLat, lng: fault.teamLng },
              { lat: siteCoord.lat, lng: siteCoord.lng },
            ],
            strokeColor:   teamColor,
            strokeOpacity: dashed ? 0 : 0.75,
            strokeWeight:  3,
            icons: dashed
              ? [
                  { icon: { path: "M 0,-1 0,1", strokeColor: teamColor,
                            strokeOpacity: 0.9, scale: 3 },
                    offset: "0", repeat: "12px" },
                ]
              : [
                  { icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3.5,
                            strokeColor: teamColor, fillColor: teamColor, fillOpacity: 1 },
                    offset: "60%" },
                  { icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.5,
                            strokeColor: teamColor, fillColor: teamColor, fillOpacity: 0.7 },
                    offset: "30%" },
                ],
            map,
          });
          polylinesRef.current.push(line);
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faults, sites, selectedId]);

  return (
    <div ref={containerRef}
      style={{ width: "100%", height: "100%", borderRadius: 12, overflow: "hidden" }} />
  );
}
