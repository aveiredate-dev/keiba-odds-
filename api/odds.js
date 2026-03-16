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

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // EUC-JPを手動でUTF-8に変換
    const html = decodeEucJp(bytes);
    return res.status(200).json(parseOdds(html, url));
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}

// EUC-JPバイト列をUTF-8文字列に変換
function decodeEucJp(bytes) {
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      // ASCII
      result += String.fromCharCode(b);
      i++;
    } else if (b === 0x8E) {
      // 半角カナ (EUC-JP SS2)
      i += 2;
      result += '?';
    } else if (b === 0x8F) {
      // JIS X 0212 (EUC-JP SS3)
      i += 3;
      result += '?';
    } else if (b >= 0xA1 && b <= 0xFE) {
      // 2バイト文字
      const b2 = bytes[i + 1];
      if (b2 >= 0xA1 && b2 <= 0xFE) {
        const codePoint = eucjpPairToUnicode(b, b2);
        if (codePoint) result += String.fromCodePoint(codePoint);
        else result += '?';
      }
      i += 2;
    } else {
      result += '?';
      i++;
    }
  }
  return result;
}

// EUC-JP 2バイトペア → Unicode変換
function eucjpPairToUnicode(b1, b2) {
  // EUC-JP → JIS X 0208
  const row = b1 - 0xA0;
  const col = b2 - 0xA0;
  // JIS → Shift-JIS → Unicode の近似変換
  let s1 = Math.floor((row - 1) / 2) + (row <= 62 ? 0x71 : 0xB1);
  let s2 = col + (row % 2 === 1 ? (col > 0x3F ? 0x40 : 0x3F) : 0x9E);
  if (s1 > 0x9F) s1 += 0x40;
  // Shift-JIS cp932デコード（簡易版：主要範囲のみ）
  try {
    const arr = new Uint8Array([s1, s2]);
    return new TextDecoder('shift-jis').decode(arr).codePointAt(0);
  } catch(e) {
    return null;
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
