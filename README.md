# GoldX AI Trader

Free XAUUSD dashboard using a real-time gold spot feed. The app never labels demo values as live.

## Real market data
This build uses Gold API's public `https://api.gold-api.com/price/XAU` endpoint. Its documentation says the real-time price endpoint requires no authentication and has no stated rate limit for real-time prices. It returns XAU price and change fields. This is spot gold data, not a broker's executable XAUUSD quote.

## AI upgrade
For full AI reasoning, connect a server-side Gemini API key and an OHLC market-data provider. Do not expose AI secrets in browser JavaScript. Full 5m/15m/1h/4h SMC/FVG/OB analysis requires real candles; this version explicitly does not fake them.

## Deploy
Connect this public GitHub repository to Vercel or GitHub Pages. The live spot endpoint supports browser CORS, so the spot dashboard works as a static site.

## Safety
This is an educational trading tool. Spot data may differ from your broker. Prototype signals are not guaranteed trade instructions. Verify execution price, spread, liquidity and risk yourself.
