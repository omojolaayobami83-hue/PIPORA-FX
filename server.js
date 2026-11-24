require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.TWELVE_DATA_API_KEY;
const ACCESS_PASSWORD = process.env.PIPORA_ACCESS_PASSWORD || "";
const SESSION_SECRET = process.env.PIPORA_SESSION_SECRET || "";
const SESSION_COOKIE = "pipora_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const CACHE_TTL_MS = 15000;
const marketCache = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 45;
const requestBuckets = new Map();
const loginBuckets = new Map();

app.set("trust proxy", 1);
app.use(express.json({ limit: "10kb" }));

const SYMBOLS = { XAUUSD: "XAU/USD", GBPUSD: "GBP/USD", EURUSD: "EUR/USD", USDJPY: "USD/JPY", GBPJPY: "GBP/JPY" };
const INTERVALS = new Set(["5min", "15min", "1h", "4h"]);

function authConfigured() {
  return ACCESS_PASSWORD.length >= 12 && SESSION_SECRET.length >= 32;
}
function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}
function safeEqual(a, b) {
  const left = crypto.createHash("sha256").update(String(a)).digest();
  const right = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}
function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const item of raw.split(";")) {
    const parts = item.trim().split("=");
    if (parts.shift() === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}
function validSession(req) {
  if (!authConfigured()) return false;
  const token = readCookie(req, SESSION_COOKIE);
  const split = token.lastIndexOf(".");
  if (split < 1) return false;
  const payload = token.slice(0, split);
  const signature = token.slice(split + 1);
  if (!safeEqual(signature, sign(payload))) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.exp > Math.floor(Date.now() / 1000) && session.v === 1;
  } catch (_) { return false; }
}
function setSessionCookie(res) {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  })).toString("base64url");
  const token = payload + "." + sign(payload);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000
  });
}
function isSameOrigin(req) {
  const origin = req.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === req.get("host"); }
  catch (_) { return false; }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "PIPORA FX", accessConfigured: authConfigured() });
});
app.get("/api/auth/status", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ authenticated: validSession(req), setupRequired: !authConfigured() });
});
app.post("/api/auth/login", (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!isSameOrigin(req)) return res.status(403).json({ error: "Request origin rejected." });
  if (!authConfigured()) return res.status(503).json({ error: "Owner access is not configured yet. Add the two PIPORA access variables in Render." });
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  let bucket = loginBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= 15 * 60 * 1000) bucket = { startedAt: now, count: 0 };
  bucket.count++;
  loginBuckets.set(ip, bucket);
  if (bucket.count > 8) return res.status(429).json({ error: "Too many login attempts. Wait 15 minutes and try again." });
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!safeEqual(password, ACCESS_PASSWORD)) {
    return res.status(401).json({ error: "Password not recognised." });
  }
  loginBuckets.delete(ip);
  setSessionCookie(res);
  res.json({ ok: true });
});
app.post("/api/auth/logout", (req, res) => {
  if (!isSameOrigin(req)) return res.status(403).json({ error: "Request origin rejected." });
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/"
  });
  res.set("Cache-Control", "no-store");
  res.json({ ok: true });
});

// Only the standalone sign-in page and authentication endpoints are public.
// All app pages, static assets and market-data APIs require a valid signed session.
app.get("/login", (_req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.use((req, res, next) => {
  if (req.path === "/api/auth/login" || req.path === "/api/auth/status" || req.path === "/api/auth/logout") return next();
  if (!authConfigured()) {
    return res.status(503).send("PIPORA GOLD owner access is not configured. Add PIPORA_ACCESS_PASSWORD and PIPORA_SESSION_SECRET in Render environment variables, then redeploy.");
  }
  if (!validSession(req)) {
    if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Sign in to access PIPORA GOLD." });
    return res.redirect(302, "/login");
  }
  res.set("Cache-Control", "no-store");
  next();
});

app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  setHeaders(res) { res.setHeader("Cache-Control", "private, no-store"); }
}));
app.get("/api/markets", (_req, res) => res.json({ markets: SYMBOLS }));

app.get("/api/price", async (req, res) => {
  const market = String(req.query.market || "XAUUSD").toUpperCase();
  const interval = String(req.query.interval || "15min");
  if (!SYMBOLS[market]) return res.status(400).json({ error: "Unsupported market." });
  if (!INTERVALS.has(interval)) return res.status(400).json({ error: "Unsupported timeframe." });

  const now = Date.now();
  const clientKey = req.ip || req.socket.remoteAddress || "unknown";
  let bucket = requestBuckets.get(clientKey);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) bucket = { startedAt: now, count: 0 };
  bucket.count++;
  requestBuckets.set(clientKey, bucket);
  if (bucket.count > RATE_LIMIT_MAX) {
    res.set("Retry-After", String(Math.ceil((RATE_WINDOW_MS - (now - bucket.startedAt)) / 1000)));
    return res.status(429).json({ error: "Too many market-data requests. Please wait a minute and try again." });
  }
  if (requestBuckets.size > 1000) {
    for (const [key, value] of requestBuckets) if (now - value.startedAt >= RATE_WINDOW_MS) requestBuckets.delete(key);
  }
  if (!API_KEY) return res.status(503).json({ error: "Twelve Data API key is not configured." });

  try {
    const cacheKey = market + ":" + interval;
    const cached = marketCache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
      res.set("X-PIPORA-Cache", "HIT");
      return res.json(cached.payload);
    }
    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol", SYMBOLS[market]);
    url.searchParams.set("interval", interval);
    url.searchParams.set("outputsize", "100");
    url.searchParams.set("apikey", API_KEY);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try { response = await fetch(url, { signal: controller.signal }); }
    finally { clearTimeout(timeout); }
    const data = await response.json();
    if (!response.ok || data.status === "error" || !Array.isArray(data.values)) {
      return res.status(502).json({ error: data.message || data.status || "Market data provider returned an error." });
    }
    const values = data.values.map(row => ({
      datetime: row.datetime,
      open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close),
      volume: row.volume == null ? null : Number(row.volume)
    })).filter(row => [row.open,row.high,row.low,row.close].every(Number.isFinite));
    const payload = {
      market, providerSymbol: SYMBOLS[market], interval,
      currency: data.meta && data.meta.currency,
      exchange: data.meta && data.meta.exchange,
      values, fetchedAt: new Date().toISOString()
    };
    marketCache.set(cacheKey, { savedAt: Date.now(), payload });
    res.set("X-PIPORA-Cache", "MISS");
    res.json(payload);
  } catch (error) {
    console.error("Market data request failed:", error.message);
    res.status(502).json({
      error: error.name === "AbortError"
        ? "Market data provider timed out. Please try again shortly."
        : "Could not reach the market data provider."
    });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => {
  console.log("PIPORA GOLD running on port " + PORT);
  console.log("Twelve Data key configured: " + Boolean(API_KEY));
  console.log("Owner access configured: " + authConfigured());
});
