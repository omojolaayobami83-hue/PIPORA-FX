/* ==========================================
   PIPORA FX
   SMART MARKET INTELLIGENCE
   Market Analysis Engine
========================================== */

"use strict";

// ==========================================
// CONFIGURATION
// ==========================================

const MARKETS = {
  EURUSD: {
    symbol: "FX:EURUSD",
    digits: 5
  },

  GBPUSD: {
    symbol: "FX:GBPUSD",
    digits: 5
  },

  XAUUSD: {
    symbol: "OANDA:XAUUSD",
    digits: 2
  },

  USDJPY: {
    symbol: "FX:USDJPY",
    digits: 3
  },

  AUDUSD: {
    symbol: "FX:AUDUSD",
    digits: 5
  },

  USDCAD: {
    symbol: "FX:USDCAD",
    digits: 5
  }
};

const TIMEFRAMES = {
  "5min": "5",
  "15min": "15",
  "1h": "60",
  "4h": "240"
};

let selectedMarket = "EURUSD";
let selectedTimeframe = "15min";

let candles = [];
let marketRequestNumber = 0;
let chartRequestNumber = 0;


// ==========================================
// HTML HELPERS
// ==========================================

function getElement(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = getElement(id);

  if (element) {
    element.textContent = value;
  }
}

function setStatus(message) {
  setText("connectionStatus", message);
}

function formatPrice(price) {
  if (!Number.isFinite(price)) {
    return "--";
  }

  const digits =
    MARKETS[selectedMarket]?.digits ?? 5;

  return price.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function setColor(id, color) {
  const element = getElement(id);

  if (element) {
    element.style.color = color;
  }
}


// ==========================================
// NAVIGATION
// ==========================================

function showPage(pageName) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle(
      "active",
      page.id === pageName
    );
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageName
    );
  });

  if (pageName === "dashboard") {
    renderChart();
  }
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.page);
  });
});


// ==========================================
// MARKET SELECTION
// ==========================================

document.querySelectorAll("[data-market]").forEach(button => {
  button.addEventListener("click", () => {
    const market = button.dataset.market;

    if (!MARKETS[market]) {
      return;
    }

    selectedMarket = market;

    document.querySelectorAll("[data-market]").forEach(item => {
      item.classList.toggle(
        "active",
        item.dataset.market === market
      );
    });

    setText("chartMarket", market);

    resetAnalysis();

    renderChart();

    loadMarketData();
  });
});


// ==========================================
// TIMEFRAME SELECTION
// ==========================================

document.querySelectorAll("[data-timeframe]").forEach(button => {
  button.addEventListener("click", () => {
    const timeframe = button.dataset.timeframe;

    if (!TIMEFRAMES[timeframe]) {
      return;
    }

    selectedTimeframe = timeframe;

    document.querySelectorAll("[data-timeframe]").forEach(item => {
      item.classList.toggle(
        "active",
        item.dataset.timeframe === timeframe
      );
    });

    resetAnalysis();

    renderChart();

    loadMarketData();
  });
});


// ==========================================
// TRADINGVIEW CHART
// ==========================================

function renderChart() {
  const container = getElement("tradingview-chart");

  if (!container) {
    return;
  }

  const requestId = ++chartRequestNumber;

  container.innerHTML = `
    <div class="chart-loading">
      Loading chart...
    </div>
  `;

  if (!window.TradingView) {
    container.innerHTML = `
      <div class="chart-loading">
        Chart library could not load.
        Check your internet connection.
      </div>
    `;

    return;
  }

  const market = selectedMarket;
  const timeframe = TIMEFRAMES[selectedTimeframe];

  try {
    container.innerHTML = "";

    new TradingView.widget({
      autosize: true,

      symbol: MARKETS[market].symbol,

      interval: timeframe,

      timezone: "Africa/Lagos",

      theme: "dark",

      style: "1",

      locale: "en",

      enable_publishing: false,

      allow_symbol_change: false,

      hide_side_toolbar: false,

      withdateranges: true,

      details: false,

      calendar: false,

      support_host: "https://www.tradingview.com",

      container_id: "tradingview-chart",

      studies: [
        "MASimple@tv-basicstudies"
      ]
    });

  } catch (error) {
    if (requestId === chartRequestNumber) {
      container.innerHTML = `
        <div class="chart-loading">
          Unable to load chart.
          Please refresh and try again.
        </div>
      `;
    }

    console.error("Chart error:", error);
  }
}


