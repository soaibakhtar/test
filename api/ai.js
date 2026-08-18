export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { timeframe = '15min', question = 'Analyze XAUUSD' } = req.body || {};
    const market = await fetch('https://api.gold-api.com/price/XAU', { cache: 'no-store' });
    if (!market.ok) {
      return res.status(502).json({ error: `Live gold data provider unavailable (${market.status})` });
    }

    const spot = await market.json();
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

    if (!apiKey) {
      return res.status(200).json({
        mode: 'live-data-only',
        market: spot,
        analysis: {
          bias: Number(spot.ch || 0) >= 0 ? 'BUY BIAS' : 'SELL BIAS',
          confidence: 'N/A',
          trend: Number(spot.ch || 0) >= 0 ? 'Bullish momentum' : 'Bearish momentum',
          marketStructure: 'Requires OHLC candles',
          liquidity: 'Requires OHLC candles',
          fvgOrderBlock: 'Requires OHLC candles',
          entry: Number(spot.price),
          stopLoss: null,
          tp1: null,
          tp2: null,
          riskReward: null,
          invalidation: 'Requires OHLC candles',
          reasoning: 'GEMINI_API_KEY is not available to this Vercel deployment. Live spot data is connected, but no fabricated SMC analysis is shown.'
        }
      });
    }

    const prompt = `You are a disciplined XAUUSD market-analysis assistant. Use ONLY the market data supplied below. Do not invent candles, FVGs, order blocks, liquidity levels, or news. If OHLC candles are absent, explicitly say that SMC/FVG/OB confirmation is unavailable. Return valid JSON with keys: bias, confidence, trend, marketStructure, liquidity, fvgOrderBlock, entry, stopLoss, tp1, tp2, riskReward, invalidation, reasoning. Timeframe: ${timeframe}. User request: ${question}. Live spot payload: ${JSON.stringify(spot)}`;

    const ai = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    const raw = await ai.text();
    if (!ai.ok) {
      let detail = raw;
      try {
        const parsed = JSON.parse(raw);
        detail = parsed?.error?.message || parsed?.error?.status || raw;
      } catch {}
      return res.status(502).json({
        error: `Gemini API request failed (${ai.status})`,
        detail: String(detail).slice(0, 700),
        hint: ai.status === 401 || ai.status === 403
          ? 'Check the Vercel GEMINI_API_KEY value, key restrictions, and redeploy after changing environment variables.'
          : ai.status === 429
            ? 'Gemini quota or rate limit reached.'
            : 'Check the Gemini API response details.'
      });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'Gemini returned a non-JSON response', detail: raw.slice(0, 700) });
    }

    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      analysis = { reasoning: text };
    }

    return res.status(200).json({ mode: 'live-data-plus-ai', market: spot, analysis });
  } catch (error) {
    return res.status(500).json({
      error: 'AI endpoint crashed',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}
