const $=id=>document.getElementById(id);
let lastPrice=null,history=[];

function has(id){return !!$(id)}
function num(v){const n=typeof v==='number'?v:Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:null}
function fmt(v){const n=num(v);return n===null?'—':n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:3})}
function validLevel(v){const n=num(v);return n!==null&&n>0?n:null}

function switchView(v){
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active-view'));
  const target=$(v);if(target)target.classList.add('active-view');
  document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  const titles={risk:'Risk Calculator',analysis:'AI Analysis',chartview:'TradingView',signals:'Signals',settings:'Settings',dashboard:'Dashboard',pro:'Pro Lab'};
  if(has('viewTitle')) $('viewTitle').textContent=titles[v]||'Dashboard';
  if(v==='chartview')initTradingView();
}
window.switchView=switchView;

document.querySelectorAll('.nav').forEach(b=>{
  if(b.dataset.bound==='1')return;
  b.dataset.bound='1';
  b.addEventListener('click',e=>{
    if(b.tagName==='A')return;
    e.preventDefault();switchView(b.dataset.view);
  });
});

document.querySelectorAll('.tf').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.tf').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
  });
});

async function loadGold(){
  if(!has('price')||!has('marketState'))return null;
  try{
    const r=await fetch('https://api.gold-api.com/price/XAU',{cache:'no-store'});
    if(!r.ok)throw Error(`Market API error (${r.status})`);
    const d=await r.json();
    const p=num(d.price),ch=num(d.ch)||0,chp=num(d.chp)||0;
    if(p===null)throw Error('Invalid live gold price');
    $('price').textContent='$'+fmt(p);
    if(has('source'))$('source').textContent='Gold API / XAU';
    if(has('updated'))$('updated').textContent=new Date((num(d.timestamp)||Date.now()/1000)*1000).toLocaleTimeString();
    $('marketState').textContent='LIVE';$('marketState').style.color='#65dc91';
    if(has('dataBadge')){$('dataBadge').textContent='DATA: LIVE';$('dataBadge').className='badge live'}
    if(has('change')){$('change').textContent=(ch>=0?'+':'')+fmt(ch)+' ('+(chp>=0?'+':'')+fmt(chp)+'%)';$('change').className='change '+(ch>=0?'up':'down')}
    if(lastPrice!==null)history.push(p);else history=Array(25).fill(p);
    if(history.length>45)history.shift();lastPrice=p;drawChart();derive(p,d);return d;
  }catch(e){
    $('marketState').textContent='OFFLINE';$('marketState').style.color='#ff7676';
    if(has('dataBadge')){$('dataBadge').textContent='DATA: OFFLINE';$('dataBadge').className='badge muted'}
    if(has('source'))$('source').textContent='Unavailable';
    console.error('Gold feed error:',e);return null;
  }
}

function derive(p,d){
  if(!has('support'))return;
  const low=num(d.low_price)??p-5,high=num(d.high_price)??p+5,sup=Math.min(p-2,low-1),res=Math.max(p+2,high+1),bull=(num(d.ch)||0)>=0;
  $('support').textContent=fmt(sup);$('resistance').textContent=fmt(res);
  if(has('entry'))$('entry').textContent=fmt(p-1.5)+' – '+fmt(p+1.5);
  if(has('rr'))$('rr').textContent='AI required';
  if(has('bias')){$('bias').textContent=bull?'BULLISH':'BEARISH';$('bias').className='bias '+(bull?'bull':'bear')}
  if(has('trend'))$('trend').textContent=bull?'Bullish':'Bearish';
  if(has('structure'))$('structure').textContent='Spot momentum';
  if(has('session')){const h=new Date().getUTCHours();$('session').textContent=h<8?'ASIA':h<13?'LONDON':'NEW YORK'}
}

