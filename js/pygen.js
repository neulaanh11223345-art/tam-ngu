// Tự thêm pinyin cho câu tiếng Trung người học tự nhập (hội thoại của bạn).
// Cách làm giống công cụ dựng dữ liệu (tools/build_data.py): tách từ theo từ điển,
// sửa các chữ đa âm hay gặp, biến điệu 一/不. Không phụ thuộc DOM, dùng được trong test.
import { toneOf, withTone } from './pinyin.js';

const PUNCT = {
  '，': ',', '。': '.', '？': '?', '！': '!', '：': ':', '；': ';', '、': ',', '“': '"', '”': '"',
  '‘': "'", '’': "'", '（': '(', '）': ')', '—': '—', '…': '…', '《': '«', '》': '»', '「': '"', '」': '"',
};
const OPENING = new Set(['“', '‘', '（', '《', '「', '(']);
const NUMERALS = new Set('〇零一二两三四五六七八九十百千万亿');
const MEASURE_AFTER = new Set('一两三四五六七八九十几这那哪每半上下');
const COMPLEMENT_VERBS = new Set('找看听买吃做写学走跑拿搬睡过想说记打关回进出起来去用');
const COMPLEMENTS = new Set('到了着起动完见开懂清去来下上过好');
const ADVERB_ZHI = new Set(['只是', '只有', '只要', '只好', '只能']);
const AA_VERBS = new Set('看尝猜谈走试想听说问查');
const LETTER = /[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/;

export const isHan = (c) => c >= '一' && c <= '鿿';

function maxMatch(run, words, reverse = false) {
  const toks = [];
  if (!reverse) {
    let i = 0;
    while (i < run.length) {
      let size = 4;
      for (; size >= 2; size--) if (i + size <= run.length && words[run.slice(i, i + size)] !== undefined) break;
      if (size < 2) size = 1;
      toks.push(run.slice(i, i + size));
      i += size;
    }
    return toks;
  }
  let j = run.length;
  while (j > 0) {
    let size = 4;
    for (; size >= 2; size--) if (j - size >= 0 && words[run.slice(j - size, j)] !== undefined) break;
    if (size < 2) size = 1;
    toks.push(run.slice(j - size, j));
    j -= size;
  }
  return toks.reverse();
}

/** Tách câu (mảng ký tự) thành từ theo từ điển, ưu tiên cụm số và tên riêng có sẵn. */
export function segment(chars, lex) {
  const n = chars.length;
  const names = lex._names || (lex._names = Object.keys(lex.w).filter((k) => lex.w[k].includes(' ')).sort((a, b) => b.length - a.length));
  const fixedAtom = (i) => {
    const c = chars[i];
    if (!isHan(c)) return 1;
    for (const name of names) {
      if (chars.slice(i, i + name.length).join('') === name) return name.length;
    }
    if (c === '第' && NUMERALS.has(chars[i + 1])) {
      let j = i + 1;
      while (j < n && NUMERALS.has(chars[j])) j++;
      return j - i;
    }
    if (NUMERALS.has(c)) {
      let j = i;
      while (j < n && NUMERALS.has(chars[j])) j++;
      if (j - i > 1 || chars.slice(j, j + 2).join('') === '分钟') return j - i;
    }
    return 0;
  };
  const toks = [];
  let run = '';
  const flush = () => {
    if (!run) return;
    const fwd = maxMatch(run, lex.w);
    const bwd = maxMatch(run, lex.w, true);
    const score = (t) => [t.length, t.filter((x) => [...x].length === 1).length];
    const [a1, a2] = score(fwd);
    const [b1, b2] = score(bwd);
    const best = b1 < a1 || (b1 === a1 && b2 < a2) ? bwd : fwd;
    for (const t of best) {
      const last = toks.length ? toks[toks.length - 1].slice(-1) : '';
      // "十二个人", "这只猫": 个/只 là lượng từ, không ghép với chữ sau
      if (t.length > 1 && '个只'.includes(t[0]) && !ADVERB_ZHI.has(t) && (MEASURE_AFTER.has(last) || NUMERALS.has(last))) toks.push(t[0], t.slice(1));
      else toks.push(t);
    }
    run = '';
  };
  let i = 0;
  while (i < n) {
    const size = fixedAtom(i);
    if (size) {
      flush();
      toks.push(chars.slice(i, i + size).join(''));
      i += size;
    } else {
      run += chars[i];
      i += 1;
    }
  }
  flush();
  return toks;
}

function sandhi(chars, syls) {
  const out = [...syls];
  for (let i = 0; i + 1 < chars.length; i++) {
    const ch = chars[i];
    if (ch !== '一' && ch !== '不') continue;
    const nxt = out[i + 1];
    if (!LETTER.test(nxt || '')) continue;
    const t = chars[i + 1] === '个' ? 4 : toneOf(nxt);
    if (ch === '一') {
      const prev = i > 0 ? chars[i - 1] : '';
      if ((prev && '第十'.includes(prev)) || '日月号〇一二三四五六七八九十'.includes(chars[i + 1])) continue;
    }
    if (toneOf(out[i]) === 0) continue;
    out[i] = withTone(out[i], t === 4 ? 2 : 4);
  }
  return out;
}

/**
 * Thêm pinyin cho một câu. Trả về {py, tokens}:
 * py theo dạng dữ liệu của app ("Wǒ xǐ|huan …"), tokens là các từ đã tách (để tra nghĩa).
 */
export function annotate(zh, lex) {
  const chars = [...zh];
  const readings = chars.map((c) => (isHan(c) ? lex.c[c] || '' : c));
  const tokens = segment(chars, lex);
  const spans = [];
  let pos = 0;
  for (const tok of tokens) {
    const n = [...tok].length;
    const entry = lex.w[tok];
    if (entry !== undefined) {
      const syls = entry.replace(/ /g, '|').split('|');
      if (syls.length === n) readings.splice(pos, n, ...syls);
    }
    // động từ lặp lại (看看, 尝尝): âm sau đọc nhẹ
    if (n === 2 && tok[0] === tok[1] && AA_VERBS.has(tok[0])) readings[pos + 1] = withTone(readings[pos + 1], 0);
    spans.push([pos, pos + n, tok]);
    pos += n;
  }
  const alone = new Set(spans.filter(([a, b]) => b - a === 1).map(([a]) => a));
  chars.forEach((ch, i) => {
    if (!alone.has(i)) return;
    const prev = chars[i - 1] || '';
    const nxt = chars[i + 1] || '';
    if (ch === '得') readings[i] = nxt === '了' ? 'dé' : 'de';
    else if (ch === '地') readings[i] = '上下里方'.includes(nxt) && nxt ? 'dì' : 'de';
    else if (ch === '个') readings[i] = 'ge';
    else if (ch === '了') readings[i] = prev === '不' && i >= 2 && isHan(chars[i - 2]) ? 'liǎo' : 'le';
    else if (ch === '着') readings[i] = prev === '不' ? 'zháo' : 'zhe';
    else if (ch === '不' && i >= 1 && isHan(prev) && (('了着'.includes(nxt) && nxt) || (COMPLEMENT_VERBS.has(prev) && COMPLEMENTS.has(nxt)))) readings[i] = 'bu';
    else if (ch === '只' && MEASURE_AFTER.has(prev)) readings[i] = 'zhī';
    else if (ch === '长') readings[i] = '得大'.includes(nxt) && nxt ? 'zhǎng' : 'cháng';
    else if (ch === '量') readings[i] = nxt && '了一过量'.includes(nxt) ? 'liáng' : 'liàng';
    else if (ch === '调') readings[i] = nxt && '成到好整'.includes(nxt) ? 'tiáo' : 'diào';
    else if (ch === '结') readings[i] = nxt && '满果'.includes(nxt) ? 'jiē' : 'jié';
    else if (ch === '倒') readings[i] = nxt && '了下'.includes(nxt) ? 'dǎo' : 'dào';
    else if (ch === '假') readings[i] = prev && '天请放休'.includes(prev) ? 'jià' : 'jiǎ';
    else if (ch === '觉') readings[i] = prev && '着个睡午'.includes(prev) ? 'jiào' : 'jué';
    else if (ch === '还') readings[i] = nxt && '给钱书'.includes(nxt) ? 'huán' : 'hái';
    else if (ch === '场') readings[i] = (nxt && '雨雪病仗'.includes(nxt)) || ['大雨', '大雪', '大病'].includes(chars.slice(i + 1, i + 3).join('')) ? 'cháng' : 'chǎng';
    else if (ch === '种') readings[i] = '水树花菜'.includes(nxt) && nxt && !MEASURE_AFTER.has(prev) ? 'zhòng' : 'zhǒng';
  });
  chars.forEach((ch, i) => {
    if (ch === '一' && toneOf(readings[i]) !== 0) readings[i] = 'yī';
    if (ch === '不' && toneOf(readings[i]) !== 0) readings[i] = 'bù';
  });
  const syls = sandhi(chars, readings);

  const words = [];
  for (const [a, b, tok] of spans) {
    const part = chars.slice(a, b);
    if (part.every((c) => PUNCT[c] !== undefined || !isHan(c))) {
      for (const c of part) {
        if (/\s/.test(c)) continue;
        words.push([OPENING.has(c) ? 'open' : 'punct', PUNCT[c] ?? c]);
      }
      continue;
    }
    const entry = lex.w[tok];
    if (entry !== undefined && entry.includes(' ')) {
      for (const w of entry.split(' ')) words.push(['word', w]);
      continue;
    }
    let s = syls.slice(a, b).map((x) => x || '?');
    if (tok.length > 1 && tok.endsWith('儿') && ['ér', 'er', 'r'].includes(s[s.length - 1])) s = [...s.slice(0, -1), 'r'];
    if ((tok === '们' || tok === '儿') && words.length && words[words.length - 1][0] === 'word') {
      words[words.length - 1][1] += tok === '们' ? '|men' : 'r';
      continue;
    }
    words.push(['word', s.join('|')]);
  }
  let out = '';
  let pendingOpen = '';
  let capNext = true;
  for (const [kind, val] of words) {
    if (kind === 'punct') {
      out += val;
      if ('.?!'.includes(val)) capNext = true;
    } else if (kind === 'open') {
      pendingOpen += val;
      out += ' ';
      capNext = true;
    } else {
      if (out && !out.endsWith(' ')) out += ' ';
      out += pendingOpen + (capNext ? val.charAt(0).toUpperCase() + val.slice(1) : val);
      capNext = false;
      pendingOpen = '';
    }
  }
  out = out.replace(/\s+/g, ' ').trim().replace(/\|r(?=[ .,?!]|$)/g, 'r');
  if (out) out = out.charAt(0).toUpperCase() + out.slice(1);
  return { py: out, tokens: spans.map(([, , t]) => t) };
}

/**
 * Đọc hội thoại người học dán vào. Mỗi dòng: "Người nói：câu tiếng Trung | bản dịch (tùy chọn)".
 * Dòng không có tên người nói thì lấy người nói luân phiên A, B.
 */
export function parseDialogueText(text) {
  const lines = [];
  const cast = [];
  let alt = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [left, ...rest] = line.split(/\s*[|｜]\s*/);
    const vi = rest.join(' | ').trim();
    const m = left.match(/^([^:：，,。！？\s]{1,8})\s*[:：]\s*(.+)$/);
    let speaker;
    let zh;
    if (m) {
      speaker = m[1];
      zh = m[2].trim();
    } else {
      speaker = cast.length > 1 ? cast[alt % 2] : alt % 2 ? 'B' : 'A';
      zh = left;
    }
    if (!zh) continue;
    if (!cast.includes(speaker)) cast.push(speaker);
    alt = cast.indexOf(speaker) + 1;
    lines.push({ s: cast.indexOf(speaker), zh, vi });
  }
  return { cast, lines };
}
