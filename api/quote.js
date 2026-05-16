export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  const HEADERS = { 'User-Agent':'Mozilla/5.0','Accept':'application/json','Referer':'https://finance.yahoo.com' };
  const fw = (url, ms=9000) => { const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms); return fetch(url,{headers:HEADERS,signal:c.signal}).finally(()=>clearTimeout(t)); };
  for (const base of ['https://query1.finance.yahoo.com','https://query2.finance.yahoo.com']) {
    try {
      const r = await fw(`${base}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
      if (!r.ok) continue;
      const d = await r.json();
      if (d?.chart?.result?.[0]) return res.json(d);
    } catch {}
  }
  res.status(500).json({ error: 'Failed to fetch quote' });
}
