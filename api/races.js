export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const response = await fetch('https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/TodayRaceInfoTop', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ja',
        'Referer': 'https://www.keiba.go.jp/',
        'Cache-Control': 'no-cache',
      }
    });
    if (!response.ok) return res.status(500).json({ error: `HTTP ${response.status}` });

    const buffer = await response.arrayBuffer();
    let html;
    try {
      html = new TextDecoder('euc-jp', { fatal: true }).decode(buffer);
    } catch(e) {
      html = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    }

    const venues = [];

    // テーブル行を抽出: [競馬場リンク] | 時刻 | 時刻 | ...
    const rowRe = /\[([^\]]+)\]\(https:\/\/www\.keiba\.go\.jp\/KeibaWeb\/TodayRaceInfo\/RaceList\?k_raceDate=([^&]+)&k_babaCode=(\d+)\)\s*\|(.*?)(?=\n\||\n\n)/gs;
    let m;
    while ((m = rowRe.exec(html)) !== null) {
      const babaName = m[1].trim();
      const raceDate = decodeURIComponent(m[2]);
      const babaCode = m[3];
      const cellsStr = m[4];

      // 各セルから時刻を抽出
      const cells = cellsStr.split('|').map(c => c.trim());
      const races = [];
      let rno = 1;
      for (const cell of cells) {
        if (cell === '' || cell === '払戻金') continue;
        const timeM = cell.match(/(\d{1,2}:\d{2})/);
        if (timeM) {
          const special = cell.includes('特別') || cell.includes('重賞') || cell.includes('準重賞');
          races.push({ rno, time: timeM[1], special });
          rno++;
        } else if (cell === '-' || cell === '') {
          rno++;
        }
      }

      if (races.length > 0) {
        venues.push({ babaCode, babaName: babaName.replace('ば', '（ばんえい）').replace(/ば$/, '（ばんえい）'), races, raceDate });
      }
    }

    return res.status(200).json({ venues });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}async function fetchVenueRaces(venue, date) {
  const url = `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceList?k_raceDate=${encodeURIComponent(date)}&k_babaCode=${venue.babaCode}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept-Language': 'ja',
        'Referer': 'https://www.keiba.go.jp/',
        'Cache-Control': 'no-cache',
      }
    });
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    let html;
    try {
      html = new TextDecoder('euc-jp', { fatal: true }).decode(buffer);
    } catch(e) {
      html = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    }

    // 「当日メニュー」テーブルからレース情報を抽出
    // | 1R | 14:00 | ... | レース名 | ... |
    const races = [];
    const rowRe = /\|\s*(\d+)R\s*\|\s*(\d{1,2}:\d{2})\s*\|([^|]*)\|([^|]*)\|\s*\[([^\]]+)\]/g;
    let m;
    while ((m = rowRe.exec(html)) !== null) {
      const rno      = parseInt(m[1]);
      const time     = m[2].trim();
      const kind     = m[3].trim(); // 特別・重賞など
      const raceName = m[5].trim();
      const special  = kind.includes('特別') || kind.includes('重賞') || kind.includes('準重賞');
      races.push({ rno, time, raceName, special });
    }

    if (races.length === 0) return null;
    return { babaCode: venue.babaCode, babaName: venue.name, races };
  } catch(e) {
    return null;
  }
}
