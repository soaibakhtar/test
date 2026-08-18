export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const twelveKey = String(process.env.TWELVE_DATA_API_KEY || '').trim();
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!twelveKey) return res.status(503).json({ error: 'TWELVE_DATA_API_KEY is not configured' });
  if (!geminiKey) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });

  const timeframes = ['4h', '1h', '15min', '5min'];
  const getCandles = async (interval) => {
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', 'XAU/USD');
    url.searchParams.set('interval', interval);
    url.searchParams.set('outputsize', '80');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('apikey', twelveKey);
    const r = await fetch(url, { cache: 'no-store' });
    const text = await r.text();
    if (!r.ok) throw new Error(`Twelve Data ${interval} failed (${r.status})`);
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(`Twelve Data ${interval} returned invalid JSON`); }
    if (data.status === 'error') throw new Error(data.message || `Twelve Data ${interval} error`);
    const candles = (Array.isArray(data.values) ? data.values : []).map(v => ({
      datetime: v.datetime,
      open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close)
    })).filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite)).reverse();
    if (candles.length < 30) throw new Error(`Not enough ${interval} candles`);
    return candles;
  };

  const contextFor = (candles) => {
    const recent = candles.slice(-50);
    const isSwingHigh = i => i >= 2 && i <= candles.length - 3 && candles[i].high > candles[i-1].high && candles[i].high > candles[i-2].high && candles[i].high >= candles[i+1].high && candles[i].high >= candles[i+2].high;
    const isSwingLow = i => i >= 2 && i <= candles.length - 3 && candles[i].low < candles[i-1].low && candles[i].low < candles[i-2].low && candles[i].low <= candles[i+1].low && candles[i].low <= candles[i+2].low;
    const highs = [], lows = [];
    for (let i = Math.max(2, candles.length - 55); i < candles.length - 2; i++) {
      if (isSwingHigh(i)) highs.push(candles[i].high);
      if (isSwingLow(i)) lows.push(candles[i].low);
    }
    const lastHigh = highs.at(-1) ?? Math.max(...recent.map(c => c.high));
    const prevHigh = highs.at(-2) ?? lastHigh;
    const lastLow = lows.at(-1) ?? Math.min(...recent.map(c => c.low));
    const prevLow = lows.at(-2) ?? lastLow;
    const structure = lastHigh > prevHigh && lastLow > prevLow ? 'Higher highs and higher lows' : lastHigh < prevHigh && lastLow < prevLow ? 'Lower highs and lower lows' : 'Mixed / range';
    const latest = candles.at(-1), previous = candles.at(-2);
    const bullishBOS = latest.close > prevHigh;
    const bearishBOS = latest.close < prevLow;
    const rangeHigh = Math.max(...recent.map(c => c.high));
    const rangeLow = Math.min(...recent.map(c => c.low));
    const fvg = [];
    for (let i = Math.max(2, candles.length - 35); i < candles.length; i++) {
      const a = candles[i-2], c = candles[i];
      if (c.low > a.high) fvg.push({ type: 'bullish FVG', low: a.high, high: c.low });
      if (c.high < a.low) fvg.push({ type: 'bearish FVG', low: c.high, high: a.low });
    }
    return { latest, previous, structure, bullishBOS, bearishBOS, rangeHigh, rangeLow, lastHigh, prevHigh, lastLow, prevLow, recentFVGs: fvg.slice(-6), candles: candles.slice(-40) };
  };

  try {
    const loaded = await Promise.all(timeframes.map(async tf => ({ timeframe: tf, candles: await getCandles(tf) })));
    const contexts = Object.fromEntries(loaded.map(x => [x.timeframe, contextFor(x.candles)]));

    const prompt = `You are GoldX AI Trader. Analyze XAUUSD using ONLY the supplied real Twelve Data OHLC. Do not invent prices. Return one valid JSON object with keys: timeframes, final. timeframes must contain 4h, 1h, 15min, 5min. Each timeframe must contain bias, confidence (number 0-100), trend, marketStructure, liquidity, fvgOrderBlock, entry, stopLoss, tp1, tp2, riskReward, invalidation, reasoning. Use null for trade levels when there is no valid setup. final must contain bias (BUY/SELL/WAIT), confidence (0-100), executionTimeframe, entry, stopLoss, tp1, tp2, riskReward, reasoning. Be conservative: conflicting evidence = WAIT. Prefer alignment across timeframes, with 5M/15M for execution and 4H/1H for directional context.\n\nDATA:\n${JSON.stringify(contexts)}`;

    const models = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
    let raw = '';
    let usedModel = null;
    let lastError = null;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const ai = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } })
        });
        raw = await ai.text();
        if (ai.ok) { usedModel = model; break; }
        let detail = raw;
        try { detail = JSON.parse(raw)?.error?.message || raw; } catch {}
        lastError = { status: ai.status, detail: String(detail).slice(0, 700), model };
        if (![429, 500, 502, 503].includes(ai.status)) break;
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
      if (usedModel) break;
    }
    if (!usedModel) return res.status(502).json({ error: `Gemini unavailable (${lastError?.status || 'unknown'})`, detail: lastError?.detail || 'No model response' });

    let envelope;
    try { envelope = JSON.parse(raw); } catch { return res.status(502).json({ error: 'Gemini returned invalid JSON envelope', model: usedModel }); }
    const text = envelope?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
    let analysis;
    try { analysis = JSON.parse(text); } catch { return res.status(502).json({ error: 'Gemini returned invalid MTF JSON', model: usedModel, detail: text.slice(0, 800) }); }

    return res.status(200).json({ mode: 'live-mtf-plus-ai', source: 'Twelve Data', model: usedModel, timeframes: contexts, analysis });
  } catch (error) {
    return res.status(502).json({ error: 'MTF endpoint failed', detail: error instanceof Error ? error.message : String(error) });
  }
}
