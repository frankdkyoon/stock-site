export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Step 1: crumb + cookie 획득
  let crumb = '', cookie = '';
  try {
    const r1 = await fetch(`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
    });
    const setCookie = r1.headers.get('set-cookie') || '';
    cookie = setCookie.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');

    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Cookie': cookie, 'Referer': 'https://finance.yahoo.com' },
    });
    crumb = (await r2.text()).trim();
  } catch {}

  const modules = 'financialData,defaultKeyStatistics,summaryDetail,incomeStatementHistory,balanceSheetHistory';
  const raw = v => v?.raw ?? null;

  // Step 2: quoteSummary (crumb 있으면 포함)
  const tryFetch = async (base) => {
    const url = `${base}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ''}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com', ...(cookie ? { 'Cookie': cookie } : {}) },
    });
    return r.json();
  };

  let result = null;
  for (const base of ['https://query2.finance.yahoo.com', 'https://query1.finance.yahoo.com']) {
    try {
      const d = await tryFetch(base);
      const r = d?.quoteSummary?.result?.[0];
      if (r) { result = r; break; }
    } catch {}
  }

  // Step 3: v11 fallback
  if (!result) {
    try {
      const url3 = `https://query2.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&formatted=false${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ''}`;
      const r3 = await fetch(url3, { headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com' } });
      const d3 = await r3.json();
      result = d3?.quoteSummary?.result?.[0] || null;
    } catch {}
  }

  // Step 4: v7 quote fallback (기본 valuation only)
  if (!result) {
    try {
      const fields = 'trailingPE,forwardPE,priceToBook,epsTrailingTwelveMonths,epsForward,marketCap,dividendYield,beta,fiftyTwoWeekHigh,fiftyTwoWeekLow';
      const url4 = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=${fields}${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ''}`;
      const r4 = await fetch(url4, { headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com' } });
      const d4 = await r4.json();
      const q = d4?.quoteResponse?.result?.[0];
      if (q) {
        return res.json({
          trailingPE: q.trailingPE, forwardPE: q.forwardPE, priceToBook: q.priceToBook,
          trailingEps: q.epsTrailingTwelveMonths, forwardEps: q.epsForward,
          dividendYield: q.dividendYield ? q.dividendYield / 100 : null,
          beta: q.beta, fiftyTwoWeekHigh: q.fiftyTwoWeekHigh, fiftyTwoWeekLow: q.fiftyTwoWeekLow,
          _source: 'v7_fallback',
        });
      }
    } catch {}
    return res.status(404).json({ error: 'All endpoints failed', _source: 'none' });
  }

  const fd = result.financialData || {};
  const ks = result.defaultKeyStatistics || {};
  const sd = result.summaryDetail || {};
  const is = result.incomeStatementHistory?.incomeStatementHistory?.[0] || {};

  res.json({
    trailingPE: raw(sd.trailingPE), forwardPE: raw(sd.forwardPE),
    priceToBook: raw(ks.priceToBook), evToRevenue: raw(ks.enterpriseToRevenue),
    evToEbitda: raw(ks.enterpriseToEbitda), pegRatio: raw(ks.pegRatio),
    trailingEps: raw(ks.trailingEps), forwardEps: raw(ks.forwardEps),
    totalRevenue: raw(fd.totalRevenue), grossProfits: raw(fd.grossProfits),
    ebitda: raw(fd.ebitda), operatingIncome: raw(fd.operatingIncome),
    netIncome: raw(is.netIncome),
    grossMargins: raw(fd.grossMargins), operatingMargins: raw(fd.operatingMargins),
    profitMargins: raw(fd.profitMargins), returnOnEquity: raw(fd.returnOnEquity),
    returnOnAssets: raw(fd.returnOnAssets), revenueGrowth: raw(fd.revenueGrowth),
    earningsGrowth: raw(fd.earningsGrowth), totalCash: raw(fd.totalCash),
    totalDebt: raw(fd.totalDebt), debtToEquity: raw(fd.debtToEquity),
    currentRatio: raw(fd.currentRatio), dividendYield: raw(sd.dividendYield),
    beta: raw(sd.beta), fiftyTwoWeekHigh: raw(sd.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: raw(sd.fiftyTwoWeekLow), currency: fd.financialCurrency,
    _source: 'quoteSummary',
  });
}
