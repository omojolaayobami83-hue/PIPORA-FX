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
  XAUUSD: { symbol: "OANDA:XAUUSD", digits: 2, label: "Gold vs US Dollar", pipLabel: "price dollars" },
  GBPUSD: { symbol: "FX:GBPUSD", digits: 5, label: "British Pound vs US Dollar", pipLabel: "pips" },
  EURUSD: { symbol: "FX:EURUSD", digits: 5, label: "Euro vs US Dollar", pipLabel: "pips" },
  USDJPY: { symbol: "FX:USDJPY", digits: 3, label: "US Dollar vs Japanese Yen", pipLabel: "pips" },
  GBPJPY: { symbol: "FX:GBPJPY", digits: 3, label: "British Pound vs Japanese Yen", pipLabel: "pips" }
};

const TIMEFRAMES = {
  "5min": "5",
  "15min": "15",
  "1h": "60",
  "4h": "240"
};

let selectedMarket = "XAUUSD";
window.getPiporaSelectedMarket = () => selectedMarket;
let selectedTimeframe = "5min";

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
    setText("marketPageTitle", market + " · " + MARKETS[market].label);
    setText("marketPageSubtitle", "ICT-inspired scalping mentor · 5M execution");    document.querySelectorAll("[data-market]").forEach(item => {
      item.classList.toggle(
        "active",
        item.dataset.market === market
      );
    });

    setText("chartMarket", market);
    setText("runMtfScan", "Run " + market + " scan");

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

// Twelve Data returns newest candles first. The newest bar may still be forming.
// Drop it conservatively so analysis, scanner and backtest use completed candles only.
function normalizeClosedCandles(values) {
  if (!Array.isArray(values)) return [];
  const ordered = values.slice().reverse();
  const clean = [];
  const seen = new Set();
  for (const row of ordered) {
    const candle = {datetime:row.datetime||"",open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close)};
    if (![candle.open,candle.high,candle.low,candle.close].every(Number.isFinite)) continue;
    if (candle.high < Math.max(candle.open,candle.close) || candle.low > Math.min(candle.open,candle.close) || candle.high < candle.low) continue;
    if (candle.datetime && seen.has(candle.datetime)) continue;
    if (candle.datetime) seen.add(candle.datetime);
    clean.push(candle);
  }
  // Never calculate a signal from a candle that may not have closed yet.
  if (clean.length) clean.pop();
  return clean;
}

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

    candles = normalizeClosedCandles(data.values);
    if (candles.length < 30) {
      throw new Error("Not enough valid completed candles. No signal will be produced until sufficient closed data is available.");
    }

    setStatus("Market Data Connected");

    setText("priceDescription", "Last completed Twelve Data candle · " + (candles[candles.length - 1]?.datetime || "timestamp unavailable"));

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
    const c = data[i], p = data[i - 1];
    ranges.push(Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close)));
  }
  let atr = ranges.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for(let i=period;i<ranges.length;i++) atr=((atr*(period-1))+ranges[i])/period;
  return atr;
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

  if (averageLoss === 0 && averageGain === 0) {
    return 50;
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
  const swings=findSwingPoints(data,2), highs=swings.highs, lows=swings.lows;
  if(highs.length<2||lows.length<2)return{trend:"UNCLEAR",structure:"UNCLEAR",bos:"NOT CONFIRMED",choch:"NOT CONFIRMED",highs,lows};
  const ph=highs[highs.length-2],lh=highs[highs.length-1],pl=lows[lows.length-2],ll=lows[lows.length-1];
  const hh=lh.price>ph.price,hl=ll.price>pl.price,lhLower=lh.price<ph.price,llLower=ll.price<pl.price;
  let trend="RANGING",structure="MIXED STRUCTURE";
  if(hh&&hl){trend="BULLISH";structure="HH / HL";}else if(lhLower&&llLower){trend="BEARISH";structure="LH / LL";}
  const last=data[data.length-1],bullishBreak=last.close>lh.price,bearishBreak=last.close<ll.price;
  const bos=bullishBreak?"BULLISH":bearishBreak?"BEARISH":"NOT CONFIRMED";
  let choch="NOT CONFIRMED";
  if(bullishBreak&&trend==="BEARISH")choch="POSSIBLE BULLISH SHIFT";
  if(bearishBreak&&trend==="BULLISH")choch="POSSIBLE BEARISH SHIFT";
  return{trend,structure,bos,choch,highs,lows};
}

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

