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

// ── Distance helpers (meters) ───────────────────────────────────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
function trailDistance(pts: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += haversineMeters(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
  }
  return total;
}

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
  // Per-fault movement breadcrumbs (last ~100m of actual movement)
  const trailsRef = useRef<Map<string, { lat: number; lng: number }[]>>(new Map());

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

      // Drop trails for faults that no longer exist or are closed.
      const activeIds = new Set(faults.filter(f => f.status !== "Closed").map(f => f.id));
      for (const id of [...trailsRef.current.keys()]) {
        if (!activeIds.has(id)) trailsRef.current.delete(id);
      }

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
        // Distance from team to site (km) — shown next to team name
        const siteCoord = siteCoordMap.get(fault.cowId);
        const distKm = siteCoord
          ? haversineMeters(fault.teamLat, fault.teamLng, siteCoord.lat, siteCoord.lng) / 1000
          : null;
        const distLabel = distKm != null
          ? (distKm < 1 ? `${Math.round(distKm * 1000)}m` : `${distKm.toFixed(1)}km`)
          : "";
        badge.innerHTML = `🚐 ${fault.assignedTeam.replace("Team ", "")}` +
          (distLabel && (fault.status === "Assigned" || fault.status === "En Route")
            ? ` <span style="opacity:.85;font-weight:600">· ${distLabel}</span>`
            : "");
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

        // ── Planned route (team → site) ───────────────────────────────────
        // Drawn while the team is en route. Uses fault.routePolyline when the
        // backend supplies a real road route, otherwise falls back to a
        // geodesic straight line.
        const inTransit = fault.status === "Assigned" || fault.status === "En Route";
        if (inTransit && siteCoord) {
          const path = fault.routePolyline && fault.routePolyline.length > 1
            ? fault.routePolyline
            : [{ lat: fault.teamLat, lng: fault.teamLng }, { lat: siteCoord.lat, lng: siteCoord.lng }];
          const isRealRoute = !!(fault.routePolyline && fault.routePolyline.length > 1);
          const isSelected = fault.id === selectedId;
          const plannedLine = new PolylineClass({
            path,
            strokeColor:   "#A78BFA", // STC light purple
            strokeOpacity: isSelected ? 0.75 : 0.4,
            strokeWeight:  isSelected ? 3 : 2,
            geodesic:      !isRealRoute,
            icons: [{
              icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2,
                      strokeColor: "#C4B5FD", strokeOpacity: 1 },
              offset: "50%",
              repeat: "80px",
            }],
            map,
            zIndex: 1,
          });
          polylinesRef.current.push(plannedLine);
        }

        // ── Movement trail (last ~100 m of actual team movement) ─────────
        // We append every fresh team position to a per-fault breadcrumb list
        // and trim from the front so cumulative distance stays under 100 m.
        const trail = trailsRef.current.get(fault.id) ?? [];
        const last  = trail[trail.length - 1];
        // Only push a new point if the team has actually moved (>2 m).
        if (!last || haversineMeters(last.lat, last.lng, fault.teamLat, fault.teamLng) > 2) {
          trail.push({ lat: fault.teamLat, lng: fault.teamLng });
        }
        // Trim from the front: keep only the most recent 100 m.
        while (trail.length > 1 && trailDistance(trail) > 100) {
          trail.shift();
        }
        trailsRef.current.set(fault.id, trail);

        // Draw the trail only while the team is actively moving (Assigned or En Route)
        // and we have at least two points to form a line.
        const isMoving = fault.status === "Assigned" || fault.status === "En Route";
        if (isMoving && trail.length >= 2) {
          const line = new PolylineClass({
            path: trail.map(p => ({ lat: p.lat, lng: p.lng })),
            strokeColor:   teamColor,
            strokeOpacity: 0.85,
            strokeWeight:  4,
            icons: [{
              icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3.5,
                      strokeColor: teamColor, fillColor: teamColor, fillOpacity: 1 },
              offset: "100%",
            }],
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
