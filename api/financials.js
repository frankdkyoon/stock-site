export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const modules = [
    'financialData',
    'defaultKeyStatistics',
    'summaryDetail',
    'incomeStatementHistory',
    'balanceSheetHistory',
  ].join(',');

  try {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com',
      }
    });
    const data = await r.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return res.status(404).json({ error: 'No data' });

    const fd = result.financialData || {};
    const ks = result.defaultKeyStatistics || {};
    const sd = result.summaryDetail || {};
    const is = result.incomeStatementHistory?.incomeStatementHistory?.[0] || {};
    const bs = result.balanceSheetHistory?.balanceSheetHistory?.[0] || {};

    const raw = v => v?.raw ?? null;
    const fmt = v => v?.fmt ?? null;

    res.json({
      // 밸류에이션
      trailingPE:     raw(sd.trailingPE),
      forwardPE:      raw(sd.forwardPE),
      priceToBook:    raw(ks.priceToBook),
      evToRevenue:    raw(ks.enterpriseToRevenue),
      evToEbitda:     raw(ks.enterpriseToEbitda),
      pegRatio:       raw(ks.pegRatio),
      // EPS
      trailingEps:    raw(ks.trailingEps),
      forwardEps:     raw(ks.forwardEps),
      // 실적
      totalRevenue:   raw(fd.totalRevenue),
      grossProfits:   raw(fd.grossProfits),
      ebitda:         raw(fd.ebitda),
      operatingIncome: raw(fd.operatingIncome),
      netIncome:      raw(is.netIncome),
      // 수익성
      grossMargins:   raw(fd.grossMargins),
      operatingMargins: raw(fd.operatingMargins),
      profitMargins:  raw(fd.profitMargins),
      returnOnEquity: raw(fd.returnOnEquity),
      returnOnAssets: raw(fd.returnOnAssets),
      // 성장
      revenueGrowth:  raw(fd.revenueGrowth),
      earningsGrowth: raw(fd.earningsGrowth),
      // 재무건전성
      totalCash:      raw(fd.totalCash),
      totalDebt:      raw(fd.totalDebt),
      debtToEquity:   raw(fd.debtToEquity),
      currentRatio:   raw(fd.currentRatio),
      // 주주환원
      dividendYield:  raw(sd.dividendYield),
      payoutRatio:    raw(sd.payoutRatio),
      beta:           raw(sd.beta),
      // 52주
      fiftyTwoWeekHigh: raw(sd.fiftyTwoWeekHigh),
      fiftyTwoWeekLow:  raw(sd.fiftyTwoWeekLow),
      currency: fd.financialCurrency,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