// Structural stop helper shared by live analysis and historical tests.
// Use the latest confirmed swing with an ATR buffer when its distance is
// reasonable; otherwise fall back to a volatility-based stop.
function calculateStructuralStop(data, side, entry, atr, structure) {
  if (!Number.isFinite(entry) || !Number.isFinite(atr) || atr <= 0) return null;
  const swings = structure || analyzeStructure(data);
  const candidates = side === "BUY" ? swings.lows : swings.highs;
  const latestSwing = candidates && candidates.length ? candidates[candidates.length - 1].price : null;
  const buffer = atr * 0.15;
  const structural = Number.isFinite(latestSwing)
    ? (side === "BUY" ? latestSwing - buffer : latestSwing + buffer)
    : null;
  const structuralRisk = Number.isFinite(structural)
    ? (side === "BUY" ? entry - structural : structural - entry)
    : NaN;
  // Reject stops that are too tight or too wide relative to current volatility.
  if (Number.isFinite(structuralRisk) && structuralRisk >= atr * 1.0 && structuralRisk <= atr * 2.5) {
    return structural;
  }
  return side === "BUY" ? entry - atr * 1.5 : entry + atr * 1.5;
}

// ==========================================
// MAIN ANALYSIS
// ==========================================

function analyzeMarket() {
  if(candles.length<30){resetAnalysis();return;}
  const closes=candles.map(c=>c.close),last=candles[candles.length-1];
  const e9=calculateEMA(closes,9),e21=calculateEMA(closes,21),ema9=e9[e9.length-1],ema21=e21[e21.length-1];
  const rsi=calculateRSI(closes,14),atr=calculateATR(candles,14),structure=analyzeStructure(candles);
  const recent=candles.slice(-21,-1),support=Math.min(...recent.map(c=>c.low)),resistance=Math.max(...recent.map(c=>c.high));
  const emaAligned=(ema9>ema21&&structure.trend==="BULLISH")||(ema9<ema21&&structure.trend==="BEARISH");
  const trendConfirmed=emaAligned&&(structure.trend==="BULLISH"||structure.trend==="BEARISH"),priceAboveFastEma=last.close>ema9;
  setText("marketPrice",formatPrice(last.close));setText("trend",structure.trend);
  setColor("trend",structure.trend==="BULLISH"?"#00e6a0":structure.trend==="BEARISH"?"#ff5364":"#f5c451");
  setText("structure",structure.structure);setText("rsi",rsi===null?"--":rsi.toFixed(2));
  setText("ema9",formatPrice(ema9));setText("ema21",formatPrice(ema21));setText("rsiIndicator",rsi===null?"--":rsi.toFixed(2));setText("atrValue",atr===null?"--":formatPrice(atr));
  setText("trendConfirmation",trendConfirmed?"ALIGNED":"NOT ALIGNED");setText("bos",structure.bos);setText("choch",structure.choch);
  setText("liquidity",analyzeLiquidity(candles,structure));setText("fairValueGap",detectFairValueGap(candles));
  setText("supplyDemand",detectPotentialOrderBlock(candles,structure));setText("support",formatPrice(support));setText("resistance",formatPrice(resistance));
  evaluateSetup({last,ema9,ema21,rsi,trend:structure.trend,bos:structure.bos,trendConfirmed,emaAligned,priceAboveFastEma,atr,structure});
}


// ==========================================
// TRADE SETUP EVALUATION
// ==========================================