// ==========================================
// MARKET DATA
// ==========================================

async function loadMarketData() {
  const requestId = ++marketRequestNumber;

  setStatus("Connecting...");

  setText("priceDescription", "Loading market data");

  setText("signal", "WAIT");

  setText(
    "signalExplanation",
    "Waiting for market data and confirmation."
  );

  try {
    const query = new URLSearchParams({
      market: selectedMarket,
      interval: selectedTimeframe
    });

    const response = await fetch(
      `/api/price?${query.toString()}`
    );

    const data = await response.json();

    // Ignore an older response if the user changed markets.
    if (requestId !== marketRequestNumber) {
      return;
    }

    if (!response.ok) {
      throw new Error(
        data.error || "Market data unavailable."
      );
    }

    if (!Array.isArray(data.values) || data.values.length < 30) {
      throw new Error(
        "Not enough candles to calculate reliable indicators."
      );
    }

    // Provider returns newest candle first.
    // Analysis requires oldest candle first.
    candles = data.values
      .slice()
      .reverse()
      .filter(candle =>
        [
          candle.open,
          candle.high,
          candle.low,
          candle.close
        ].every(Number.isFinite)
      );

    if (candles.length < 30) {
      throw new Error("Insufficient valid candle data.");
    }

    setStatus("Live Data Connected");

    setText("priceDescription", "Provider data received");

    analyzeMarket();

  } catch (error) {
    if (requestId !== marketRequestNumber) {
      return;
    }

    console.error("Market data error:", error);

    candles = [];

    setStatus("Data Unavailable");

    resetAnalysis();

    setText("priceDescription", error.message);

    setText(
      "signalExplanation",
      "No trade decision can be made until valid market data is available."
    );
  }
}


// ==========================================
// TECHNICAL INDICATORS
// ==========================================

function calculateEMA(values, period) {
  if (values.length < period) {
    return [];
  }

  const multiplier = 2 / (period + 1);

  let average = values
    .slice(0, period)
    .reduce((sum, value) => sum + value, 0) / period;

  const result = Array(period - 1).fill(null);

  result.push(average);

  for (let i = period; i < values.length; i++) {
    average =
      values[i] * multiplier +
      average * (1 - multiplier);

    result.push(average);
  }

  return result;
}


function calculateRSI(values, period = 14) {
  if (values.length <= period) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const difference = values[i] - values[i - 1];

    if (difference > 0) {
      gains += difference;
    } else {
      losses += Math.abs(difference);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  for (let i = period + 1; i < values.length; i++) {
    const difference = values[i] - values[i - 1];

    const gain = Math.max(difference, 0);
    const loss = Math.max(-difference, 0);

    averageGain =
      (averageGain * (period - 1) + gain) / period;

    averageLoss =
      (averageLoss * (period - 1) + loss) / period;
  }

  if (averageLoss === 0) {
    return 100;
  }

  const relativeStrength = averageGain / averageLoss;

  return 100 - 100 / (1 + relativeStrength);
}


// ==========================================
// MARKET STRUCTURE
// ==========================================

function findSwingPoints(data, strength = 2) {
  const highs = [];
  const lows = [];

  for (
    let i = strength;
    i < data.length - strength;
    i++
  ) {
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= strength; j++) {
      if (
        data[i].high <= data[i - j].high ||
        data[i].high <= data[i + j].high
      ) {
        isHigh = false;
      }

      if (
        data[i].low >= data[i - j].low ||
        data[i].low >= data[i + j].low
      ) {
        isLow = false;
      }
    }

    if (isHigh) {
      highs.push({
        index: i,
        price: data[i].high
      });
    }

    if (isLow) {
      lows.push({
        index: i,
        price: data[i].low
      });
    }
  }

  return { highs, lows };
}


