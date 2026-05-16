export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, range = '3mo', interval: forceInterval } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const autoMap = { '1mo':'1d','3mo':'1d','6mo':'1d','1y':'1d','2y':'1wk','3y':'1wk' };
  const interval = forceInterval || autoMap[range] || '1d';
  const HEADERS = { 'User-Agent':'Mozilla/5.0','Accept':'application/json','Referer':'https://finance.yahoo.com' };
  const fw = (url, opts={}, ms=9000) => { const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms); return fetch(url,{...opts,signal:c.signal}).finally(()=>clearTimeout(t)); };

  for (const base of ['https://query1.finance.yahoo.com','https://query2.finance.yahoo.com']) {
    try {
      const url = `${base}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includeAdjustedClose=true`;
      const r = await fw(url, { headers: HEADERS });
      const data = await r.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;
      const ts = result.timestamp, q = result.indicators.quote[0];
      const candles = ts.map((t,i)=>({time:t,o:q.open[i],h:q.high[i],l:q.low[i],c:q.close[i],v:q.volume[i]||0})).filter(c=>c.o!=null&&c.c!=null);
      return res.json({ symbol, currency: result.meta.currency, exchangeName: result.meta.exchangeName, interval, candles });
    } catch {}
  }
  res.status(500).json({ error: 'Failed to fetch chart data' });
}