function evaluateSetup(d) {
  const {last,ema9,ema21,rsi,trend,bos,trendConfirmed,emaAligned,priceAboveFastEma,atr,structure}=d;
  const isGold=selectedMarket==="XAUUSD",range=last.high-last.low;
  const volatilityUsable=Number.isFinite(atr)&&atr>0&&range<=atr*(isGold?2.8:2.5);
  const bullishRsi=rsi!==null&&rsi>=52&&rsi<=68,bearishRsi=rsi!==null&&rsi>=32&&rsi<=48;
  const checks=[
    {label:"Directional structure",pass:trend==="BULLISH"||trend==="BEARISH",detail:trend},
    {label:"EMA 9/21 alignment",pass:emaAligned,detail:ema9>ema21?"EMA 9 above EMA 21":"EMA 9 below EMA 21"},
    {label:"Price vs EMA 9",pass:trend==="BULLISH"?priceAboveFastEma:trend==="BEARISH"?!priceAboveFastEma:false,detail:priceAboveFastEma?"Above EMA 9":"Below EMA 9"},
    {label:"RSI momentum",pass:trend==="BULLISH"?bullishRsi:trend==="BEARISH"?bearishRsi:false,detail:rsi===null?"Unavailable":rsi.toFixed(2)},
    {label:"Break of structure",pass:bos===trend&&(trend==="BULLISH"||trend==="BEARISH"),detail:bos},
    {label:"ATR volatility filter",pass:volatilityUsable,detail:volatilityUsable?"Within filter":"Wide candle / ATR unavailable"}
  ];
  const score=checks.filter(x=>x.pass).length;
  let decision="WAIT",explanation="Conditions are mixed. Wait for stronger confirmation; no trade candidate is active.";
  if(trendConfirmed&&bos==="BULLISH"&&trend==="BULLISH"&&score>=5&&bullishRsi&&priceAboveFastEma&&ema9>ema21&&volatilityUsable){
    decision="BUY CANDIDATE";explanation="Bullish structure, EMA alignment, price position, RSI and a bullish candle close beyond the latest confirmed swing meet the rule filters. Wait for a retest and check spread, news and risk.";
  }else if(trendConfirmed&&bos==="BEARISH"&&trend==="BEARISH"&&score>=5&&bearishRsi&&!priceAboveFastEma&&ema9<ema21&&volatilityUsable){
    decision="SELL CANDIDATE";explanation="Bearish structure, EMA alignment, price position, RSI and a bearish candle close beyond the latest confirmed swing meet the rule filters. Wait for a retest and check spread, news and risk.";
  }
  const badge=getElement("signal");
  if(badge){badge.textContent=decision;badge.className="signal-badge "+(decision==="BUY CANDIDATE"?"buy":decision==="SELL CANDIDATE"?"sell":"wait");}
  setText("signalExplanation",explanation);setText("analysisScore",score+" / 6 confluence checks");
  setText("analysisReasons",checks.map(x=>(x.pass?"✓ ":"• ")+x.label+": "+x.detail).join(" · "));
  if(decision==="BUY CANDIDATE"){const sl=calculateStructuralStop(candles,"BUY",last.close,atr,structure);setText("entry",formatPrice(last.close));setText("stopLoss",formatPrice(sl));setText("takeProfit",formatPrice(last.close+(last.close-sl)*2));}
  else if(decision==="SELL CANDIDATE"){const sl=calculateStructuralStop(candles,"SELL",last.close,atr,structure);setText("entry",formatPrice(last.close));setText("stopLoss",formatPrice(sl));setText("takeProfit",formatPrice(last.close-(sl-last.close)*2));}
  else{setText("entry","--");setText("stopLoss","--");setText("takeProfit","--");}
}