function analyzeStructure(data) {
  const swings = findSwingPoints(data);

  const highs = swings.highs;
  const lows = swings.lows;

  const last = data[data.length - 1];

  if (highs.length < 2 || lows.length < 2) {
    return {
      trend: "UNCLEAR",
      structure: "UNCLEAR",
      bos: "NOT CONFIRMED",
      choch: "NOT CONFIRMED",
      highs,
      lows
    };
  }

  const previousHigh = highs[highs.length - 2];
  const latestHigh = highs[highs.length - 1];

  const previousLow = lows[lows.length - 2];
  const latestLow = lows[lows.length - 1];

  const higherHigh = latestHigh.price > previousHigh.price;
  const higherLow = latestLow.price > previousLow.price;

  const lowerHigh = latestHigh.price < previousHigh.price;
  const lowerLow = latestLow.price < previousLow.price;

  let trend = "RANGING";

  if (higherHigh && higherLow) {
    trend = "BULLISH";
  } else if (lowerHigh && lowerLow) {
    trend = "BEARISH";
  }

  const previousSwingHigh = highs
    .filter(point => point.index < data.length - 1)
    .slice(-1)[0];

  const previousSwingLow = lows
    .filter(point => point.index < data.length - 1)
    .slice(-1)[0];

  let bos = "NOT CONFIRMED";
  let choch = "NOT CONFIRMED";

  if (previousSwingHigh && last.close > previousSwingHigh.price) {
    bos = "BULLISH";

    if (trend === "BEARISH") {
      choch = "POSSIBLE BULLISH SHIFT";
    }
  }

  if (previousSwingLow && last.close < previousSwingLow.price) {
    bos = "BEARISH";

    if (trend === "BULLISH") {
      choch = "POSSIBLE BEARISH SHIFT";
    }
  }

  let structure = "MIXED STRUCTURE";

  if (higherHigh && higherLow) {
    structure = "HH / HL";
  } else if (lowerHigh && lowerLow) {
    structure = "LH / LL";
  }

  return {
    trend,
    structure,
    bos,
    choch,
    highs,
    lows
  };
}


// ==========================================
// LIQUIDITY ESTIMATE
// ==========================================

function analyzeLiquidity(data, swings) {
  const recent = data.slice(-20);

  const recentHigh = Math.max(
    ...recent.map(candle => candle.high)
  );

  const recentLow = Math.min(
    ...recent.map(candle => candle.low)
  );

  const last = data[data.length - 1];

  const previous = data[data.length - 2];

  if (
    previous.high > recentHigh &&
    last.close < recentHigh
  ) {
    return "Possible high sweep";
  }

  if (
    previous.low < recentLow &&
    last.close > recentLow
  ) {
    return "Possible low sweep";
  }

  if (swings.highs.length && swings.lows.length) {
    return "Levels under observation";
  }

  return "Not identified";
}


// ==========================================
// MAIN ANALYSIS
// ==========================================

