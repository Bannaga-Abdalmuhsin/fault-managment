import { Router } from "express";
import { createHash, createHmac } from "crypto";

const router = Router();

const VALID_USERNAME  = "cowms.hajj@aces-co.com";
const PASSWORD_HASH   = "df084296e967827cec22543a77dec582f096b572803adf3482e7698b73f58723";
const SESSION_SECRET  = (process.env.SESSION_SECRET ?? "hajj-cow-secret-fallback").trim();

function makeToken(username: string): string {
  return createHmac("sha256", SESSION_SECRET).update(username).digest("hex");
}

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }
  const pwHash = createHash("sha256").update(password).digest("hex");
  if (username.toLowerCase().trim() !== VALID_USERNAME || pwHash !== PASSWORD_HASH) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = makeToken(VALID_USERNAME);
  res.json({ token });
});

router.get("/auth/verify", (req, res) => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const expected = makeToken(VALID_USERNAME);
  if (!token || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({ ok: true });
});

export default router;
