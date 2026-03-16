export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { date } = req.query;
  const today = date || new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    timeZone: 'Asia/Tokyo'
  }).replace(/\//g, '/');

  const url = `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/TodayRaceInfoTop`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept-Language': 'ja',
        'Referer': 'https://www.keiba.go.jp/',
        'Cache-Control': 'no-cache',
      }
    });
    if (!response.ok) return res.status(500).json({ error: `HTTP ${response.status}` });

    const buffer = await response.arrayBuffer();
    let html = '';
    try {
      html = new TextDecoder('euc-jp', { fatal: true }).decode(buffer);
    } catch(e) {
      html = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    }

    // 開催場とレース時刻を抽出
    const venues = [];
    // テーブル行から競馬場リンクと発走時刻を取得
    const rowRe = /<tr[^>]*>\s*<td[^>]*>\s*<a[^>]*k_babaCode=(\d+)[^>]*>([\s\S]*?)<\/a>\s*<\/td>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRe.exec(html)) !== null) {
      const babaCode = m[1];
      const babaName = m[2].replace(/<[^>]+>/g,'').trim();
      const rowHtml  = m[3];

      // 発走時刻を各セルから取得
      const races = [];
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let c; let rno = 1;
      while ((c = cellRe.exec(rowHtml)) !== null) {
        const cell = c[1].replace(/<[^>]+>/g,'').trim();
        const timeM = cell.match(/(\d{1,2}:\d{2})/);
        if (timeM) {
          const isSpecial = cell.includes('特別') || cell.includes('重賞') || cell.includes('準重賞');
          races.push({ rno, time: timeM[1], special: isSpecial });
        } else if (cell === '' || cell === '-') {
          // スキップ
        }
        rno++;
      }

      if (races.length > 0 && babaName) {
        venues.push({ babaCode, babaName, races });
      }
    }

    return res.status(200).json({ venues });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
