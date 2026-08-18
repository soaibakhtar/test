export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const interval = String(req.query?.interval || '15min');
  const allowed = new Set(['5min', '15min', '1h', '4h']);
  if (!allowed.has(interval)) return res.status(400).json({ error: 'Unsupported interval' });

  const apiKey = String(process.env.TWELVE_DATA_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({
      error: 'TWELVE_DATA_API_KEY is not configured',
      hint: 'Add TWELVE_DATA_API_KEY to Vercel Environment Variables and redeploy.'
    });
  }

  try {
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', 'XAU/USD');
    url.searchParams.set('interval', interval);
    url.searchParams.set('outputsize', '150');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('apikey', apiKey);

    const r = await fetch(url, { cache: 'no-store' });
    const raw = await r.text();
    if (!r.ok) {
      return res.status(502).json({ error: `Twelve Data request failed (${r.status})`, detail: raw.slice(0, 700) });
    }

    let data;
    try { data = JSON.parse(raw); } catch { return res.status(502).json({ error: 'Twelve Data returned invalid JSON', detail: raw.slice(0, 500) }); }
    if (data.status === 'error') {
      return res.status(502).json({ error: 'Twelve Data error', detail: data.message || 'Unknown provider error' });
    }

    const values = Array.isArray(data.values) ? data.values : [];
    const candles = values.map(v => ({
      datetime: v.datetime,
      open: Number(v.open),
      high: Number(v.high),
      low: Number(v.low),
      close: Number(v.close),
      volume: v.volume == null ? null : Number(v.volume)
    })).filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite)).reverse();

    if (candles.length < 30) return res.status(502).json({ error: 'Not enough OHLC candles returned', count: candles.length });

    return res.status(200).json({ symbol: 'XAU/USD', interval, source: 'Twelve Data', count: candles.length, candles });
  } catch (error) {
    return res.status(500).json({ error: 'Candle endpoint crashed', detail: error instanceof Error ? error.message : String(error) });
  }
}
