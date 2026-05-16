export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, range = '3mo', interval = '1d' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includeAdjustedClose=true`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com',
      }
    });
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) return res.status(404).json({ error: 'No data found' });

    const ts = result.timestamp;
    const q = result.indicators.quote[0];
    const candles = ts.map((t, i) => ({
      x: t * 1000,
      o: q.open[i],
      h: q.high[i],
      l: q.low[i],
      c: q.close[i],
      v: q.volume[i],
    })).filter(c => c.o != null && c.h != null && c.l != null && c.c != null);

    res.json({
      symbol,
      currency: result.meta.currency,
      exchangeName: result.meta.exchangeName,
      candles,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
