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
  { babaCode:'27', name:'園田' },
  { babaCode:'28', name:'姫路' },
  { babaCode:'30', name:'高知' },
  { babaCode:'31', name:'佐賀' },
  { babaCode:'32', name:'荒尾' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 日本時間の今日の日付
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = `${jst.getUTCFullYear()}/${String(jst.getUTCMonth()+1).padStart(2,'0')}/${String(jst.getUTCDate()).padStart(2,'0')}`;

  const results = await Promise.all(
    VENUES.map(v => fetchVenueRaces(v, date))
  );

  const venues = results.filter(v => v !== null);
  return res.status(200).json({ venues, date });
}

async function fetchVenueRaces(venue, date) {
  const url = `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceList?k_raceDate=${encodeURIComponent(date)}&k_babaCode=${venue.babaCode}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

    // 開催なしチェック
    if (!html.includes('当日メニュー') || html.includes('ご指定')) return null;

    // 実際の競馬場名をHTMLから取得
    const nameMatch = html.match(/(\d{4}年\d+月\d+日[^<]*?)([　-鿿]+競馬)/);
    const actualName = nameMatch ? nameMatch[2].replace('競馬','') : venue.name;

    const races = [];

    // HTMLのテーブル行からパース
    // <tr> ... <td>1R</td> ... <td>12:25</td> ... <td>[レース名]</td>
    // まずHTMLタグを保持したままパースする

    // | 1R | 12:25 | ... | [レース名](url) | の形式（markdown変換後）
    // または生HTMLから直接パース
    
    // 生HTMLから行を抽出
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = trRe.exec(html)) !== null) {
      const row = m[1];
      // 馬番パターン: <td>数字R</td>
      const rnoM = row.match(/<td[^>]*>\s*(\d+)R\s*<\/td>/);
      if (!rnoM) continue;
      
      const rno = parseInt(rnoM[1]);
      
      // 発走時刻
      const timeM = row.match(/<td[^>]*>\s*(\d{1,2}:\d{2})\s*<\/td>/);
      if (!timeM) continue;
      const time = timeM[1];

      // 競走種類（特別・重賞など）
      const kindM = row.match(/<td[^>]*>\s*(特別|準重賞|重賞)\s*<\/td>/);
      const special = !!kindM;

      // レース名（リンクテキスト）
      const nameM = row.match(/DebaTable[^"]*"[^>]*>([\s\S]*?)<\/a>/);
      const raceName = nameM ? nameM[1].replace(/<[^>]+>/g,'').trim() : '';

      races.push({ rno, time, raceName, special });
    }

    if (races.length === 0) return null;
    return { babaCode: venue.babaCode, babaName: actualName || venue.name, races };
  } catch(e) {
    return null;
  }
}
