require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.TWELVE_DATA_API_KEY;

app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

// Supported markets
const SYMBOLS = {
  EURUSD: "EUR/USD",
  GBPUSD: "GBP/USD",
  XAUUSD: "XAU/USD",
  USDJPY: "USD/JPY",
  AUDUSD: "AUD/USD",
  USDCAD: "USD/CAD"
};

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
    req.query.market || "EURUSD"
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

  // Check API key
  if (!API_KEY) {
    return res.status(503).json({
      error: "Twelve Data API key is not configured.",
      setup:
        "Add TWELVE_DATA_API_KEY to your .env file and restart the server."
    });
  }

  try {
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

    const response = await fetch(url);

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
    res.json({
      market,

      providerSymbol: SYMBOLS[market],

      interval,

      currency:
        data.meta && data.meta.currency,

      exchange:
        data.meta && data.meta.exchange,

      values,

      fetchedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error(
      "Market data request failed:",
      error.message
    );

    res.status(502).json({
      error:
        "Could not reach the market data provider."
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