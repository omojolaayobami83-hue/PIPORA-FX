/* PIPORA FX — ICT-inspired scalping mentor
   4H / 1H = context · 15M = setup · 5M = entry confirmation.
   Uses completed candles only. Educational decision support, not execution. */
(() => {
  "use strict";
  const FRAMES = [
    ["4h","4H","context"],
    ["1h","1H","context"],
    ["15min","15M","setup"],
    ["5min","5M","entry"]
  ];
  const state = { running:false, lastMarket:null };
  const $ = id => document.getElementById(id);
  const fmt = (value, digits) => Number.isFinite(value)
    ? value.toLocaleString("en-US",{minimumFractionDigits:digits,maximumFractionDigits:digits}) : "—";
  const digitsFor = market => market === "XAUUSD" ? 2 : market.endsWith("JPY") ? 3 : 5;
  function addStyles(){
    if($("piporaMentorStyles")) return;
    const style=document.createElement("style");style.id="piporaMentorStyles";
    style.textContent=`
      .mentor-panel{margin:18px 0 24px;padding:18px;background:linear-gradient(145deg,#111b19,#101722);border:1px solid #31523f;border-radius:14px}
      .mentor-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
      .mentor-kicker{color:#35d6a0;font-size:10px;font-weight:800;letter-spacing:1.2px}
      .mentor-panel h2{font-size:19px;margin:7px 0}
      .mentor-sub{color:#9ba8b8;font-size:12px;line-height:1.6}
      .mentor-scan{padding:10px 14px;border:1px solid #35d6a0;border-radius:8px;background:#35d6a0;color:#07130e;font-weight:800}
      .mentor-scan:disabled{opacity:.55}
      .mentor-frames{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:16px 0}
      .mentor-frame{padding:13px;background:#0a1017;border:1px solid #27323f;border-radius:9px;min-width:0}
      .mentor-frame small,.mentor-frame span{display:block;color:#8e9aaa;font-size:10px}
      .mentor-frame strong{display:block;font-size:16px;margin:8px 0;overflow-wrap:anywhere}
      .mentor-frame em{font-style:normal;color:#9ba8b8;font-size:10px}
      .mentor-verdict{padding:15px;background:#0a1017;border:1px solid #27323f;border-radius:10px}
      .mentor-verdict[data-tone="buy"]{border-color:#258866}
      .mentor-verdict[data-tone="sell"]{border-color:#a34352}
      .mentor-verdict[data-tone="wait"]{border-color:#78653b}
      .mentor-verdict small{color:#9ba8b8;font-size:10px;letter-spacing:1px}
      .mentor-verdict strong{display:block;font-size:21px;margin:7px 0}
      .mentor-verdict p,.mentor-list{font-size:12px;line-height:1.7;color:#b5c0cc}
      .mentor-list{margin:10px 0 0;padding-left:18px}
      .mentor-levels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}
      .mentor-levels div{padding:11px;background:#0a1017;border:1px solid #27323f;border-radius:8px;min-width:0}
      .mentor-levels small,.mentor-levels b{display:block}
      .mentor-levels small{font-size:10px;color:#8e9aaa}
      .mentor-levels b{font-size:13px;margin-top:6px;overflow-wrap:anywhere}
      .mentor-foot{font-size:10px;color:#8995a5;line-height:1.6;margin-top:12px}
      @media(max-width:700px){.mentor-frames{grid-template-columns:repeat(2,minmax(0,1fr))}.mentor-levels{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }
  function mount(){
    const marketPage=$("market"), chart=marketPage?.querySelector(".chart-section");
    if(!chart||$("piporaScalpingMentor"))return;
    addStyles();
    const panel=document.createElement("section");panel.id="piporaScalpingMentor";panel.className="mentor-panel";
    panel.innerHTML=`
      <div class="mentor-top"><div><span class="mentor-kicker">PIPORA FX · ICT-INSPIRED SCALPING MENTOR</span><h2>Top-down setup → 5M entry</h2><p class="mentor-sub">4H and 1H give context · 15M frames the setup · 5M must confirm the entry.</p></div><button id="mentorRun" class="mentor-scan" type="button">Scan this market</button></div>
      <div class="mentor-frames">
        <div class="mentor-frame"><small>4H · BIG PICTURE</small><strong id="mentor4h">WAITING</strong><span id="mentor4hNote">Market context</span></div>
        <div class="mentor-frame"><small>1H · STRUCTURE</small><strong id="mentor1h">WAITING</strong><span id="mentor1hNote">Intraday context</span></div>
        <div class="mentor-frame"><small>15M · SETUP</small><strong id="mentor15min">WAITING</strong><span id="mentor15minNote">Premium / discount</span></div>
        <div class="mentor-frame"><small>5M · ENTRY</small><strong id="mentor5min">WAITING</strong><span id="mentor5minNote">Sweep + MSS + FVG</span></div>
      </div>
      <div id="mentorVerdict" class="mentor-verdict" data-tone="wait"><small>SCALPING MENTOR DECISION</small><strong id="mentorDecision">WAIT FOR DATA</strong><p id="mentorExplanation">PIPORA will inspect completed candles and explain which ICT-style conditions are present.</p><ul id="mentorReasons" class="mentor-list"><li>No setup has been assessed yet.</li></ul></div>
      <div class="mentor-levels"><div><small>Potential entry zone</small><b id="mentorEntry">—</b></div><div><small>Invalidation / stop reference</small><b id="mentorStop">—</b></div><div><small>Illustrative 2R target</small><b id="mentorTarget">—</b></div></div>
      <p id="mentorUpdated" class="mentor-foot">Uses closed provider candles only. A setup label is not an instruction to place a trade.</p>
    `;
    chart.parentNode.insertBefore(panel,chart);
    $("mentorRun").addEventListener("click",scan);
  }
  async function getCandles(market,interval){
    const query=new URLSearchParams({market,interval});
    const response=await fetch("/api/price?"+query.toString(),{cache:"no-store"});
    const payload=await response.json();
    if(!response.ok||!Array.isArray(payload.values))throw new Error(payload.error||"Market data unavailable");
    const ordered=payload.values.slice().reverse(),clean=[],seen=new Set();
    for(const row of ordered){
      const c={time:row.datetime||"",open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close)};
      if(![c.open,c.high,c.low,c.close].every(Number.isFinite)||c.high<c.low||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close))continue;
      if(c.time&&seen.has(c.time))continue;if(c.time)seen.add(c.time);clean.push(c);
    }
    if(clean.length)clean.pop(); // exclude the provider's newest possibly-forming candle
    if(clean.length<35)throw new Error("Not enough completed "+interval+" candles.");
    return clean;
  }
  function swings(data){
    const highs=[],lows=[];
    for(let i=2;i<data.length-2;i++){
      let hi=true,lo=true;
      for(let j=1;j<=2;j++){if(data[i].high<=data[i-j].high||data[i].high<=data[i+j].high)hi=false;if(data[i].low>=data[i-j].low||data[i].low>=data[i+j].low)lo=false;}
      if(hi)highs.push({i,p:data[i].high});if(lo)lows.push({i,p:data[i].low});
    }
    return{highs,lows};
  }
  function bias(data){
    const s=swings(data),h=s.highs,l=s.lows;
    if(h.length<2||l.length<2)return"UNCLEAR";
    const up=h.at(-1).p>h.at(-2).p&&l.at(-1).p>l.at(-2).p;
    const down=h.at(-1).p<h.at(-2).p&&l.at(-1).p<l.at(-2).p;
    return up?"BULLISH":down?"BEARISH":"RANGING";
  }
  function atr(data){
    const rows=data.slice(-15);if(rows.length<3)return null;let sum=0;
    for(let i=1;i<rows.length;i++)sum+=Math.max(rows[i].high-rows[i].low,Math.abs(rows[i].high-rows[i-1].close),Math.abs(rows[i].low-rows[i-1].close));
    return sum/(rows.length-1);
  }
  function findSweep(data){
    const end=data.length-1,from=Math.max(10,end-5);
    for(let i=end;i>=from;i--){
      const c=data[i],prior=data.slice(Math.max(0,i-10),i);
      const high=Math.max(...prior.map(x=>x.high)),low=Math.min(...prior.map(x=>x.low));
      if(c.high>high&&c.close<high)return{side:"SELL",level:high,extreme:c.high,index:i,description:"Buy-side liquidity swept; candle closed back below prior highs."};
      if(c.low<low&&c.close>low)return{side:"BUY",level:low,extreme:c.low,index:i,description:"Sell-side liquidity swept; candle closed back above prior lows."};
    }
    return null;
  }
  function findMss(data,sweep){
    if(!sweep)return null;
    const section=data.slice(0,sweep.index+1),p=swings(section),last=data.at(-1);
    if(sweep.side==="BUY"){
      const pivot=p.highs.filter(x=>x.i<sweep.index).at(-1);
      return pivot&&last.close>pivot.p?{side:"BUY",level:pivot.p}:null;
    }
    const pivot=p.lows.filter(x=>x.i<sweep.index).at(-1);
    return pivot&&last.close<pivot.p?{side:"SELL",level:pivot.p}:null;
  }
  function findFvg(data,side){
    for(let i=data.length-1;i>=Math.max(2,data.length-12);i--){
      if(side==="BUY"&&data[i].low>data[i-2].high)return{low:data[i-2].high,high:data[i].low};
      if(side==="SELL"&&data[i].high<data[i-2].low)return{low:data[i].high,high:data[i-2].low};
    }
    return null;
  }
  function renderFrame(key,value,note){
    const el=$("mentor"+key);if(el)el.textContent=value;
    const sub=$("mentor"+key+"Note");if(sub)sub.textContent=note;
  }
  async function scan(){
    if(state.running)return;
    const market=window.selectedMarket||"XAUUSD",button=$("mentorRun");
    state.running=true;if(button){button.disabled=true;button.textContent="Scanning…";}
    $("mentorDecision").textContent="SCANNING";$("mentorExplanation").textContent="Loading 4H, 1H, 15M and 5M completed candles for "+market+".";
    $("mentorReasons").replaceChildren();["4h","1h","15min","5min"].forEach(tf=>renderFrame(tf,"LOADING","Checking closed candles"));
    ["mentorEntry","mentorStop","mentorTarget"].forEach(id=>$(id).textContent="—");
    try{
      const all={};
      for(const [interval,label] of FRAMES){
        all[interval]=await getCandles(market,interval);
        if(market!==(window.selectedMarket||"XAUUSD"))throw new Error("Market changed during scan. Run the scan again.");
        const b=bias(all[interval]);
        renderFrame(interval,b,interval==="5min"?"Entry confirmation":interval==="15min"?"Setup context":"Directional context");
      }
      const b4=bias(all["4h"]),b1=bias(all["1h"]),b15=bias(all["15min"]),d5=all["5min"],last=d5.at(-1),sweep=findSweep(d5);
      const mss=sweep?findMss(d5,sweep):null,fvg=sweep?findFvg(d5,sweep.side):null,range15=all["15min"].slice(-20);
      const hi=Math.max(...range15.map(c=>c.high)),lo=Math.min(...range15.map(c=>c.low)),mid=(hi+lo)/2;
      const zone=last.close>=mid?"PREMIUM":"DISCOUNT";
      const atr5=atr(d5),reasons=[];
      reasons.push("4H "+b4+" · 1H "+b1+" · 15M "+b15+".");
      reasons.push("15M price is in "+zone+" half of its recent 20-candle range.");
      reasons.push(sweep?sweep.description:"No recent 5M liquidity sweep confirmed.");
      reasons.push(mss?(mss.side+" 5M market-structure shift: close broke a prior confirmed swing.":"No 5M market-structure shift confirmed after a sweep."));
      reasons.push(fvg?(fvg.side?fvg.side+" FVG detected.":"5M fair value gap detected."):"No recent 5M FVG found in the scan window.");
      let decision="WAIT",tone="wait",explanation="The complete scalping sequence is not present. Wait for a clear liquidity event, a 5M structure shift and a usable imbalance; do not force a trade.";
      const side=sweep?.side;
      const higherOpposes=(side==="BUY"&&(b4==="BEARISH"||b1==="BEARISH"))||(side==="SELL"&&(b4==="BULLISH"||b1==="BULLISH"));
      const setupOpposes=(side==="BUY"&&b15==="BEARISH")||(side==="SELL"&&b15==="BULLISH");
      const correctHalf=(side==="BUY"?last.close<=mid:last.close>=mid);
      if(sweep&&mss&&fvg&&mss.side===side&&!higherOpposes&&!setupOpposes&&correctHalf){
        decision=side+" SETUP DEVELOPING";tone=side==="BUY"?"buy":"sell";
        explanation="ICT-inspired conditions are aligned on the completed 5M candles. This is a setup to monitor, not an automatic entry: wait for price to retrace into the FVG and confirm rejection on a newly closed 5M candle.";
        const entryLow=fvg.low,entryHigh=fvg.high,entry=(entryLow+entryHigh)/2;
        const stop=side==="BUY"?sweep.extreme-(atr5||0)*0.15:sweep.extreme+(atr5||0)*0.15;
        const risk=Math.abs(entry-stop),target=side==="BUY"?entry+2*risk:entry-2*risk;
        $("mentorEntry").textContent=fmt(entryLow,digitsFor(market))+" – "+fmt(entryHigh,digitsFor(market));
        $("mentorStop").textContent=fmt(stop,digitsFor(market));
        $("mentorTarget").textContent=fmt(target,digitsFor(market))+" (2R reference)";
      }else if(sweep&&mss&&fvg&&(higherOpposes||setupOpposes)){
        explanation="A 5M pattern appeared, but the higher-timeframe or 15M context conflicts. Treat it as a countertrend idea and stand aside until context improves.";
      }else if(sweep&&mss&&!fvg){
        explanation="A liquidity sweep and possible 5M structure shift are present, but no recent fair value gap was found. Wait for a clearer retracement area.";
      }
      if(sweep&&side==="BUY"&&!correctHalf)reasons.push("Caution: bullish idea is not in the 15M discount half.");
      if(sweep&&side==="SELL"&&!correctHalf)reasons.push("Caution: bearish idea is not in the 15M premium half.");
      $("mentorVerdict").dataset.tone=tone;$("mentorDecision").textContent=decision;$("mentorExplanation").textContent=explanation;
      const list=$("mentorReasons");reasons.forEach(reason=>{const li=document.createElement("li");li.textContent=reason;list.appendChild(li);});
      $("mentorUpdated").textContent="Scanned "+market+" · "+new Date().toLocaleString("en-NG",{timeZone:"Africa/Lagos"})+" · only completed candles used. Spread, news and broker execution still need checking.";
      state.lastMarket=market;
    }catch(error){
      $("mentorVerdict").dataset.tone="wait";$("mentorDecision").textContent="SCAN INCOMPLETE";$("mentorExplanation").textContent=error.message+" No setup decision is available.";
      const li=document.createElement("li");li.textContent="Data incomplete; no BUY or SELL setup can be assessed."; $("mentorReasons").replaceChildren(li);
      ["4h","1h","15min","5min"].forEach(tf=>renderFrame(tf,"—","Data unavailable"));
    }finally{state.running=false;if(button){button.disabled=false;button.textContent="Scan this market";}}
  }
  document.addEventListener("DOMContentLoaded",()=>{
    mount();
    document.querySelectorAll('[data-market]').forEach(button=>button.addEventListener("click",()=>setTimeout(()=>{if($("market")?.classList.contains("active"))scan();},500)));
    const observer=new MutationObserver(()=>{if($("market")?.classList.contains("active")&&state.lastMarket!==(window.selectedMarket||"XAUUSD")&&!state.running)scan();});
    const page=$("market");if(page)observer.observe(page,{attributes:true,attributeFilter:["class"]});
    setTimeout(()=>{if($("market")?.classList.contains("active"))scan();},1200);
  });
})();