export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'urlパラメータが必要です' });
  if (!url.includes('keiba.go.jp')) return res.status(403).json({ error: 'keiba.go.jp以外は取得できません' });

  // PC版URLをスマホ版に変換（UTF-8で提供される）
  const spUrl = url
    .replace('www.keiba.go.jp/KeibaWeb/TodayRaceInfo/', 'sp.keiba.go.jp/KeibaWebSP/TodayRaceInfo/S_')
    .replace('OddsTanFuku', 'OddsTanFuku')
    .replace('OddsUmLenFuku', 'OddsUmLenFuku')
    .replace('OddsUmLenTan', 'OddsUmLenTan')
    .replace('OddsWide', 'OddsWide')
    .replace('Odds3LenFuku', 'Odds3LenFuku')
    .replace('Odds3LenTan', 'Odds3LenTan');

  try {
    // まずスマホ版で試す
    let html = await fetchUtf8(spUrl);
    
    // スマホ版が失敗したらPC版をEUC-JPで試す
    if (!html) {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept-Language': 'ja',
          'Referer': 'https://www.keiba.go.jp/',
        }
      });
      if (!response.ok) return res.status(500).json({ error: `HTTP ${response.status}` });
      const buffer = await response.arrayBuffer();
      // iconv-lite なしで強制UTF-8（文字化けするが構造は取れる）
      html = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    }

    return res.status(200).json(parseOdds(html, url));
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

async function fetchUtf8(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Referer': 'https://sp.keiba.go.jp/',
      }
    });
    if (!response.ok) return null;
    const text = await response.text();
    // 日本語が含まれているか確認
    if (/[\u3040-\u9FFF]/.test(text)) return text;
    return null;
  } catch(e) {
    return null;
  }
}

function clean(s) { return s.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim(); }

function parseOdds(html, url) {
  const isTan = url.includes('OddsTanFuku');
  const items = [];

  // レース名
  const raceM = html.match(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/);
  const race  = raceM ? clean(raceM[1]) : '';

  // 発走時刻
  const startM = html.match(/(\d{1,2}:\d{2})発走/);
  const startTime = startM ? startM[1] : '';

  // オッズ時刻
  const timeM = html.match(/(\d{1,2}:\d{2})\s*(?:現在|最終)/);
  const time  = timeM ? timeM[1]+'現在' : '最終';

  if (isTan) {
    // 単勝テーブル
    const re = /<tr[^>]*>\s*<td[^>]*>\s*\d+\s*<\/td>\s*<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*[\s\S]*?<td[^>]*>\s*([\d.]+)\s*<\/td>/g;
    const seen = new Set(); let m;
    while ((m = re.exec(html)) !== null) {
      const num = m[1].trim();
      if (seen.has(num)) continue;
      const lm = m[2].match(/>([^<]+)<\/a>/);
      const name = lm ? lm[1].trim() : clean(m[2]);
      const odds = parseFloat(m[3]);
      if (!name || isNaN(odds) || odds <= 0) continue;
      items.push({ key:num, label:`${num} ${name}`, odds });
      seen.add(num);
    }
  } else {
    const re = /<td[^>]*>\s*(\d+[-]\d+(?:[-]\d+)?)\s*<\/td>\s*<td[^>]*>\s*([\d.]+)\s*<\/td>/g;
    const seen = new Set(); let m;
    while ((m = re.exec(html)) !== null) {
      const combo = m[1].trim(), odds = parseFloat(m[2]);
      if (seen.has(combo)||isNaN(odds)||odds<=0) continue;
      items.push({ key:combo, label:combo, odds });
      seen.add(combo);
    }
    items.sort((a,b)=>a.odds-b.odds);
    items.splice(30);
  }
  return { race, time, startTime, items };
}