function analyzeMarket() {
  if (candles.length < 30) {
    resetAnalysis();
    return;
  }

  const closes = candles.map(candle => candle.close);

  const last = candles[candles.length - 1];

  const ema9Values = calculateEMA(closes, 9);
  const ema21Values = calculateEMA(closes, 21);

  const ema9 = ema9Values[ema9Values.length - 1];
  const ema21 = ema21Values[ema21Values.length - 1];

  const rsi = calculateRSI(closes, 14);

  const structure = analyzeStructure(candles);

  const recent = candles.slice(-20);

  const support = Math.min(
    ...recent.map(candle => candle.low)
  );

  const resistance = Math.max(
    ...recent.map(candle => candle.high)
  );

  const emaTrend =
    ema9 > ema21
      ? "BULLISH"
      : ema9 < ema21
        ? "BEARISH"
        : "NEUTRAL";

  const priceTrend =
    last.close > ema9
      ? "ABOVE EMA 9"
      : "BELOW EMA 9";

  const trendConfirmed =
    structure.trend === emaTrend &&
    structure.trend !== "RANGING" &&
    structure.trend !== "UNCLEAR";

  // Show market price.
  setText("marketPrice", formatPrice(last.close));

  // Show trend.
  setText("trend", structure.trend);

  setColor(
    "trend",
    structure.trend === "BULLISH"
      ? "#00e6a0"
      : structure.trend === "BEARISH"
        ? "#ff5364"
        : "#f5c451"
  );

  setText("structure", structure.structure);

  setText(
    "rsi",
    rsi === null ? "--" : rsi.toFixed(2)
  );

  setText("ema9", formatPrice(ema9));

  setText("ema21", formatPrice(ema21));

  setText(
    "rsiIndicator",
    rsi === null ? "--" : rsi.toFixed(2)
  );

  setText(
    "trendConfirmation",
    trendConfirmed ? "ALIGNED" : "NOT ALIGNED"
  );

  setText("bos", structure.bos);

  setText("choch", structure.choch);

  setText(
    "liquidity",
    analyzeLiquidity(candles, structure)
  );

  setText(
    "supplyDemand",
    "Zones require confirmation"
  );

  setText("support", formatPrice(support));

  setText("resistance", formatPrice(resistance));

  // Do not automatically recommend a trade.
  // Require multiple conditions before displaying a candidate.
  evaluateSetup({
    last,
    ema9,
    ema21,
    rsi,
    trend: structure.trend,
    structure: structure.structure,
    bos: structure.bos,
    trendConfirmed,
    support,
    resistance,
    priceTrend
  });
}


// ==========================================
// TRADE SETUP EVALUATION
// ==========================================

function evaluateSetup(data) {
  const {
    last,
    ema9,
    ema21,
    rsi,
    trend,
    bos,
    trendConfirmed,
    support,
    resistance
  } = data;

  let decision = "WAIT";

  let explanation =
    "No sufficiently confirmed setup. Wait for clearer price action.";

  // These are educational filters, not guaranteed signals.
  const bullishSetup =
    trend === "BULLISH" &&
    trendConfirmed &&
    bos === "BULLISH" &&
    rsi !== null &&
    rsi >= 50 &&
    rsi < 70 &&
    last.close > ema9 &&
    ema9 > ema21;

  const bearishSetup =
    trend === "BEARISH" &&
    trendConfirmed &&
    bos === "BEARISH" &&
    rsi !== null &&
    rsi <= 50 &&
    rsi > 30 &&
    last.close < ema9 &&
    ema9 < ema21;

  if (bullishSetup) {
    decision = "BUY CANDIDATE";

    explanation =
      "Bullish structure, EMA alignment, RSI and a bullish break are aligned. Check the retest, spread, news and risk before considering any trade.";
  } else if (bearishSetup) {
    decision = "SELL CANDIDATE";

    explanation =
      "Bearish structure, EMA alignment, RSI and a bearish break are aligned. Check the retest, spread, news and risk before considering any trade.";
  }

  const badge = getElement("signal");

  if (badge) {
    badge.textContent = decision;

    badge.className = "signal-badge";

    if (decision === "BUY CANDIDATE") {
      badge.classList.add("buy");
    } else if (decision === "SELL CANDIDATE") {
      badge.classList.add("sell");
    } else {
      badge.classList.add("wait");
    }
  }

  setText("signalExplanation", explanation);

  // Display possible reference levels, not guaranteed trade orders.
  if (decision === "BUY CANDIDATE") {
    setText("entry", formatPrice(last.close));

    setText(
      "stopLoss",
      formatPrice(support)
    );

    setText(
      "takeProfit",
      formatPrice(resistance)
    );

  } else if (decision === "SELL CANDIDATE") {
    setText("entry", formatPrice(last.close));

    setText(
      "stopLoss",
      formatPrice(resistance)
    );

    setText(
      "takeProfit",
      formatPrice(support)
    );

  } else {
    setText("entry", "--");
    setText("stopLoss", "--");
    setText("takeProfit", "--");
  }
}


