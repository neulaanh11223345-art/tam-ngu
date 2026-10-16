// Tạo câu hỏi kiểm tra (không phụ thuộc DOM, dùng được trong test).
import { joinSyllables, toneVariants } from './pinyin.js';

export const TYPES = ['meaning', 'hanzi', 'pinyin', 'listen', 'fill'];

export const TYPE_LABELS = {
  meaning: 'Chọn nghĩa đúng',
  hanzi: 'Chọn chữ Hán đúng',
  pinyin: 'Chọn pinyin đúng',
  listen: 'Nghe và chọn từ',
  fill: 'Điền từ vào câu',
};

/** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32). */
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Chọn n từ gây nhiễu: ưu tiên cùng chủ đề, cùng cấp, cùng độ dài; loại các từ trùng khóa hiển thị. */
export function pickDistractors(word, pool, n, rng, keyOf) {
  const used = new Set([keyOf(word)]);
  const scored = shuffle(pool, rng)
    .filter((w) => w.id !== word.id)
    .map((w) => {
      let s = rng();
      if (w.topic === word.topic) s += 2;
      if (w.level === word.level) s += 1;
      if (w.hanzi.length === word.hanzi.length) s += 1;
      if (w.pos && w.pos === word.pos) s += 1;
      return [s, w];
    })
    .sort((a, b) => b[0] - a[0]);
  const out = [];
  for (const [, w] of scored) {
    const k = keyOf(w);
    if (used.has(k)) continue;
    // tránh nghĩa quá giống nhau (một nghĩa nằm trong nghĩa kia)
    if (keyOf === meaningKey && [...used].some((u) => u.includes(k) || k.includes(u))) continue;
    used.add(k);
    out.push(w);
    if (out.length === n) break;
  }
  return out;
}

const meaningKey = (w) => w.vi.split(/[;,]/)[0].trim().toLowerCase();
const hanziKey = (w) => w.hanzi;

function options(correct, others, rng, toOption) {
  const all = shuffle([correct, ...others], rng);
  return { options: all.map(toOption), answer: all.indexOf(correct) };
}

/** Câu ví dụ có chỗ trống thay cho từ đang hỏi. */
export function blankSentence(word) {
  const zh = word.ex.zh;
  const i = zh.indexOf(word.hanzi);
  if (i < 0) return null;
  return { before: zh.slice(0, i), after: zh.slice(i + word.hanzi.length) };
}

export function makeQuestion(type, word, pool, rng) {
  if (type === 'meaning') {
    const others = pickDistractors(word, pool, 3, rng, meaningKey);
    if (others.length < 3) return null;
    return { type, word, ...options(word, others, rng, (w) => ({ id: w.id, main: w.vi, sub: w.en })) };
  }
  if (type === 'hanzi' || type === 'listen') {
    const others = pickDistractors(word, pool, 3, rng, hanziKey);
    if (others.length < 3) return null;
    return { type, word, ...options(word, others, rng, (w) => ({ id: w.id, main: w.hanzi, zh: true })) };
  }
  if (type === 'pinyin') {
    const correct = joinSyllables(word.py);
    let wrong = toneVariants(word.py, 3, rng);
    if (wrong.length < 3) {
      const extra = pickDistractors(word, pool, 6, rng, (w) => joinSyllables(w.py))
        .map((w) => joinSyllables(w.py))
        .filter((p) => p !== correct && !wrong.includes(p));
      wrong = [...wrong, ...extra].slice(0, 3);
    }
    if (wrong.length < 3) return null;
    const all = shuffle([correct, ...wrong], rng);
    return { type, word, options: all.map((p) => ({ id: p === correct ? word.id : null, main: p })), answer: all.indexOf(correct) };
  }
  if (type === 'fill') {
    const blank = blankSentence(word);
    if (!blank) return null;
    const others = pickDistractors(word, pool.filter((w) => !word.ex.zh.includes(w.hanzi)), 3, rng, hanziKey);
    if (others.length < 3) return null;
    return { type, word, blank, ...options(word, others, rng, (w) => ({ id: w.id, main: w.hanzi, zh: true })) };
  }
  return null;
}

/**
 * Tạo một bài kiểm tra.
 * targets: các từ cần hỏi; pool: tất cả từ dùng làm phương án nhiễu.
 */
export function makeQuiz({ targets, pool, count = 10, types = TYPES, rng = makeRng() }) {
  const picked = shuffle(targets, rng).slice(0, count);
  const qs = [];
  picked.forEach((word, i) => {
    const order = shuffle(types, rng);
    // xoay vòng dạng câu để bài kiểm tra đa dạng
    const first = types[i % types.length];
    for (const t of [first, ...order]) {
      const q = makeQuestion(t, word, pool, rng);
      if (q) {
        qs.push(q);
        break;
      }
    }
  });
  return qs;
}
