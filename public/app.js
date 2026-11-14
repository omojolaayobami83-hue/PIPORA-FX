/* ==========================================
   PIPORA GOLD
   SMART MARKET INTELLIGENCE
   Market Analysis Engine
========================================== */

"use strict";

// ==========================================
// CONFIGURATION
// ==========================================

const MARKETS = {
  XAUUSD: {
    symbol: "OANDA:XAUUSD",
    digits: 2,
    label: "Gold vs US Dollar",
    pipLabel: "price dollars"
  },
  GBPJPY: {
    symbol: "FX:GBPJPY",
    digits: 3,
    label: "British Pound vs Japanese Yen",
    pipLabel: "price units"
  }
};

const TIMEFRAMES = {
  "5min": "5",
  "15min": "15",
  "1h": "60",
  "4h": "240"
};

let selectedMarket = "XAUUSD";
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

  if (pageName === "market") {
    renderChart();
    loadMarketData();
  }
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.page);
  });
});

const backButton = getElement("backToDashboard");
if (backButton) backButton.addEventListener("click", () => showPage("dashboard"));


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
    setText("marketPageTitle", market === "XAUUSD" ? "GOLD vs USD" : "GBP vs JPY");
    setText("marketPageSubtitle", market === "XAUUSD" ? "XAUUSD · Gold market analysis" : "GBPJPY · Pound / Yen market analysis");    document.querySelectorAll("[data-market]").forEach(item => {
      item.classList.toggle(
        "active",
        item.dataset.market === market
      );
    });

    setText("chartMarket", market);
    setText("runMtfScan", "Run " + (market === "XAUUSD" ? "Gold" : "GBPJPY") + " scan");

    resetAnalysis();
    showPage("market");
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


function calculateATR(data, period = 14) {
  if (data.length <= period) return null;
  const ranges = [];
  for (let i = 1; i < data.length; i++) {
    const current = data[i], previous = data[i - 1];
    ranges.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    ));
  }
  const recent = ranges.slice(-period);
  return recent.reduce((sum, value) => sum + value, 0) / recent.length;
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
  if (data.length < 22) return "Insufficient candles";
  const last = data[data.length - 1];
  const priorRange = data.slice(-21, -1);
  const priorHigh = Math.max(...priorRange.map(c => c.high));
  const priorLow = Math.min(...priorRange.map(c => c.low));
  const sweptHigh = last.high > priorHigh && last.close < priorHigh;
  const sweptLow = last.low < priorLow && last.close > priorLow;
  if (sweptHigh && sweptLow) return "Both-side sweep · unclear";
  if (sweptHigh) return "Possible buy-side liquidity sweep";
  if (sweptLow) return "Possible sell-side liquidity sweep";
  if (swings.highs.length && swings.lows.length) return "Swing liquidity levels mapped";
  return "Not identified";
}


function detectFairValueGap(data) {
  const start = Math.max(2, data.length - 12);
  for (let i = data.length - 1; i >= start; i--) {
    const left = data[i - 2];
    const right = data[i];
    if (right.low > left.high) return "Bullish FVG " + formatPrice(left.high) + "–" + formatPrice(right.low);
    if (right.high < left.low) return "Bearish FVG " + formatPrice(right.high) + "–" + formatPrice(left.low);
  }
  return "No recent 3-candle gap";
}