function resetAnalysis() {
  setText("marketPrice", "--");
  setText("analysisScore", "--");
  setText("analysisReasons", "Analysis details will appear when valid candles load.");
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


/* PIPORA FX: top-down scalping confirmation using completed candles only.
   4H is a guardrail, 1H sets directional bias, 15M checks setup context,
   and 5M must show a directional BOS plus a matching liquidity sweep. */
async function fetchTimeframeAnalysis(interval, market){
  const q=new URLSearchParams({market,interval});
  const response=await fetch("/api/price?"+q.toString());
  const payload=await response.json();
  if(!response.ok||!Array.isArray(payload.values))throw new Error(payload.error||"Data unavailable");
  const data=normalizeClosedCandles(payload.values);
  if(data.length<30)throw new Error("Not enough completed "+interval+" candles");
  const structure=analyzeStructure(data),closes=data.map(c=>c.close);
  const fast=calculateEMA(closes,9).at(-1),slow=calculateEMA(closes,21).at(-1);
  const emaBias=fast>slow?"BULLISH":fast<slow?"BEARISH":"NEUTRAL";
  const bias=structure.trend===emaBias?emaBias:"MIXED";
  return{bias,trend:structure.trend,structure:structure.structure,emaBias,bos:structure.bos,liquidity:analyzeLiquidity(data,structure),fvg:detectFairValueGap(data)};
}
async function runMtfScan(){
  const button=getElement("runMtfScan"),scanMarket=selectedMarket;
  if(button){button.disabled=true;button.textContent="Scanning…";}
  setText("mtfVerdict","SCANNING");
  setText("mtfExplanation","Checking 4H guardrail, 1H direction, 15M setup and 5M entry trigger for "+scanMarket+" using completed candles…");
  const frames=[["4h","mtf4h"],["1h","mtf1h"],["15min","mtf15m"],["5min","mtf5m"]],results={};
  try{
    for(const[tf,id]of frames){
      const a=await fetchTimeframeAnalysis(tf,scanMarket);
      if(scanMarket!==selectedMarket)throw new Error("Market changed during scan. Run the scan again for the selected instrument.");
      results[tf]=a;
      setText(id,a.bias);
      setText(id+"Note",a.structure+" · EMA "+a.emaBias);
    }
    const h4=results["4h"],h1=results["1h"],m15=results["15min"],m5=results["5min"];
    const direction=h1.bias;
    const opposite=direction==="BULLISH"?"BEARISH":"BULLISH";
    const fourHourAllows=direction!=="MIXED"&&h4.bias!==opposite;
    const fifteenAgrees=m15.bias===direction;
    const fiveAgrees=m5.bias===direction;
    const expectedSweep=direction==="BULLISH"?"Possible sell-side liquidity sweep":"Possible buy-side liquidity sweep";
    const sweepConfirmed=m5.liquidity===expectedSweep;
    const bosConfirmed=m5.bos===direction;
    let verdict="WAIT",explanation="No complete setup. Wait for 1H direction, 15M agreement and a confirmed 5M trigger; never force a trade.";
    if(direction==="MIXED"){
      explanation="1H direction is mixed or unclear. Stand aside until a cleaner intraday bias forms.";
    }else if(!fourHourAllows){
      explanation="The 4H context conflicts with the 1H direction. Treat this as a countertrend condition and WAIT.";
    }else if(!fifteenAgrees){
      explanation="1H bias is "+direction+", but 15M has not aligned. Wait for the setup timeframe to agree.";
    }else if(!fiveAgrees){
      explanation="1H and 15M agree "+direction+", but 5M has not confirmed entry direction. Wait.";
    }else if(!bosConfirmed||!sweepConfirmed){
      explanation="Direction aligns, but the 5M ICT-inspired trigger is incomplete. Need a "+(direction==="BULLISH"?"bullish":"bearish")+" BOS and matching liquidity sweep; no entry yet.";
    }else{
      verdict=direction+" SETUP · CONFIRM RISK";
      explanation="4H does not oppose the 1H "+direction+" bias; 15M agrees; 5M shows matching BOS and a possible "+(direction==="BULLISH"?"sell-side":"buy-side")+" liquidity sweep. This is a setup watch, not an automatic entry. Check spread, news, stop distance and risk before any decision.";
    }
    setText("mtfVerdict",verdict);
    setText("mtfExplanation",explanation);
    setText("mtfUpdated","Last scan: "+new Date().toLocaleString("en-NG",{timeZone:"Africa/Lagos"})+" · 5M BOS: "+m5.bos+" · 5M liquidity: "+m5.liquidity);
  }catch(error){
    setText("mtfVerdict","SCAN INCOMPLETE");
    setText("mtfExplanation",error.message+" No directional conclusion is available.");
    frames.forEach(([,id])=>{setText(id,"--");setText(id+"Note","Data unavailable");});
  }finally{
    if(button){button.disabled=false;button.textContent="Run "+selectedMarket+" scan";}
  }
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
  for (const market of Object.keys(MARKETS)) {
    const node=getElement("tilePrice"+market);
    if(!node) continue;
    try {
      const q=new URLSearchParams({market,interval:"15min"});
      const response=await fetch("/api/price?"+q.toString());
      const data=await response.json();
      if(!response.ok||!Array.isArray(data.values)||data.values.length<2) throw new Error(data.error||"Price unavailable");
      // Provider is newest-first: index 1 is the most recent completed 15-minute candle.
      const price=Number(data.values[1].close);
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


/* PIPORA historical backtest: closed-bar signals, no overlapping positions. */
function piporaBacktestSignal(data, i) {
  const s=data.slice(0,i+1), closes=s.map(c=>c.close), fast=calculateEMA(closes,9).at(-1), slow=calculateEMA(closes,21).at(-1), rsi=calculateRSI(closes,14), atr=calculateATR(s,14), structure=analyzeStructure(s), price=closes.at(-1);
  if(![fast,slow,rsi,atr].every(Number.isFinite)||atr<=0)return null;
  if(structure.trend==="BULLISH"&&fast>slow&&price>fast&&rsi>=52&&rsi<=68&&structure.bos==="BULLISH")return{side:"BUY",entry:price,stop:calculateStructuralStop(s,"BUY",price,atr,structure)};
  if(structure.trend==="BEARISH"&&fast<slow&&price<fast&&rsi>=32&&rsi<=48&&structure.bos==="BEARISH")return{side:"SELL",entry:price,stop:calculateStructuralStop(s,"SELL",price,atr,structure)};
  return null;
}
function piporaRunBacktest(data){
  // A signal is known only after candle i closes. Simulate entry at the NEXT
  // candle open, not at the signal candle close, to avoid an impossible fill.
  const trades=[];let i=34;
  while(i<data.length-1){
    const setup=piporaBacktestSignal(data,i);
    if(!setup){i++;continue;}
    const entryIndex=i+1;
    const entry=data[entryIndex].open;
    const risk=Math.abs(setup.entry-setup.stop);
    if(!Number.isFinite(entry)||!Number.isFinite(risk)||risk<=0){i++;continue;}
    const stop=setup.side==="BUY"?entry-risk:entry+risk;
    const target=setup.side==="BUY"?entry+2*risk:entry-2*risk;
    const last=Math.min(entryIndex+19,data.length-1);
    let r=null,exitAt=last,outcome="TIME EXIT";
    for(let k=entryIndex;k<=last;k++){
      const x=data[k];
      const stopHit=setup.side==="BUY"?x.low<=stop:x.high>=stop;
      const targetHit=setup.side==="BUY"?x.high>=target:x.low<=target;
      // Conservative assumption if both levels are touched within one bar.
      if(stopHit){r=-1;exitAt=k;outcome="LOSS";break;}
      if(targetHit){r=2;exitAt=k;outcome="WIN";break;}
    }
    if(r===null){
      const move=setup.side==="BUY"?data[last].close-entry:entry-data[last].close;
      r=Math.max(-1,Math.min(2,move/risk));
    }
    trades.push({r,outcome});i=exitAt+1;
  }
  let eq=0,peak=0,dd=0;
  for(const t of trades){eq+=t.r;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);}
  const wins=trades.filter(t=>t.r>0).length;
  const losses=trades.filter(t=>t.r<0).length;
  const breakeven=trades.filter(t=>Math.abs(t.r)<1e-9).length;
  const grossProfit=trades.filter(t=>t.r>0).reduce((a,t)=>a+t.r,0);
  const grossLoss=Math.abs(trades.filter(t=>t.r<0).reduce((a,t)=>a+t.r,0));
  const net=trades.reduce((a,t)=>a+t.r,0);
  const profitFactor=grossLoss>0?grossProfit/grossLoss:(grossProfit>0?Infinity:0);
  return{count:trades.length,wins,losses,breakeven,grossProfit,grossLoss,profitFactor,winRate:trades.length?100*wins/trades.length:0,net,dd,avg:trades.length?net/trades.length:0,time:trades.filter(t=>t.outcome==="TIME EXIT").length};
}
function installPiporaBacktest(){
  const scanner=getElement("scanner");if(!scanner||getElement("piporaBacktest"))return;
  const box=document.createElement("section");box.id="piporaBacktest";box.className="scanner-card backtest-card";
  box.innerHTML='<div class="section-heading"><h2>Historical Strategy Backtest</h2><span>Recent closed-candle test</span></div><p>Tests the selected market and timeframe using EMA 9/21, RSI, structure and BOS. Risk model: confirmed swing stop with 0.15 ATR buffer when swing distance is 1.0–2.5 ATR; otherwise 1.5 ATR fallback. Target: 2R; maximum 20 candles per trade. If stop and target are both touched in one candle, stop is counted first.</p><div class="button-row"><button id="runBacktest" class="primary-button" type="button">Run historical backtest</button><button id="compareBacktest" class="secondary-button" type="button">Compare Gold vs GBPJPY</button></div><div id="compareStatus" class="news-result" aria-live="polite">Compare both markets on the selected timeframe.</div><div class="analysis-details"><div><span>Gold · Net / PF / trades</span><strong id="compareGold">--</strong></div><div><span>GBPJPY · Net / PF / trades</span><strong id="compareGbpjpy">--</strong></div><div><span>Comparison</span><strong id="compareWinner">--</strong></div></div><div id="backtestStatus" class="news-result" aria-live="polite">Choose a market and timeframe, then run the test.</div><div class="backtest-stats"><div><small>TRADES</small><strong id="btTrades">--</strong></div><div><small>WIN RATE</small><strong id="btWinRate">--</strong></div><div><small>NET RESULT</small><strong id="btNetR">--</strong></div><div><small>MAX DRAWDOWN</small><strong id="btDrawdown">--</strong></div></div><div class="analysis-details"><div><span>Wins / losses / breakeven</span><strong id="btWinsLosses">--</strong></div><div><span>Profit factor</span><strong id="btProfitFactor">--</strong></div><div><span>Average R / trade</span><strong id="btAverageR">--</strong></div><div><span>Gross profit / loss</span><strong id="btGross">--</strong></div><div><span>Sample</span><strong id="btSample">--</strong></div></div><p class="card-description">Uses up to 100 recent provider candles. Spread, commission, slippage and broker execution are excluded. A small sample cannot establish a reliable edge; this is research, not a trading instruction.</p>';
  scanner.appendChild(box);
  getElement("compareBacktest").addEventListener("click",async()=>{
    const button=getElement("compareBacktest"),status=getElement("compareStatus"),timeframe=selectedTimeframe;
    button.disabled=true;button.textContent="Comparing…";status.className="news-result";status.textContent="Testing Gold and GBPJPY on "+timeframe+" completed candles…";
    setText("compareGold","Loading…");setText("compareGbpjpy","Loading…");setText("compareWinner","--");
    const results={};
    try{
      for(const market of ["XAUUSD","GBPJPY"]){
        const q=new URLSearchParams({market,interval:timeframe}),response=await fetch("/api/price?"+q.toString()),payload=await response.json();
        if(!response.ok||!Array.isArray(payload.values))throw new Error(market+": "+(payload.error||"historical candles unavailable"));
        const data=normalizeClosedCandles(payload.values);
        if(data.length<50)throw new Error(market+": need 50 completed candles; received "+data.length);
        results[market]={stats:piporaRunBacktest(data),count:data.length};
        const r=results[market].stats,pf=Number.isFinite(r.profitFactor)?r.profitFactor.toFixed(2):(r.grossProfit>0?"∞":"--");
        setText(market==="XAUUSD"?"compareGold":"compareGbpjpy",(r.net>=0?"+":"")+r.net.toFixed(2)+"R / PF "+pf+" / "+r.count+" trades");
      }
      const a=results.XAUUSD.stats,b=results.GBPJPY.stats;
      // Compare net R first; profit factor is a secondary descriptor, not a ranking guarantee.
      const winner=a.net>b.net?"Gold leads this sample":b.net>a.net?"GBPJPY leads this sample":"Both markets tie on net R";
      setText("compareWinner",winner);
      status.textContent="Same timeframe and rule set; "+winner.toLowerCase()+". Compare trade counts and drawdown too. This small recent sample is not proof of an edge.";
    }catch(error){
      status.className="news-result danger";status.textContent=error.message+" Comparison incomplete; no winner declared.";
      setText("compareWinner","Incomplete · no conclusion");
    }finally{button.disabled=false;button.textContent="Compare Gold vs GBPJPY";}
  });
  getElement("runBacktest").addEventListener("click",async()=>{
    const b=getElement("runBacktest"),out=getElement("backtestStatus");b.disabled=true;b.textContent="Testing…";out.className="news-result";out.textContent="Loading historical candles…";
    try{
      const q=new URLSearchParams({market:selectedMarket,interval:selectedTimeframe}),res=await fetch("/api/price?"+q),payload=await res.json();
      if(!res.ok||!Array.isArray(payload.values))throw new Error(payload.error||"Historical candles unavailable.");
      const data=normalizeClosedCandles(payload.values);
      if(data.length<50)throw new Error("Need at least 50 valid completed candles; received "+data.length+".");
      const r=piporaRunBacktest(data);
      setText("btTrades",r.count);setText("btWinRate",r.winRate.toFixed(1)+"%");setText("btNetR",(r.net>=0?"+":"")+r.net.toFixed(2)+"R");setText("btDrawdown",r.dd.toFixed(2)+"R");setText("btWinsLosses",r.wins+" / "+r.losses+" / "+r.breakeven);setText("btProfitFactor",r.count?(Number.isFinite(r.profitFactor)?r.profitFactor.toFixed(2):"∞ · no losses"):"--");setText("btGross","+"+r.grossProfit.toFixed(2)+"R / -"+r.grossLoss.toFixed(2)+"R");setText("btAverageR",(r.avg>=0?"+":"")+r.avg.toFixed(2)+"R");setText("btSample",data.length+" candles · "+selectedMarket+" · "+selectedTimeframe);
      out.textContent=r.count?r.count+" non-overlapping setups tested: "+r.wins+" profitable, "+r.losses+" losing, "+r.time+" time exits. Historical results do not predict future performance.":"No setups met all rules in this sample. Do not loosen rules just to force signals.";
    }catch(e){out.className="news-result danger";out.textContent=e.message+" No conclusion available.";}
    finally{b.disabled=false;b.textContent="Run historical backtest";}
  });
}
document.addEventListener("DOMContentLoaded",installPiporaBacktest);


/* PIPORA Academy: interactive knowledge checks and local progress */
(function installAcademyQuizzes(){
  const quizzes=[
    {title:"Market Structure",questions:[
      {q:"Which sequence describes a typical uptrend?",a:["HH and HL","LH and LL","Only equal highs"],correct:0,why:"Higher highs and higher lows show rising swing points."},
      {q:"What is a lower high?",a:["A high above the last high","A rally that fails below the previous swing high","A new lower low"],correct:1,why:"A lower high forms when the next swing high stays below the previous one."},
      {q:"If the swing sequence is unclear, what should you do?",a:["Force a BUY or SELL","Use the smallest candle","Mark it uncertain and wait"],correct:2,why:"Not every market is trending. It is fine to wait for clearer structure."}]},
    {title:"Support & Resistance",questions:[
      {q:"Support is best described as…",a:["An area where falling price has previously found buying interest","A guaranteed floor","Any round number"],correct:0,why:"Support is an area where price has previously slowed or bounced; it can still break."},
      {q:"How should you draw a key level?",a:["As a precise guaranteed line","Around clear swing reactions as a zone","On every candle"],correct:1,why:"Price often reacts within an area rather than at one exact price."},
      {q:"What can old resistance become after a decisive break?",a:["Always resistance","A support area on a retest","A guaranteed entry"],correct:1,why:"This possible role reversal is worth watching, but it is not guaranteed."}]},
    {title:"Break of Structure",questions:[
      {q:"A bullish BOS usually involves price…",a:["Breaking below a relevant swing low","Breaking above a relevant swing high","Touching an EMA"],correct:1,why:"A bullish BOS is a break above a relevant previous swing high."},
      {q:"CHOCH is commonly treated as…",a:["An early warning of a possible change in behaviour","Proof a new trend has started","A type of moving average"],correct:0,why:"It can warn of a change, but needs follow-through and context."},
      {q:"What is stronger breakout evidence than a wick alone?",a:["A candle close beyond the level and follow-through","A random price spike","A coloured indicator"],correct:0,why:"A close and subsequent behaviour help assess whether price accepted beyond the level."}]},
    {title:"Liquidity",questions:[
      {q:"Buy-side liquidity is commonly watched around…",a:["Obvious highs","Only the middle of a range","Every moving average"],correct:0,why:"Buy stops may gather around obvious highs, though the full order book is not visible."},
      {q:"A liquidity sweep example is when price…",a:["Never reaches a level","Trades beyond a watched high or low then returns inside","Moves sideways"],correct:1,why:"A sweep trades beyond a watched level and then returns inside it."},
      {q:"Can a chart prove someone deliberately hunted your stop?",a:["Yes, always","No; the chart shows price behaviour, not intent","Only on Gold"],correct:1,why:"Avoid assuming intent. Focus on observable price action and manage risk."}]}
  ];
  const root=document.querySelector("#academy .academy-grid");
  if(!root)return;
  const key="piporaAcademyQuizV1";
  let progress={};try{progress=JSON.parse(localStorage.getItem(key)||"{}")||{};}catch(e){}
  const cards=root.querySelectorAll(".academy-lesson");
  quizzes.forEach((quiz,index)=>{
    const card=cards[index];if(!card)return;
    const box=document.createElement("section");box.className="academy-quiz";
    box.innerHTML='<h4>Quick knowledge check</h4><p class="academy-quiz-intro">Answer all three questions to check your understanding.</p><div class="academy-quiz-questions"></div><button class="primary-button academy-quiz-submit" type="button">Check my answers</button><p class="academy-quiz-result" aria-live="polite"></p>';
    const list=box.querySelector(".academy-quiz-questions");
    quiz.questions.forEach((item,qi)=>{
      const field=document.createElement("fieldset");field.className="academy-question";
      const legend=document.createElement("legend");legend.textContent=(qi+1)+". "+item.q;field.appendChild(legend);
      item.a.forEach((answer,ai)=>{
        const label=document.createElement("label"),input=document.createElement("input");
        input.type="radio";input.name="pipora-quiz-"+index+"-"+qi;input.value=String(ai);
        label.append(input,document.createTextNode(" "+answer));field.appendChild(label);
      });
      list.appendChild(field);
    });
    const result=box.querySelector(".academy-quiz-result");
    if(progress[index])result.textContent="Previous best: "+progress[index].score+"/3 correct.";
    box.querySelector("button").addEventListener("click",()=>{
      let score=0,answered=0;const explanations=[];
      quiz.questions.forEach((item,qi)=>{
        const selected=box.querySelector('input[name="pipora-quiz-'+index+'-'+qi+'"]:checked');
        if(selected){answered++;if(Number(selected.value)===item.correct)score++;explanations.push((qi+1)+". "+item.why);}
      });
      if(answered!==quiz.questions.length){result.textContent="Please answer all three questions first.";return;}
      const previous=progress[index]?.score||0;
      progress[index]={score:Math.max(score,previous),latest:score,completed:score===3||Boolean(progress[index]?.completed)};
      try{localStorage.setItem(key,JSON.stringify(progress));}catch(e){}
      result.textContent="You scored "+score+"/3. "+(score===3?"Excellent — lesson check passed!":"Review the notes and try again.")+" "+explanations.join(" ");
    });
    card.querySelector(".academy-lesson-content").appendChild(box);
  });
  const summary=document.createElement("p");summary.className="academy-progress";
  const done=Object.values(progress).filter(x=>x.completed).length;
  summary.textContent="Quiz progress: "+done+" of 4 lessons passed (saved on this device).";
  root.parentElement.insertBefore(summary,root);
})();
