export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const fw = (url, opts={}, ms=10000) => { const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms); return fetch(url,{...opts,signal:c.signal}).finally(()=>clearTimeout(t)); };
  const modules = 'financialData,defaultKeyStatistics,summaryDetail,incomeStatementHistory';
  const raw = v => v?.raw ?? null;

  // 1. crumb 획득 시도
  let crumb = '', cookie = '';
  try {
    const r1 = await fw(`https://query2.finance.yahoo.com/v1/test/getcrumb`, {
      headers: { 'User-Agent': UA, 'Referer': 'https://finance.yahoo.com' }
    }, 5000);
    if (r1.ok) {
      crumb = (await r1.text()).trim();
      cookie = r1.headers.get('set-cookie')?.split(',').map(c=>c.split(';')[0].trim()).join('; ') || '';
    }
  } catch {}

  // 2. quoteSummary 요청 (query2, query1 순으로 시도)
  for (const base of ['https://query2.finance.yahoo.com','https://query1.finance.yahoo.com']) {
    try {
      const qs = crumb ? `&crumb=${encodeURIComponent(crumb)}` : '';
      const url = `${base}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}${qs}`;
      const r = await fw(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com', ...(cookie?{'Cookie':cookie}:{}) }
      });
      const data = await r.json();
      const result = data?.quoteSummary?.result?.[0];
      if (!result) continue;

      const fd=result.financialData||{}, ks=result.defaultKeyStatistics||{}, sd=result.summaryDetail||{}, is=result.incomeStatementHistory?.incomeStatementHistory?.[0]||{};
      return res.json({
        trailingPE:raw(sd.trailingPE), forwardPE:raw(sd.forwardPE), priceToBook:raw(ks.priceToBook),
        evToRevenue:raw(ks.enterpriseToRevenue), evToEbitda:raw(ks.enterpriseToEbitda), pegRatio:raw(ks.pegRatio),
        trailingEps:raw(ks.trailingEps), forwardEps:raw(ks.forwardEps),
        totalRevenue:raw(fd.totalRevenue), grossProfits:raw(fd.grossProfits), ebitda:raw(fd.ebitda),
        operatingIncome:raw(fd.operatingIncome), netIncome:raw(is.netIncome),
        grossMargins:raw(fd.grossMargins), operatingMargins:raw(fd.operatingMargins), profitMargins:raw(fd.profitMargins),
        returnOnEquity:raw(fd.returnOnEquity), returnOnAssets:raw(fd.returnOnAssets),
        revenueGrowth:raw(fd.revenueGrowth), earningsGrowth:raw(fd.earningsGrowth),
        totalCash:raw(fd.totalCash), totalDebt:raw(fd.totalDebt), debtToEquity:raw(fd.debtToEquity), currentRatio:raw(fd.currentRatio),
        dividendYield:raw(sd.dividendYield), beta:raw(sd.beta),
        fiftyTwoWeekHigh:raw(sd.fiftyTwoWeekHigh), fiftyTwoWeekLow:raw(sd.fiftyTwoWeekLow),
        currency: fd.financialCurrency, _source: base,
      });
    } catch {}
  }

  // 3. v7 fallback (간단한 밸류에이션만)
  try {
    const fields = 'trailingPE,forwardPE,priceToBook,epsTrailingTwelveMonths,epsForward,dividendYield,beta';
    const url4 = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=${fields}`;
    const r4 = await fw(url4, { headers: { 'User-Agent': UA, 'Referer': 'https://finance.yahoo.com' } });
    const d4 = await r4.json();
    const q = d4?.quoteResponse?.result?.[0];
    if (q) return res.json({
      trailingPE:q.trailingPE, forwardPE:q.forwardPE, priceToBook:q.priceToBook,
      trailingEps:q.epsTrailingTwelveMonths, forwardEps:q.epsForward,
      dividendYield:q.dividendYield?q.dividendYield/100:null, beta:q.beta, _source:'v7_fallback',
    });
  } catch {}

  res.status(404).json({ error: 'No financial data available' });
}