// ==========================================
// RESET ANALYSIS
// ==========================================

function resetAnalysis() {
  setText("marketPrice", "--");
  setText("trend", "WAIT");
  setText("structure", "WAIT");
  setText("rsi", "--");

  setText("ema9", "--");
  setText("ema21", "--");
  setText("rsiIndicator", "--");

  setText("trendConfirmation", "WAIT");

  setText("bos", "WAIT");
  setText("choch", "WAIT");
  setText("liquidity", "WAIT");

  setText("supplyDemand", "WAIT");

  setText("support", "--");
  setText("resistance", "--");

  setText("entry", "--");
  setText("stopLoss", "--");
  setText("takeProfit", "--");

  const badge = getElement("signal");

  if (badge) {
    badge.textContent = "WAIT";
    badge.className = "signal-badge wait";
  }

  setText(
    "signalExplanation",
    "Waiting for market data and confirmation."
  );
}


// ==========================================
// TRADE JOURNAL
// ==========================================

function getJournalEntries() {
  try {
    const saved = localStorage.getItem(
      "pipora_fx_journal"
    );

    return saved ? JSON.parse(saved) : [];

  } catch (error) {
    console.error("Journal read error:", error);
    return [];
  }
}


function renderJournal() {
  const container = getElement("journalEntries");

  if (!container) {
    return;
  }

  container.replaceChildren();

  const entries = getJournalEntries();

  if (entries.length === 0) {
    const empty = document.createElement("p");

    empty.textContent = "No journal entries yet.";

    empty.style.color = "#8995a5";

    container.appendChild(empty);

    return;
  }

  entries.slice().reverse().forEach(entry => {
    const card = document.createElement("div");

    card.className = "journal-entry";

    const title = document.createElement("strong");

    title.textContent =
      `${entry.market} — ${entry.direction}`;

    const notes = document.createElement("p");

    notes.textContent =
      `Entry: ${entry.entry || "Not entered"} | ${entry.notes || "No notes"}`;

    const date = document.createElement("p");

    date.textContent = entry.date;

    card.append(title, notes, date);

    container.appendChild(card);
  });
}


const saveJournalButton = getElement("saveJournal");

if (saveJournalButton) {
  saveJournalButton.addEventListener("click", () => {
    const market = getElement("journalMarket").value;

    const direction = getElement("journalDirection").value;

    const entryValue = getElement("journalEntry").value.trim();

    const notes = getElement("journalNotes").value.trim();

    if (entryValue && !Number.isFinite(Number(entryValue))) {
      alert("Please enter a valid entry price.");
      return;
    }

    const entries = getJournalEntries();

    entries.push({
      market,
      direction,
      entry: entryValue,
      notes,
      date: new Date().toLocaleString()
    });

    try {
      localStorage.setItem(
        "pipora_fx_journal",
        JSON.stringify(entries)
      );

      getElement("journalEntry").value = "";
      getElement("journalNotes").value = "";

      renderJournal();

      alert("Journal entry saved.");

    } catch (error) {
      console.error("Journal save error:", error);

      alert(
        "Could not save the journal. Check your browser storage."
      );
    }
  });
}


// ==========================================
// START APPLICATION
// ==========================================

function startApp() {
  resetAnalysis();

  renderJournal();

  renderChart();

  loadMarketData();
}

document.addEventListener("DOMContentLoaded", startApp);