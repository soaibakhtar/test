export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const tv = typeof body === 'string' ? JSON.parse(body) : body;
    const required = ['open', 'high', 'low', 'close'];
    const missing = required.filter((k) => tv?.[k] === undefined || tv?.[k] === null || Number.isNaN(Number(tv[k])));
    if (missing.length) return res.status(400).json({ error: `Missing OHLC fields: ${missing.join(', ')}` });

    const payload = {
      source: 'tradingview',
      symbol: tv.symbol || 'XAUUSD',
      timeframe: tv.timeframe || '15',
      time: tv.time || Date.now(),
      open: Number(tv.open),
      high: Number(tv.high),
      low: Number(tv.low),
      close: Number(tv.close),
      volume: tv.volume != null ? Number(tv.volume) : null,
      swingHigh: tv.swingHigh != null ? Number(tv.swingHigh) : null,
      swingLow: tv.swingLow != null ? Number(tv.swingLow) : null,
      structure: tv.structure || 'UNKNOWN',
      bullBos: Boolean(tv.bullBos),
      bearBos: Boolean(tv.bearBos),
      bullFvg: Boolean(tv.bullFvg),
      bearFvg: Boolean(tv.bearFvg)
    };

    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' });

    const prompt = `You are GoldX AI Trader. Analyze ONLY this TradingView alert payload. Do not invent candles or market data. The payload contains one confirmed candle plus TradingView-computed structure context. Return valid JSON with keys: bias, confidence, trend, marketStructure, liquidity, fvgOrderBlock, entry, stopLoss, tp1, tp2, riskReward, invalidation, reasoning. If one candle is insufficient for a claim, say unavailable instead of guessing. Payload: ${JSON.stringify(payload)}`;

    const ai = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    const raw = await ai.text();
    if (!ai.ok) return res.status(502).json({ error: `Gemini API request failed (${ai.status})`, detail: raw.slice(0, 700) });

    let data;
    try { data = JSON.parse(raw); } catch { return res.status(502).json({ error: 'Gemini returned invalid JSON', detail: raw.slice(0, 700) }); }
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '{}';
    let analysis;
    try { analysis = JSON.parse(text); } catch { analysis = { reasoning: text }; }

    return res.status(200).json({ source: 'tradingview', payload, mode: 'tradingview-plus-ai', analysis });
  } catch (error) {
    return res.status(500).json({ error: 'TradingView webhook failed', detail: error instanceof Error ? error.message : String(error) });
  }
}
