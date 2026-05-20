import { Router } from "express";
import {
  addFaultSseClient, removeFaultSseClient,
  getActiveFaults, getFaultHistory,
} from "../lib/faultEngine";

const router = Router();

// ── SSE stream ─────────────────────────────────────────────────────────────────
router.get("/faults/stream", (req, res) => {
  res.setHeader("Content-Type",      "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control",     "no-cache, no-transform");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  addFaultSseClient(res);

  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* gone */ }
  }, 25_000);

  req.on("close", () => {
    clearInterval(ping);
    removeFaultSseClient(res);
  });
});

// ── REST endpoints ─────────────────────────────────────────────────────────────
router.get("/faults/active",    (_req, res) => res.json(getActiveFaults()));
router.get("/faults/history",   (_req, res) => res.json(getFaultHistory()));
router.get("/dispatch/live",    (_req, res) => res.json(getActiveFaults()));
router.get("/teams/tracking",   (_req, res) => {
  res.json(getActiveFaults().map(f => ({
    teamId: f.teamId, teamName: f.assignedTeam,
    lat: f.teamLat, lng: f.teamLng,
    status: f.status, faultId: f.id, cowId: f.cowId,
  })));
});

export default router;
