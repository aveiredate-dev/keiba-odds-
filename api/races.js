export const config = { runtime: 'nodejs' };

const VENUES = [
  { babaCode:'3',  name:'帯広（ばんえい）' },
  { babaCode:'10', name:'盛岡' },
  { babaCode:'11', name:'水沢' },
  { babaCode:'18', name:'浦和' },
  { babaCode:'19', name:'船橋' },
  { babaCode:'20', name:'大井' },
  { babaCode:'21', name:'川崎' },
  { babaCode:'22', name:'金沢' },
  { babaCode:'23', name:'笠松' },
  { babaCode:'24', name:'名古屋' },
  { babaCode:'26', name:'園田' },
  { babaCode:'27', name:'姫路' },
  { babaCode:'30', name:'高知' },
  { babaCode:'32', name:'佐賀' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'dateパラメータが必要です' });

  // 全競馬場を並行取得
  const results = await Promise.all(
    VENUES.map(v => fetchVenueRaces(v, date))
  );

  const venues = results.filter(v => v && v.races.length > 0);
  return res.status(200).json({ venues });
}

async function fetchVenueRaces(venue, date) {
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
