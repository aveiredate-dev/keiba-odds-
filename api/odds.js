export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
      }
    });
    if (!response.ok) return res.status(500).json({ error: `HTTP ${response.status}` });

    // Content-Typeからエンコーディング判定
    const contentType = response.headers.get('content-type') || '';
    const buffer = await response.arrayBuffer();
    
    let html;
    // まずEUC-JPで試す
    try {
      const eucDecoder = new TextDecoder('euc-jp');
      html = eucDecoder.decode(buffer);
      // 文字化けチェック：日本語が含まれているか
      if (!/[\u3040-\u9FFF]/.test(html)) {
        html = new TextDecoder('utf-8').decode(buffer);
      }
    } catch(e) {
      html = new TextDecoder('utf-8').decode(buffer);
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
  return { race, time, items };
}
