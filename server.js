require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.TWELVE_DATA_API_KEY;
const CACHE_TTL_MS = 15000;
const marketCache = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 45;
const requestBuckets = new Map();

// Render and similar hosts sit behind a trusted reverse proxy.
app.set("trust proxy", 1);

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

// Supported markets
const SYMBOLS = { XAUUSD: "XAU/USD", GBPJPY: "GBP/JPY" };

// Supported timeframes
const INTERVALS = new Set([
  "5min",
  "15min",
  "1h",
  "4h"
]);

// Check if the server is running
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "PIPORA FX",
    supportedMarkets: Object.keys(SYMBOLS),
    apiConfigured: Boolean(API_KEY),
    timestamp: new Date().toISOString()
  });
});

// Get available markets
app.get("/api/markets", (_req, res) => {
  res.json({
    markets: SYMBOLS
  });
});

// Get live market data
app.get("/api/price", async (req, res) => {
  const market = String(
    req.query.market || "XAUUSD"
  ).toUpperCase();

  const interval = String(
    req.query.interval || "15min"
  );

  // Validate market
  if (!SYMBOLS[market]) {
    return res.status(400).json({
      error: "Unsupported market."
    });
  }

  // Validate timeframe
  if (!INTERVALS.has(interval)) {
    return res.status(400).json({
      error: "Unsupported timeframe."
    });
  }

  // Basic per-client protection for the shared data-provider quota.
  const now = Date.now();
  const clientKey = req.ip || req.socket.remoteAddress || "unknown";
  let bucket = requestBuckets.get(clientKey);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
  }
  bucket.count += 1;
  requestBuckets.set(clientKey, bucket);
  if (bucket.count > RATE_LIMIT_MAX) {
    res.set("Retry-After", String(Math.ceil((RATE_WINDOW_MS - (now - bucket.startedAt)) / 1000)));
    return res.status(429).json({
      error: "Too many market-data requests. Please wait a minute and try again."
    });
  }

  // Periodically remove expired client buckets to keep memory bounded.
  if (requestBuckets.size > 1000) {
    for (const [key, value] of requestBuckets) {
      if (now - value.startedAt >= RATE_WINDOW_MS) requestBuckets.delete(key);
    }
  }

  // Check API key
  if (!API_KEY) {
    return res.status(503).json({
      error: "Twelve Data API key is not configured.",
      setup:
        "Add TWELVE_DATA_API_KEY to your .env file and restart the server."
    });
  }

  try {
    const cacheKey = market + ":" + interval;
    const cached = marketCache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
      res.set("X-PIPORA-Cache", "HIT");
      return res.json(cached.payload);
    }

    const url = new URL(
      "https://api.twelvedata.com/time_series"
    );

    url.searchParams.set(
      "symbol",
      SYMBOLS[market]
    );

    url.searchParams.set(
      "interval",
      interval
    );

    url.searchParams.set(
      "outputsize",
      "100"
    );

    url.searchParams.set(
      "apikey",
      API_KEY
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();

    // Check provider response
    if (
      !response.ok ||
      data.status === "error" ||
      !Array.isArray(data.values)
    ) {
      return res.status(502).json({
        error:
          data.message ||
          data.status ||
          "Market data provider returned an error."
      });
    }

    // Prepare candle data
    const values = data.values
      .map((row) => ({
        datetime: row.datetime,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),

        volume:
          row.volume == null
            ? null
            : Number(row.volume)
      }))
      .filter((row) =>
        [
          row.open,
          row.high,
          row.low,
          row.close
        ].every(Number.isFinite)
      );

    // Send market data to frontend
    const payload = {
      market,
      providerSymbol: SYMBOLS[market],
      interval,
      currency: data.meta && data.meta.currency,
      exchange: data.meta && data.meta.exchange,
      values,
      fetchedAt: new Date().toISOString()
    };
    marketCache.set(cacheKey, { savedAt: Date.now(), payload });
    res.set("X-PIPORA-Cache", "MISS");
    res.json(payload);

  } catch (error) {
    console.error(
      "Market data request failed:",
      error.message
    );

    res.status(502).json({
      error: error.name === "AbortError"
        ? "Market data provider timed out. Please try again shortly."
        : "Could not reach the market data provider."
    });
  }
});

// Load the main application
app.get("*", (_req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

// Start server
app.listen(PORT, () => {
  console.log(
    `PIPORA FX running at http://localhost:${PORT}`
  );

  console.log(
    `Twelve Data key configured: ${Boolean(API_KEY)}`
  );
});