function detectPotentialOrderBlock(data, structure) {
  if (structure.bos !== "BULLISH" && structure.bos !== "BEARISH") return "No confirmed break · not mapped";
  const start = Math.max(0, data.length - 12);
  for (let i = data.length - 2; i >= start; i--) {
    const candle = data[i];
    if (structure.bos === "BULLISH" && candle.close < candle.open) {
      return "Potential demand " + formatPrice(candle.low) + "–" + formatPrice(candle.high);
    }
    if (structure.bos === "BEARISH" && candle.close > candle.open) {
      return "Potential supply " + formatPrice(candle.low) + "–" + formatPrice(candle.high);
    }
  }
  return "No clear opposing candle";
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
  const atr = calculateATR(candles, 14);

  const structure = analyzeStructure(candles);

  const recent = candles.slice(-21, -1);

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
  setText("atrValue", atr === null ? "--" : formatPrice(atr));
  setText("fairValueGap", detectFairValueGap(candles));
  setText("supplyDemand", detectPotentialOrderBlock(candles, structure));

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
    priceTrend,
    atr
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
    resistance,
    atr
  } = data;

  let decision = "WAIT";

  let explanation =
    "No sufficiently confirmed setup. Wait for clearer price action.";

  // These are educational filters, not guaranteed signals.
  const isGold = selectedMarket === "XAUUSD";
  const bullishRsiFloor = isGold ? 52 : 51;
  const rsiCeiling = isGold ? 68 : 67;
  const bearishRsiCeiling = isGold ? 48 : 49;
  const rsiFloor = isGold ? 32 : 33;
  const candleRange = last.high - last.low;
  const volatilityUsable = Number.isFinite(atr) && atr > 0 &&
    candleRange <= atr * (isGold ? 2.8 : 2.5);

  const bullishSetup =
    trend === "BULLISH" &&
    trendConfirmed &&
    bos === "BULLISH" &&
    rsi !== null &&
    rsi >= bullishRsiFloor &&
    rsi < rsiCeiling &&
    last.close > ema9 &&
    ema9 > ema21 &&
    volatilityUsable;

  const bearishSetup =
    trend === "BEARISH" &&
    trendConfirmed &&
    bos === "BEARISH" &&
    rsi !== null &&
    rsi <= bearishRsiCeiling &&
    rsi > rsiFloor &&
    last.close < ema9 &&
    ema9 < ema21 &&
    volatilityUsable;

  if (bullishSetup) {
    decision = "BUY CANDIDATE";

    explanation =
      "Bullish structure, EMA alignment, RSI and a bullish break are aligned. Check a retest, volatility, spread, relevant news and risk. This is a candidate, not an instruction.";
  } else if (bearishSetup) {
    decision = "SELL CANDIDATE";

    explanation =
      "Bearish structure, EMA alignment, RSI and a bearish break are aligned. Check a retest, volatility, spread, relevant news and risk. This is a candidate, not an instruction.";
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
  setText("atrValue", "--");
  setText("fairValueGap", "WAIT");

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
    const saved = localStorage.getItem("pipora_gold_journal") || localStorage.getItem("pipora_fx_journal");

    return saved ? JSON.parse(saved) : [];

  } catch (error) {
    console.error("Journal read error:", error);
    return [];
  }
}


function renderJournal() {
  const container = getElement("journalEntries");
  if (!container) return;
  container.replaceChildren();
  const entries = getJournalEntries();
  if (!entries.length) {
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
    title.textContent = `${entry.market} — ${entry.direction}`;
    const details = document.createElement("p");
    details.textContent = `Entry: ${entry.entry || "—"} | Exit: ${entry.exit || "—"} | P/L: ${entry.pnl === "" || entry.pnl == null ? "Not recorded" : entry.pnl}`;
    const notes = document.createElement("p");
    notes.textContent = entry.notes || "No notes recorded.";
    const date = document.createElement("p");
    date.textContent = entry.date || "";
    card.append(title, details, notes, date);
    container.appendChild(card);
  });
}


const saveJournalButton = getElement("saveJournal");

