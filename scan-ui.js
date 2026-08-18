(function(){
  const stages=[
    ['4H','Analyzing higher-timeframe bias'],
    ['1H','Checking market structure + BOS/CHOCH'],
    ['15M','Scanning liquidity + FVG / order flow'],
    ['5M','Finding execution trigger + risk levels']
  ];
  let overlay=null, active=false, completed=0;
  function addStyle(){
    if(document.getElementById('gx-scan-style'))return;
    const s=document.createElement('style');s.id='gx-scan-style';
    s.textContent=`
      .gx-scan-overlay{position:fixed;inset:0;background:rgba(5,7,11,.74);backdrop-filter:blur(5px);z-index:9999;display:grid;place-items:center;opacity:0;pointer-events:none;transition:opacity .25s ease}
      .gx-scan-overlay.show{opacity:1;pointer-events:auto}
      .gx-scan-box{width:min(560px,calc(100vw - 32px));background:#101319;border:1px solid #2a303b;border-radius:18px;padding:22px;box-shadow:0 25px 90px rgba(0,0,0,.45);transform:translateY(12px) scale(.98);transition:transform .3s ease}
      .gx-scan-overlay.show .gx-scan-box{transform:translateY(0) scale(1)}
      .gx-scan-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.gx-scan-head b{font-size:18px}.gx-scan-pill{font-size:9px;letter-spacing:1px;border:1px solid #3b3220;background:#1d170c;color:#f5b942;padding:6px 9px;border-radius:999px}
      .gx-scan-sub{color:#89919f;font-size:11px;line-height:1.5}.gx-scan-progress{height:7px;background:#1c212b;border-radius:999px;overflow:hidden;margin:16px 0}.gx-scan-progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,#f5b942,#ffd978);transition:width .45s ease}
      .gx-scan-stage{display:grid;grid-template-columns:42px 1fr 20px;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #22262e}.gx-scan-stage:last-child{border-bottom:0}.gx-scan-tf{width:42px;height:32px;border-radius:8px;background:#171a21;display:grid;place-items:center;font-size:10px;font-weight:800;color:#8e98aa}.gx-scan-text{font-size:12px;color:#aeb6c4}.gx-scan-status{font-size:16px;color:#555e6d}.gx-scan-stage.active .gx-scan-tf{color:#16130b;background:#f5b942}.gx-scan-stage.active .gx-scan-text{color:#fff}.gx-scan-stage.active .gx-scan-status{color:#f5b942}.gx-scan-stage.done .gx-scan-tf{background:#12231a;color:#65dc91}.gx-scan-stage.done .gx-scan-status{color:#65dc91}
      .gx-scan-footer{display:flex;justify-content:space-between;margin-top:16px;color:#6f7887;font-size:10px}.gx-scan-live{display:inline-flex;align-items:center;gap:6px}.gx-scan-dot{width:7px;height:7px;border-radius:50%;background:#65dc91;box-shadow:0 0 10px rgba(101,220,145,.7)}
      .gx-scan-spin{width:14px;height:14px;border:2px solid #3b414d;border-top-color:#f5b942;border-radius:50%;display:inline-block;animation:gxSpin .8s linear infinite}@keyframes gxSpin{to{transform:rotate(360deg)}}
    `;document.head.appendChild(s)
  }
  function ensureOverlay(){
    if(overlay)return;
    overlay=document.createElement('div');overlay.className='gx-scan-overlay';overlay.id='gxScanOverlay';
    overlay.innerHTML=`<div class="gx-scan-box"><div class="gx-scan-head"><b>GoldX AI Scan</b><span class="gx-scan-pill">LIVE XAU/USD</span></div><div id="gxScanMsg" class="gx-scan-sub">Initializing market scan…</div><div class="gx-scan-progress"><i id="gxScanBar"></i></div><div id="gxScanStages"></div><div class="gx-scan-footer"><span class="gx-scan-live"><i class="gx-scan-dot"></i> Real-time analysis</span><span id="gxScanCount">0 / 4 timeframes</span></div></div>`;
    document.body.appendChild(overlay);const host=document.getElementById('gxScanStages');stages.forEach(([tf,msg],i)=>{const row=document.createElement('div');row.className='gx-scan-stage';row.dataset.i=i;row.innerHTML=`<div class="gx-scan-tf">${tf}</div><div class="gx-scan-text">${msg}</div><div class="gx-scan-status">•</div>`;host.appendChild(row)})
  }
  function show(){addStyle();ensureOverlay();active=true;completed=0;overlay.classList.add('show');const rows=[...document.querySelectorAll('.gx-scan-stage')];rows.forEach(r=>{r.classList.remove('active','done');r.querySelector('.gx-scan-status').innerHTML='•'});document.getElementById('gxScanBar').style.width='5%';document.getElementById('gxScanMsg').textContent='Preparing 4H → 1H → 15M → 5M analysis…';document.getElementById('gxScanCount').textContent='0 / 4 timeframes'}
  function stageForTf(tf){const idx=stages.findIndex(x=>x[0].toLowerCase()===String(tf).toLowerCase());if(idx<0)return;const rows=[...document.querySelectorAll('.gx-scan-stage')];rows.forEach((r,i)=>{if(i<idx&&!r.classList.contains('done')){r.classList.remove('active');r.classList.add('done');r.querySelector('.gx-scan-status').innerHTML='✓'}});const row=rows[idx];row.classList.add('active');row.querySelector('.gx-scan-status').innerHTML='<span class="gx-scan-spin"></span>';document.getElementById('gxScanMsg').textContent=stages[idx][1];document.getElementById('gxScanBar').style.width=(10+idx*22)+'%'}
  function doneTf(tf){const idx=stages.findIndex(x=>x[0].toLowerCase()===String(tf).toLowerCase());if(idx<0)return;const row=document.querySelectorAll('.gx-scan-stage')[idx];row.classList.remove('active');row.classList.add('done');row.querySelector('.gx-scan-status').innerHTML='✓';completed=Math.max(completed,idx+1);document.getElementById('gxScanBar').style.width=Math.round((completed/4)*100)+'%';document.getElementById('gxScanCount').textContent=completed+' / 4 timeframes'}
  function finish(){if(!active)return;active=false;document.getElementById('gxScanBar').style.width='100%';document.getElementById('gxScanMsg').textContent='Analysis complete — building the final confluence score…';setTimeout(()=>overlay.classList.remove('show'),650)}
  function hookFetch(){if(window.__gxScanFetchHook)return;window.__gxScanFetchHook=true;const orig=window.fetch.bind(window);window.fetch=function(input,init){const url=typeof input==='string'?input:(input&&input.url)||'';let tf=null;if(url.includes('/api/ai')&&init&&init.body){try{const p=JSON.parse(init.body);tf=p.timeframe; if(active&&tf)stageForTf(tf)}catch{}}return orig(input,init).then(async r=>{if(url.includes('/api/ai')&&tf){doneTf(tf);if(completed>=4)finish()}return r})}}
  function hookButton(){document.addEventListener('click',e=>{const b=e.target.closest('#gxMtfBtn');if(!b)return;if(active)return;show()},true)}
  function boot(){addStyle();ensureOverlay();hookFetch();hookButton()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
