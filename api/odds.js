export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'urlパラメータが必要です' });
  if (!url.includes('keiba.go.jp')) return res.status(403).json({ error: 'keiba.go.jp以外は取得できません' });

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
        'Referer': 'https://www.keiba.go.jp/',
        'Cache-Control': 'no-cache',
      }
    });
    if (!response.ok) return res.status(500).json({ error: `HTTP ${response.status}` });

    const buffer = await response.arrayBuffer();
    let html = '';

    // EUC-JP → UTF-8
    try {
      html = new TextDecoder('euc-jp', { fatal: true }).decode(buffer);
    } catch(e1) {
      try {
        html = new TextDecoder('shift-jis', { fatal: true }).decode(buffer);
      } catch(e2) {
        html = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      }
    }

    // 日本語が含まれているか確認
    if (!/[\u3040-\u9FFF]/.test(html)) {
      // 最終手段：latin1として読んでから変換
      html = new TextDecoder('iso-8859-1', { fatal: false }).decode(buffer);
    }

    return res.status(200).json(parseOdds(html, url));
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

function clean(s) { return s.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim(); }

function parseOdds(html, url) {
  const isTan = url.includes('OddsTanFuku');
  const items = [];

  const raceM = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
  const race  = raceM ? clean(raceM[1]) : '';
  const startM = html.match(/(\d{1,2}:\d{2})発走/);
  const startTime = startM ? startM[1] : '';
  const timeM = html.match(/(\d{1,2}:\d{2})\s*(?:現在|最終)/);
  const time  = timeM ? timeM[1]+'現在' : '最終';

  if (isTan) {
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