if (saveJournalButton) {
  saveJournalButton.addEventListener("click", () => {
    const market = getElement("journalMarket").value;

    const direction = getElement("journalDirection").value;

    const entryValue = getElement("journalEntry").value.trim();
    const exitValue = getElement("journalExit").value.trim();
    const pnlValue = getElement("journalPnl").value.trim();
    const notes = getElement("journalNotes").value.trim();

    if (!entryValue || !Number.isFinite(Number(entryValue))) {
      alert("Please enter a valid entry price.");
      return;
    }
    if (exitValue && !Number.isFinite(Number(exitValue))) {
      alert("Please enter a valid exit price.");
      return;
    }
    if (pnlValue && !Number.isFinite(Number(pnlValue))) {
      alert("Please enter a valid profit or loss amount.");
      return;
    }

    const entries = getJournalEntries();
    entries.push({
      market,
      direction,
      entry: entryValue,
      exit: exitValue,
      pnl: pnlValue,
      notes,
      date: new Date().toLocaleString()
    });

    try {
      localStorage.setItem(
        "pipora_gold_journal",
        JSON.stringify(entries)
      );

      getElement("journalEntry").value = "";
      getElement("journalExit").value = "";
      getElement("journalPnl").value = "";
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



const exportJournalButton = getElement("exportJournal");
if (exportJournalButton) {
  exportJournalButton.addEventListener("click", () => {
    const rows = getJournalEntries();
    if (!rows.length) {
      alert("There are no journal entries to export yet.");
      return;
    }
    const columns = ["date", "market", "direction", "entry", "exit", "pnl", "notes"];
    const quote = value => '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const csv = [columns.join(","), ...rows.map(row => columns.map(key => quote(row[key])).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pipora-gold-trading-journal.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
}

// ==========================================
// START APPLICATION
// ==========================================


/* PIPORA GOLD: top-down multi-timeframe analysis */
async function fetchTimeframeAnalysis(interval) {
  const q=new URLSearchParams({market:selectedMarket,interval});
  const response=await fetch("/api/price?"+q.toString());
  const payload=await response.json();
  if(!response.ok||!Array.isArray(payload.values)) throw new Error(payload.error||"Data unavailable");
  const data=payload.values.slice().reverse().map(c=>({open:+c.open,high:+c.high,low:+c.low,close:+c.close})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite));
  if(data.length<30) throw new Error("Not enough "+interval+" candles");
  const structure=analyzeStructure(data), closes=data.map(c=>c.close);
  const fast=calculateEMA(closes,9).at(-1), slow=calculateEMA(closes,21).at(-1);
  const emaBias=fast>slow?"BULLISH":fast<slow?"BEARISH":"NEUTRAL";
  return {bias:structure.trend===emaBias?emaBias:"MIXED",structure:structure.structure,emaBias};
}
async function runMtfScan(){
  const button=getElement("runMtfScan");if(button){button.disabled=true;button.textContent="Scanning…";}
  setText("mtfVerdict","SCANNING");setText("mtfExplanation","Comparing four Gold timeframes…");
  const frames=[["4h","mtf4h"],["1h","mtf1h"],["15min","mtf15m"],["5min","mtf5m"]], results={};
  try{
    for(const [tf,id] of frames){const a=await fetchTimeframeAnalysis(tf);results[tf]=a;setText(id,a.bias);setText(id+"Note",a.structure+" · EMA "+a.emaBias);}
    const higher=[results["4h"].bias,results["1h"].bias], lower=[results["15min"].bias,results["5min"].bias];
    let verdict="WAIT", explanation="Timeframes are mixed. Wait for agreement; do not force a trade.";
    if(higher.every(x=>x==="BULLISH")&&lower.every(x=>x==="BULLISH")){verdict="BULLISH ALIGNMENT";explanation="All four timeframes currently align bullish. This is context, not an entry signal; wait for a pullback and a separate trigger.";}
    else if(higher.every(x=>x==="BEARISH")&&lower.every(x=>x==="BEARISH")){verdict="BEARISH ALIGNMENT";explanation="All four timeframes currently align bearish. This is context, not an entry signal; wait for a pullback and a separate trigger.";}
    else if(higher.every(x=>x==="BULLISH")){verdict="BULLISH BIAS · WAIT";explanation="The higher timeframes lean bullish, but lower-timeframe confirmation is incomplete.";}
    else if(higher.every(x=>x==="BEARISH")){verdict="BEARISH BIAS · WAIT";explanation="The higher timeframes lean bearish, but lower-timeframe confirmation is incomplete.";}
    setText("mtfVerdict",verdict);setText("mtfExplanation",explanation);
    setText("mtfUpdated","Last scan: "+new Date().toLocaleString("en-NG",{timeZone:"Africa/Lagos"}));
  }catch(error){setText("mtfVerdict","SCAN INCOMPLETE");setText("mtfExplanation",error.message+" No directional conclusion is available.");frames.forEach(([,id])=>{setText(id,"--");setText(id+"Note","Data unavailable");});}
  finally{if(button){button.disabled=false;button.textContent="Run "+(selectedMarket==="XAUUSD"?"Gold":"GBPJPY")+" scan";}}
}
function updateGoldSessionClock(){
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Lagos",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
  const h=Number(parts.find(p=>p.type==="hour").value),m=Number(parts.find(p=>p.type==="minute").value),t=h*60+m;
  const active=(start,end)=>t>=start&&t<end;
  setText("londonSession",active(480,1020)?"OPEN · approx 08:00–17:00":"CLOSED · approx 08:00–17:00");
  setText("newYorkSession",active(780,1260)?"OPEN · approx 13:00–21:00":"CLOSED · approx 13:00–21:00");
  setText("overlapSession",active(780,1020)?"OPEN · approx 13:00–17:00":"CLOSED · approx 13:00–17:00");
}
const mtfButton=getElement("runMtfScan");if(mtfButton)mtfButton.addEventListener("click",runMtfScan);
updateGoldSessionClock();setInterval(updateGoldSessionClock,60000);

async function loadDashboardPrices(){
  for (const market of ["XAUUSD","GBPJPY"]) {
    const node=getElement("tilePrice"+market);
    if(!node) continue;
    try {
      const q=new URLSearchParams({market,interval:"15min"});
      const response=await fetch("/api/price?"+q.toString());
      const data=await response.json();
      if(!response.ok||!Array.isArray(data.values)||!data.values.length) throw new Error(data.error||"Price unavailable");
      const price=Number(data.values[0].close);
      const digits=MARKETS[market].digits;
      node.textContent=Number.isFinite(price)?price.toLocaleString("en-US",{minimumFractionDigits:digits,maximumFractionDigits:digits}):"Price unavailable";
    } catch(error) { node.textContent="Price unavailable"; }
  }
}

function startApp() {
  resetAnalysis();

  renderJournal();

  loadDashboardPrices();
}

document.addEventListener("DOMContentLoaded", startApp);

// PIPORA GOLD risk calculator: broker contract size is user supplied.
function calculateGoldRisk(){
  const balance=Number(getElement("riskBalance")?.value);
  const riskPct=Number(getElement("riskPercent")?.value);
  const stopDistance=Number(getElement("riskDistance")?.value);
  const contractSize=Number(getElement("riskContract")?.value);
  const conversion=Number(getElement("riskConversion")?.value);
  const amountNode=getElement("riskAmount"), lotsNode=getElement("riskLots"), noteNode=getElement("riskNote");
  if(![balance,riskPct,stopDistance,contractSize,conversion].every(Number.isFinite)||balance<=0||riskPct<=0||riskPct>100||stopDistance<=0||contractSize<=0||conversion<=0){
    if(amountNode)amountNode.textContent="Risk amount: enter valid positive values";
    if(lotsNode)lotsNode.textContent="Estimated lot size: --";
    if(noteNode)noteNode.textContent="All four inputs are required. Check your broker's contract size.";
    return;
  }
  const riskAmount=balance*riskPct/100;
  const estimatedLots=riskAmount/(stopDistance*contractSize*conversion);
  if(amountNode)amountNode.textContent="Risk amount: "+riskAmount.toFixed(2)+" (account currency)";
  if(lotsNode)lotsNode.textContent="Estimated lot size: "+estimatedLots.toFixed(4);
  if(noteNode)noteNode.textContent="Formula includes your quote-currency-to-account-currency conversion factor. Confirm contract size, tick value, lot step, minimum lot, spread, commission and margin with your broker. If your account currency is the quote currency, use 1. This estimate is not a trade instruction.";
}
const riskButton=getElement("calculateRisk");
if(riskButton)riskButton.addEventListener("click",calculateGoldRisk);

// Manual event checker only: this does not fetch or verify live news.
function checkGoldNewsEvent(){
  const name=getElement("newsEventName")?.value.trim();
  const rawTime=getElement("newsEventTime")?.value;
  const impact=getElement("newsImpact")?.value;
  const output=getElement("newsResult");
  if(!output)return;
  const eventTime=rawTime?new Date(rawTime):null;
  if(!name||!rawTime||!eventTime||Number.isNaN(eventTime.getTime())){
    output.textContent="Enter an event name and a valid event time. Confirm the time zone shown by your calendar.";
    output.className="news-result caution";
    return;
  }
  const minutes=(eventTime.getTime()-Date.now())/60000;
  const windowMinutes=impact==="high"?30:impact==="medium"?15:5;
  if(impact==="high"&&Math.abs(minutes)<=30){
    output.textContent=name+": HIGH-IMPACT EVENT WINDOW. Avoid opening a new "+selectedMarket+" trade; volatility and spread can rise. Event time is based on your device clock.";
    output.className="news-result danger";
  }else if(impact==="medium"&&Math.abs(minutes)<=15){
    output.textContent=name+": medium-impact event is near. Consider waiting for volatility to settle.";
    output.className="news-result caution";
  }else if(impact==="low"&&Math.abs(minutes)<=5){
    output.textContent=name+": event time is close. Use caution.";
    output.className="news-result caution";
  }else if(minutes>windowMinutes){
    output.textContent=name+" is about "+Math.round(minutes)+" minutes away. Recheck the calendar and market conditions closer to release.";
    output.className="news-result";
  }else{
    output.textContent=name+" is outside the warning window or has passed. This manual check cannot confirm whether the event was released.";
    output.className="news-result";
  }
}
const newsButton=getElement("checkNews");
if(newsButton)newsButton.addEventListener("click",checkGoldNewsEvent);


// PWA install prompt (supported Android browsers).
let piporaInstallPrompt=null;
const installAppButton=getElement("installAppButton");
window.addEventListener("beforeinstallprompt",event=>{
  event.preventDefault();piporaInstallPrompt=event;
  if(installAppButton)installAppButton.hidden=false;
});
if(installAppButton){
  installAppButton.addEventListener("click",async()=>{
    if(!piporaInstallPrompt){
      alert("To install PIPORA GOLD, open your browser menu and choose 'Install app' or 'Add to Home screen'.");
      return;
    }
    piporaInstallPrompt.prompt();
    await piporaInstallPrompt.userChoice;
    piporaInstallPrompt=null;installAppButton.hidden=true;
  });
}
window.addEventListener("appinstalled",()=>{if(installAppButton)installAppButton.hidden=true;});
