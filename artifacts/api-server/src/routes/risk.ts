import { Router } from "express";
import { addSseClient, removeSseClient, getActiveCards } from "../lib/riskEngine";

const router = Router();

// ── SSE stream: GET /api/risk/stream ─────────────────────────────────────────
router.get("/risk/stream", (req, res) => {
  res.setHeader("Content-Type",      "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control",     "no-cache, no-transform");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");   // disable nginx buffering
  res.flushHeaders();

  addSseClient(res);

  // Keep-alive ping every 25 s (prevents proxy timeouts)
  const ping = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* client gone */ }
  }, 25_000);

  req.on("close", () => {
    clearInterval(ping);
    removeSseClient(res);
  });
});

// ── REST fallback: GET /api/risk/cards ────────────────────────────────────────
router.get("/risk/cards", (_req, res) => {
  res.json(getActiveCards());
});

export default router;
