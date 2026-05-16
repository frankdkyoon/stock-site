export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 한국 + 미국 지수만 (일본 제외)
  const symbols = ['^KS11', '^KQ11', '^GSPC', '^IXIC', '^DJI'];

  try {
    const results = await Promise.allSettled(
      symbols.map(sym =>
        fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
              'Referer': 'https://finance.yahoo.com',
            }
          }
        ).then(r => r.json())
      )
    );

    const data = results.map((r, i) => {
      if (r.status !== 'fulfilled') return { symbol: symbols[i], price: null, change: null, changePercent: null };
      const meta = r.value?.chart?.result?.[0]?.meta;
      if (!meta) return { symbol: symbols[i], price: null, change: null, changePercent: null };
      const price = meta.regularMarketPrice;
      const prev = meta.previousClose || meta.chartPreviousClose;
      const change = price - prev;
      return {
        symbol: symbols[i],
        price,
        previousClose: prev,
        change,
        changePercent: prev ? (change / prev) * 100 : 0,
        currency: meta.currency,
        exchangeName: meta.exchangeName,
      };
    });

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
