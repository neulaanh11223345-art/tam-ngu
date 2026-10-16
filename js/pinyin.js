// Tiện ích pinyin: nhận biết thanh điệu, tách câu đã chú âm, tạo phương án sai cho bài kiểm tra.

const MARKS = {
  a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ',
};
const MARK_TO = {};
for (const [base, marks] of Object.entries(MARKS)) {
  [...marks].forEach((m, i) => {
    MARK_TO[m] = [base, i + 1];
    MARK_TO[m.toUpperCase()] = [base.toUpperCase(), i + 1];
  });
}

/** Thanh của một âm tiết: 1–4, 0 là thanh nhẹ. */
export function toneOf(syllable) {
  for (const ch of syllable) {
    if (MARK_TO[ch]) return MARK_TO[ch][1];
  }
  return 0;
}

/** Bỏ dấu thanh: "lǚ" → "lü". */
export function stripTone(syllable) {
  let out = '';
  for (const ch of syllable) out += MARK_TO[ch] ? MARK_TO[ch][0] : ch;
  return out;
}

/** Đặt thanh cho âm tiết theo quy tắc a/e trước, ou → o, còn lại nguyên âm cuối. */
export function withTone(syllable, tone) {
  const plain = stripTone(syllable);
  if (!tone) return plain;
  const low = plain.toLowerCase();
  let idx = low.search(/[ae]/);
  if (idx < 0) idx = low.includes('ou') ? low.indexOf('o') : Math.max(...[...low].map((c, i) => ('iouü'.includes(c) ? i : -1)));
  if (idx < 0) return plain;
  const base = plain[idx];
  let mark = MARKS[base.toLowerCase()][tone - 1];
  if (base !== base.toLowerCase()) mark = mark.toUpperCase();
  return plain.slice(0, idx) + mark + plain.slice(idx + 1);
}

/**
 * Tách câu pinyin đã lưu dạng "Wǒ xǐ|huan qù Zhōng|guó." thành các phần:
 * [{type:'word', syllables:['Wǒ']}, {type:'space'}, ..., {type:'punct', text:'.'}]
 */
export function parseSentence(py) {
  const parts = [];
  const re = /([A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙ|]+)|(\s+)|([^\sA-Za-z])/gu;
  let m;
  while ((m = re.exec(py))) {
    if (m[1]) parts.push({ type: 'word', syllables: m[1].split('|').filter(Boolean) });
    else if (m[2]) parts.push({ type: 'space' });
    else parts.push({ type: 'punct', text: m[3] });
  }
  return parts;
}

/** Pinyin liền từ, bỏ dấu ngăn âm tiết: ["xǐ","huan"] → "xǐhuan". */
export function joinSyllables(syllables) {
  return syllables.join('');
}

export function plainSentence(py) {
  return py.replaceAll('|', '');
}

/**
 * Tạo các phương án pinyin sai (đổi thanh) cho câu hỏi "chọn pinyin đúng".
 * rng: hàm trả số trong [0,1).
 */
export function toneVariants(syllables, count, rng = Math.random) {
  const correct = joinSyllables(syllables);
  const seen = new Set([correct]);
  const out = [];
  const toneable = syllables.map((s, i) => (/[aeiouü]/i.test(stripTone(s)) && s !== 'r' ? i : -1)).filter((i) => i >= 0);
  let guard = 0;
  while (out.length < count && guard++ < 200) {
    const next = [...syllables];
    const changes = Math.min(toneable.length, 1 + Math.floor(rng() * Math.min(2, toneable.length)));
    const picked = [...toneable].sort(() => rng() - 0.5).slice(0, changes);
    for (const i of picked) {
      const cur = toneOf(next[i]);
      let t = 1 + Math.floor(rng() * 4);
      if (t === cur) t = (t % 4) + 1;
      next[i] = withTone(next[i], t);
    }
    const s = joinSyllables(next);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}
