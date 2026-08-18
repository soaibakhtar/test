(function(){
  const page=document.body.dataset.page||'dashboard';
  const routes={dashboard:{href:'/',label:'Dashboard',title:'Dashboard',view:'dashboard'},tradingview:{href:'/tradingview/',label:'TradingView',title:'TradingView',view:'chartview'},analysis:{href:'/ai-analysis/',label:'AI Analysis',title:'AI Analysis',view:'analysis'},signals:{href:'/signals/',label:'Signals',title:'Signals',view:'signals'},risk:{href:'/risk-calculator/',label:'Risk Calculator',title:'Risk Calculator',view:'risk'},settings:{href:'/settings/',label:'Settings',title:'Settings',view:'settings'},prolab:{href:'/pro-lab/',label:'Pro Lab',title:'Pro Lab',view:'pro'}};
  const links=['dashboard','tradingview','analysis','signals','risk','settings','prolab'];
  const icons={dashboard:'◈',tradingview:'▥',analysis:'◎',signals:'↯',risk:'▣',settings:'⚙',prolab:'✦'};
  function boot(){
    const mount=document.getElementById('page-content');if(!mount)return;
    const title=routes[page]?.title||'GoldX AI Trader';
    const shell=document.createElement('div');shell.className='app-shell';
    shell.innerHTML=`<aside class="sidebar"><div class="brand"><span class="brand-dot"></span><div><b>GoldX</b><small>AI TRADER</small></div></div><nav>${links.map(key=>{const r=routes[key];return `<a class="nav ${key===page?'active':''}" data-view="${r.view}" data-page-key="${key}" href="${r.href}">${icons[key]} <span>${r.label}</span></a>`}).join('')}</nav><div class="side-note"><span class="live-dot"></span><div><b>LIVE ENGINE</b><small>Real-time Gold data + AI analysis.</small></div></div></aside><main class="main"><header class="topbar"><div><div class="eyebrow">XAUUSD • AI MARKET TERMINAL</div><h1 id="viewTitle">${title}</h1></div><div class="top-actions"><span id="dataBadge" class="badge live">DATA: LIVE</span><span class="clock" id="clock">--:--:--</span></div></header><div id="pageMount"></div></main>`;
    mount.parentNode.insertBefore(shell,mount);shell.querySelector('#pageMount').appendChild(mount);mount.removeAttribute('id');
    const tick=()=>{const c=document.getElementById('clock');if(c)c.textContent=new Date().toLocaleTimeString()};tick();setInterval(tick,1000);window.__goldxPage=page;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
