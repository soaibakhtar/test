export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { timeframe = '15min', question = 'Analyze XAUUSD' } = req.body || {};
  const market = await fetch('https://api.gold-api.com/price/XAU', { cache: 'no-store' });
  if (!market.ok) return res.status(502).json({ error: 'Live gold data provider unavailable' });
  const spot = await market.json();

  const prompt = `You are a disciplined XAUUSD market-analysis assistant. Use ONLY the market data supplied below. Do not invent candles, FVGs, order blocks, liquidity levels, or news. If OHLC candles are absent, explicitly say that SMC/FVG/OB confirmation is unavailable. Return concise JSON with keys: bias, confidence, trend, marketStructure, liquidity, fvgOrderBlock, entry, stopLoss, tp1, tp2, riskReward, invalidation, reasoning. Timeframe: ${timeframe}. User request: ${question}. Live spot payload: ${JSON.stringify(spot)}`;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(200).json({
      mode: 'live-data-only',
      market: spot,
      analysis: {
        bias: Number(spot.ch || 0) >= 0 ? 'BUY BIAS' : 'SELL BIAS',
        confidence: 'N/A', trend: Number(spot.ch || 0) >= 0 ? 'Bullish momentum' : 'Bearish momentum',
        marketStructure: 'Requires OHLC candles', liquidity: 'Requires OHLC candles',
        fvgOrderBlock: 'Requires OHLC candles', entry: Number(spot.price),
        stopLoss: null, tp1: null, riskReward: null,
        invalidation: 'Requires OHLC candles',
        reasoning: 'Live spot data is connected, but GEMINI_API_KEY is not configured. No fabricated SMC analysis is shown.'
      }
    });
  }

  const ai = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } })
  });
  if (!ai.ok) return res.status(502).json({ error: 'Gemini API request failed' });
  const data = await ai.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
  let analysis;
  try { analysis = JSON.parse(text); } catch { analysis = { reasoning: text }; }
  return res.status(200).json({ mode: 'live-data-plus-ai', market: spot, analysis });
}
