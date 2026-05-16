export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code required' });

  // 종목 코드에서 숫자만 추출 (005930.KS → 005930)
  const naverCode = code.replace(/\.(KS|KQ)$/i, '');

  try {
    const url = `https://finance.naver.com/item/main.naver?code=${naverCode}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Referer': 'https://finance.naver.com/',
        'Cache-Control': 'no-cache',
      }
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();

    // HTML에서 데이터 추출
    const extract = (id) => {
      const m = html.match(new RegExp(`id="${id}"[^>]*>([\\d.,N\\/A\\-]+)<`));
      return m ? m[1].trim().replace(/,/g, '') : null;
    };

    // 재무제표 테이블 파싱 (연간 실적)
    const parseFinTable = () => {
      try {
        // 네이버 재무 요약 테이블
        const tableMatch = html.match(/주요재무정보[\s\S]*?(<table[\s\S]*?<\/table>)/);
        if (!tableMatch) return null;
        const rows = [];
        const rowMatches = tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
        for (const row of rowMatches) {
          const cells = [...row[1].matchAll(/<t[dh][^>]*>[\s]*<[^>]*>([^<]*)<\/[^>]*>[\s]*<\/t[dh]>|<t[dh][^>]*>([^<]*)<\/t[dh]>/g)];
          if (cells.length) rows.push(cells.map(c => (c[1] || c[2] || '').trim()));
        }
        return rows;
      } catch { return null; }
    };

    const per = extract('_per');
    const eps = extract('_eps');
    const pbr = extract('_pbr');
    const cper = extract('_cper'); // 추정 PER
    const ceps = extract('_ceps'); // 추정 EPS
    const dvr = extract('_dvr');   // 배당수익률
    const roe = extract('_roe');   // ROE

    // 시가총액 파싱
    const mktCapMatch = html.match(/시가총액[\s\S]*?<span[^>]*>([\d,]+)<\/span>[\s]*억/);
    const mktCap = mktCapMatch ? parseInt(mktCapMatch[1].replace(/,/g, '')) * 1e8 : null;

    // 업종 PER
    const sectorPerMatch = html.match(/동일업종 PER[\s\S]*?([\d.]+)배/);
    const sectorPer = sectorPerMatch ? parseFloat(sectorPerMatch[1]) : null;

    // 상장주식수
    const sharesMatch = html.match(/상장주식수[\s\S]*?<span[^>]*>([\d,]+)<\/span>/);
    const shares = sharesMatch ? parseInt(sharesMatch[1].replace(/,/g, '')) * 1000 : null;

    res.json({
      source: 'naver',
      code: naverCode,
      per: per && per !== 'N/A' ? parseFloat(per) : null,
      eps: eps && eps !== 'N/A' ? parseInt(eps) : null,
      pbr: pbr && pbr !== 'N/A' ? parseFloat(pbr) : null,
      forwardPer: cper && cper !== 'N/A' ? parseFloat(cper) : null,
      forwardEps: ceps && ceps !== 'N/A' ? parseInt(ceps) : null,
      dividendYield: dvr && dvr !== 'N/A' ? parseFloat(dvr) / 100 : null,
      roe: roe && roe !== 'N/A' ? parseFloat(roe) / 100 : null,
      marketCap: mktCap,
      sectorPer,
      shares,
    });
  } catch (e) {
    // 실패 시 Yahoo Finance fallback
    try {
      const sym = naverCode.length === 6 && !isNaN(naverCode) ? naverCode + '.KS' : code;
      const url2 = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=defaultKeyStatistics,summaryDetail,financialData`;
      const r2 = await fetch(url2, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com' }
      });
      const d2 = await r2.json();
      const rs = d2?.quoteSummary?.result?.[0];
      if (!rs) return res.status(404).json({ error: 'No data available' });
      const sd = rs.summaryDetail || {}, ks = rs.defaultKeyStatistics || {}, fd = rs.financialData || {};
      const raw = v => v?.raw ?? null;
      return res.json({
        source: 'yahoo_fallback',
        per: raw(sd.trailingPE),
        eps: raw(ks.trailingEps),
        pbr: raw(ks.priceToBook),
        forwardPer: raw(sd.forwardPE),
        forwardEps: raw(ks.forwardEps),
        dividendYield: raw(sd.dividendYield),
        roe: raw(fd.returnOnEquity),
        marketCap: raw(sd.marketCap),
      });
    } catch (e2) {
      res.status(500).json({ error: 'Both Naver and Yahoo failed', detail: e.message });
    }
  }
}