function drawChart(){
  const c=$('chart');if(!c)return;const ctx=c.getContext('2d');if(!ctx)return;
  const dpr=window.devicePixelRatio||1,w=Math.max(1,c.clientWidth*dpr),h=180*dpr;c.width=w;c.height=h;
  const a=history.length?history:[lastPrice||0],min=Math.min(...a),max=Math.max(...a),range=max-min||1;
  ctx.clearRect(0,0,w,h);ctx.beginPath();a.forEach((v,i)=>{const x=i*(w/(a.length-1||1)),y=h-((v-min)/range)*(h-18*dpr)-9*dpr;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle='#f5b942';ctx.lineWidth=2*dpr;ctx.stroke();
}

function initTradingView(){
  const host=$('tv_chart');if(!host||host.dataset.ready==='1')return;
  if(!window.TradingView){setTimeout(initTradingView,300);return}
  host.dataset.ready='1';
  try{new window.TradingView.widget({autosize:true,symbol:'OANDA:XAUUSD',interval:'15',timezone:'Asia/Kolkata',theme:'dark',style:'1',locale:'en',enable_publishing:false,hide_top_toolbar:false,hide_legend:false,allow_symbol_change:true,save_image:false,container_id:'tv_chart'})}catch(e){console.error('TradingView init error:',e);host.dataset.ready='0'}
  if(has('webhookUrl'))$('webhookUrl').textContent=location.origin+'/api/tradingview';
}

async function runAI(){
  const btn=$('runAi');if(!btn)return;btn.disabled=true;btn.textContent='Analyzing…';
  if(has('analysisStatus'))$('analysisStatus').textContent='Fetching live XAU/USD OHLC candles from Twelve Data and sending them to Gemini…';
  const tf=document.querySelector('.tf.active')?.dataset.tf||'15min';
  try{
    const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timeframe:tf,question:'Analyze XAUUSD for a disciplined intraday setup. Use the supplied Twelve Data OHLC candles only; do not invent missing data.'})});
    let out={};try{out=await r.json()}catch{}
    if(!r.ok){const detail=out.detail?` — ${out.detail}`:'';const hint=out.hint?` ${out.hint}`:'';throw Error((out.error||`Agent failed (${r.status})`)+detail+hint)}
    const a=out.analysis||{};const entry=validLevel(a.entry),sl=validLevel(a.stopLoss),tp1=validLevel(a.tp1),tp2=validLevel(a.tp2);
    if(has('resultBias')){$('resultBias').textContent=a.bias||'NO TRADE';$('resultBias').style.color=String(a.bias||'').toUpperCase().includes('SELL')?'#ff7676':String(a.bias||'').toUpperCase().includes('BUY')?'#65dc91':'#f5b942'}
    if(has('aEntry'))$('aEntry').textContent=entry===null?'Unavailable':fmt(entry);if(has('aSl'))$('aSl').textContent=sl===null?'Unavailable':fmt(sl);if(has('aTp1'))$('aTp1').textContent=tp1===null?'Unavailable':fmt(tp1);if(has('aTp2'))$('aTp2').textContent=tp2===null?'Unavailable':fmt(tp2);
    if(has('aTrend'))$('aTrend').textContent=a.trend||'Unavailable';if(has('aStructure'))$('aStructure').textContent=a.marketStructure||'Unavailable';if(has('aLiquidity'))$('aLiquidity').textContent=a.liquidity||'Unavailable';if(has('aFvg'))$('aFvg').textContent=a.fvgOrderBlock||'Unavailable';if(has('aInvalidation'))$('aInvalidation').textContent=a.invalidation||'Unavailable';if(has('reasoning'))$('reasoning').textContent=a.reasoning||'—';
    const c=num(a.confidence);if(has('confidence'))$('confidence').textContent=c!==null?Math.round(c)+'%':'—';if(c!==null&&has('confidenceBar'))$('confidenceBar').style.width=Math.max(0,Math.min(100,c))+'%';
    if(has('analysisStatus'))$('analysisStatus').textContent=`Completed using ${out.candleCount||out.candles?.length||'live'} Twelve Data XAU/USD candles + Gemini AI.`;
    addSignal({direction:a.bias||'NO TRADE',entry,sl,tp1,tp2,confidence:c===null?'N/A':Math.round(c)+'%'});
  }catch(e){if(has('analysisStatus'))$('analysisStatus').textContent=e.message||'Agent request failed.';console.error('AI analysis error:',e)}finally{btn.disabled=false;btn.textContent='Run AI Analysis'}
}
if(has('runAi'))$('runAi').addEventListener('click',runAI);

function addSignal(s){const list=JSON.parse(localStorage.getItem('goldxSignals')||'[]');list.unshift({...s,time:new Date().toLocaleString()});localStorage.setItem('goldxSignals',JSON.stringify(list.slice(0,30)));renderSignals()}
function renderSignals(){const el=$('signalsList');if(!el)return;const list=JSON.parse(localStorage.getItem('goldxSignals')||'[]');el.innerHTML=list.length?list.map(s=>`<div class="signal"><b>${s.direction}</b><span>Entry ${s.entry!=null?fmt(s.entry):'Unavailable'}</span><span>SL ${s.sl!=null?fmt(s.sl):'Unavailable'}</span><span>TP1 ${s.tp1!=null?fmt(s.tp1):'Unavailable'}</span><span>${s.time}</span></div>`).join(''):'<div class="empty">No signals yet. Run the AI agent.</div>'}
function clearSignals(){localStorage.removeItem('goldxSignals');renderSignals()}
window.clearSignals=clearSignals;
function calculateRisk(){const bal=num($('balance')?.value),rp=num($('riskPct')?.value)/100,e=num($('rEntry')?.value),sl=num($('rSl')?.value),pv=num($('pointValue')?.value);if(!bal||!rp||e===null||sl===null||!pv){if(has('riskResult'))$('riskResult').textContent='Please enter all values.';return}const risk=bal*rp,diff=Math.abs(e-sl),units=risk/(diff*pv);if(has('riskResult'))$('riskResult').innerHTML=`Risk amount: <b>$${fmt(risk)}</b> • Stop distance: <b>${fmt(diff)}</b> • Approx position size: <b>${fmt(units)}</b> units`}
window.calculateRisk=calculateRisk;

function tick(){if(has('clock'))$('clock').textContent=new Date().toLocaleTimeString()}
tick();setInterval(tick,1000);

if(has('price')){loadGold();setInterval(loadGold,30000);window.addEventListener('resize',drawChart)}
if(has('signalsList'))renderSignals();
setTimeout(()=>{if(has('webhookUrl'))$('webhookUrl').textContent=location.origin+'/api/tradingview'},500);
