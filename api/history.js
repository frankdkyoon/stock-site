export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, range = '3mo', interval: forceInterval } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  // 사용자가 직접 지정한 interval 우선, 없으면 range에 따라 자동
  const autoMap = { '1mo':'1d','3mo':'1d','6mo':'1d','1y':'1d','2y':'1wk','3y':'1wk' };
  const interval = forceInterval || autoMap[range] || '1d';

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'Referer': 'https://finance.yahoo.com',
  };

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includeAdjustedClose=true`;
    const r = await fetch(url, { headers: HEADERS });
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No result');

    const ts = result.timestamp;
    const q = result.indicators.quote[0];
    const candles = ts.map((t, i) => ({
      time: t,
      o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i],
      v: q.volume[i] || 0,
    })).filter(c => c.o != null && c.c != null);

    res.json({ symbol, currency: result.meta.currency, exchangeName: result.meta.exchangeName, interval, candles });
  } catch (e) {
    try {
      const url2 = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
      const r2 = await fetch(url2, { headers: HEADERS });
      const data2 = await r2.json();
      const result2 = data2?.chart?.result?.[0];
      if (!result2) return res.status(404).json({ error: 'No data' });
      const ts = result2.timestamp;
      const q = result2.indicators.quote[0];
      const candles = ts.map((t, i) => ({ time: t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0 })).filter(c => c.o != null && c.c != null);
      res.json({ symbol, currency: result2.meta.currency, exchangeName: result2.meta.exchangeName, interval, candles });
    } catch (e2) {
      res.status(500).json({ error: e.message });
    }
  }
}
