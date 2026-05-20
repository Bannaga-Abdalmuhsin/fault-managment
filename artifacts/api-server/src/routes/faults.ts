import { Router } from "express";
import {
  addFaultSseClient, removeFaultSseClient,
  getActiveFaults, getFaultHistory,
  manualDispatch, manualSetStatus,
  type FaultStatus,
} from "../lib/faultEngine";
import { getPbiSyncStatus, triggerPbiSync } from "../lib/riskEngine";

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

// ── PBI sync status + manual sync trigger ──────────────────────────────────────
router.get("/faults/pbi-status", (_req, res) => res.json(getPbiSyncStatus()));

router.post("/faults/pbi-sync", async (req, res) => {
  try {
    const status = await triggerPbiSync();
    res.json(status);
  } catch (err: any) {
    req.log.error({ err }, "Manual PBI sync failed");
    res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
});

// ── Manual operator actions on a single fault ──────────────────────────────────
router.post("/faults/:id/dispatch", async (req, res) => {
  const ok = await manualDispatch(req.params.id);
  if (!ok) { res.status(404).json({ error: "Fault not found" }); return; }
  res.json({ ok: true });
});

const VALID_STATUSES: FaultStatus[] = ["Assigned", "En Route", "Arrived", "Working", "Resolved", "Closed"];

router.patch("/faults/:id/status", (req, res) => {
  const status = req.body?.status as FaultStatus | undefined;
  if (!status || !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }
  const ok = manualSetStatus(req.params.id, status);
  if (!ok) { res.status(404).json({ error: "Fault not found" }); return; }
  res.json({ ok: true });
});

export default router;
