export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { timeframe = '15min', question = 'Analyze XAUUSD for a disciplined intraday setup.' } = req.body || {};
    const allowed = new Set(['5min', '15min', '1h', '4h']);
    const interval = allowed.has(timeframe) ? timeframe : '15min';
    const twelveKey = String(process.env.TWELVE_DATA_API_KEY || '').trim();
    const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();

    if (!twelveKey) {
      return res.status(503).json({
        error: 'TWELVE_DATA_API_KEY is not configured',
        hint: 'Add TWELVE_DATA_API_KEY in Vercel Environment Variables and redeploy.'
      });
    }

    const tdUrl = new URL('https://api.twelvedata.com/time_series');
    tdUrl.searchParams.set('symbol', 'XAU/USD');
    tdUrl.searchParams.set('interval', interval);
    tdUrl.searchParams.set('outputsize', '150');
    tdUrl.searchParams.set('timezone', 'UTC');
    tdUrl.searchParams.set('apikey', twelveKey);

    const td = await fetch(tdUrl, { cache: 'no-store' });
    const rawTd = await td.text();
    if (!td.ok) return res.status(502).json({ error: `Twelve Data request failed (${td.status})`, detail: rawTd.slice(0, 700) });

    let tdData;
    try { tdData = JSON.parse(rawTd); } catch { return res.status(502).json({ error: 'Twelve Data returned invalid JSON' }); }
    if (tdData.status === 'error') return res.status(502).json({ error: 'Twelve Data error', detail: tdData.message || 'Unknown provider error' });

    const candles = (Array.isArray(tdData.values) ? tdData.values : []).map(v => ({
      datetime: v.datetime,
      open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close),
      volume: v.volume == null ? null : Number(v.volume)
    })).filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite)).reverse();

    if (candles.length < 30) return res.status(502).json({ error: 'Not enough OHLC candles returned by Twelve Data', count: candles.length });

    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const lookback = candles.slice(-30);
    const highs = lookback.map(c => c.high);
    const lows = lookback.map(c => c.low);
    const rangeHigh = Math.max(...highs);
    const rangeLow = Math.min(...lows);

    function isSwingHigh(i) {
      if (i < 2 || i > candles.length - 3) return false;
      return candles[i].high > candles[i-1].high && candles[i].high > candles[i-2].high && candles[i].high >= candles[i+1].high && candles[i].high >= candles[i+2].high;
    }
    function isSwingLow(i) {
      if (i < 2 || i > candles.length - 3) return false;
      return candles[i].low < candles[i-1].low && candles[i].low < candles[i-2].low && candles[i].low <= candles[i+1].low && candles[i].low <= candles[i+2].low;
    }

    const swingHighs = [];
    const swingLows = [];
    for (let i = Math.max(2, candles.length - 60); i < candles.length - 2; i++) {
      if (isSwingHigh(i)) swingHighs.push({ index: i, price: candles[i].high, datetime: candles[i].datetime });
      if (isSwingLow(i)) swingLows.push({ index: i, price: candles[i].low, datetime: candles[i].datetime });
    }

    const lastHigh = swingHighs.at(-1)?.price ?? rangeHigh;
    const prevHigh = swingHighs.at(-2)?.price ?? lastHigh;
    const lastLow = swingLows.at(-1)?.price ?? rangeLow;
    const prevLow = swingLows.at(-2)?.price ?? lastLow;
    const structure = lastHigh > prevHigh && lastLow > prevLow ? 'Higher highs and higher lows' : lastHigh < prevHigh && lastLow < prevLow ? 'Lower highs and lower lows' : 'Mixed / range';
    const bullishBOS = latest.close > prevHigh;
    const bearishBOS = latest.close < prevLow;

    const fvg = [];
    for (let i = Math.max(2, candles.length - 50); i < candles.length; i++) {
      const a = candles[i - 2], b = candles[i - 1], c = candles[i];
      if (c.low > a.high) fvg.push({ type: 'bullish FVG', low: a.high, high: c.low, at: b.datetime });
      if (c.high < a.low) fvg.push({ type: 'bearish FVG', low: c.high, high: a.low, at: b.datetime });
    }

    const prompt = `You are GoldX AI Trader, a disciplined XAUUSD intraday analysis agent. Use ONLY the supplied Twelve Data OHLC candles and calculated context. Never invent missing data. Do not claim a setup exists unless the candles support it. Analyze the selected timeframe (${interval}). Consider market structure, BOS/CHOCH, liquidity sweeps, fair value gaps, order blocks, momentum, recent range, and risk/reward. Prefer NO TRADE when evidence is weak or conflicting. Return valid JSON only with keys: bias, confidence, trend, marketStructure, liquidity, fvgOrderBlock, entry, stopLoss, tp1, tp2, riskReward, invalidation, reasoning.

Calculated context: latest=${JSON.stringify(latest)}, previous=${JSON.stringify(prev)}, structure=${structure}, bullishBOS=${bullishBOS}, bearishBOS=${bearishBOS}, recentRangeLow=${rangeLow}, recentRangeHigh=${rangeHigh}, latestSwingHigh=${lastHigh}, previousSwingHigh=${prevHigh}, latestSwingLow=${lastLow}, previousSwingLow=${prevLow}, recentFVGs=${JSON.stringify(fvg.slice(-8))}.

Recent candles (oldest to newest, last 120): ${JSON.stringify(candles.slice(-120))}

User request: ${question}`;

    if (!geminiKey) {
      return res.status(200).json({
        mode: 'live-ohlc-only',
        market: { symbol: 'XAU/USD', interval, source: 'Twelve Data', latest },
        analysis: {
          bias: bullishBOS ? 'BUY WATCH' : bearishBOS ? 'SELL WATCH' : 'NO TRADE',
          confidence: null,
          trend: structure,
          marketStructure: structure,
          liquidity: 'Calculated from recent swing highs/lows',
          fvgOrderBlock: fvg.length ? `${fvg.length} recent FVG candidate(s); AI confirmation unavailable` : 'No recent FVG candidate detected',
          entry: null, stopLoss: null, tp1: null, tp2: null, riskReward: null,
          invalidation: 'Requires AI confirmation and user-defined risk rules',
          reasoning: 'Real Twelve Data OHLC candles are connected. GEMINI_API_KEY is not available to this deployment, so no AI trade levels are fabricated.'
        },
        candles: candles.slice(-120)
      });
    }

    const ai = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    const rawAi = await ai.text();
    if (!ai.ok) {
      let detail = rawAi;
      try { detail = JSON.parse(rawAi)?.error?.message || rawAi; } catch {}
      return res.status(502).json({ error: `Gemini API request failed (${ai.status})`, detail: String(detail).slice(0, 700) });
    }

    let aiData;
    try { aiData = JSON.parse(rawAi); } catch { return res.status(502).json({ error: 'Gemini returned invalid JSON envelope' }); }
    const text = aiData?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
    let analysis;
    try { analysis = JSON.parse(text); } catch { analysis = { reasoning: text }; }

    return res.status(200).json({
      mode: 'live-ohlc-plus-ai',
      market: { symbol: 'XAU/USD', interval, source: 'Twelve Data', latest },
      context: { structure, bullishBOS, bearishBOS, recentRangeLow: rangeLow, recentRangeHigh: rangeHigh, latestSwingHigh: lastHigh, latestSwingLow: lastLow, recentFVGs: fvg.slice(-8) },
      analysis,
      candles: candles.slice(-120)
    });
  } catch (error) {
    return res.status(500).json({ error: 'AI endpoint crashed', detail: error instanceof Error ? error.message : String(error) });
  }
}
