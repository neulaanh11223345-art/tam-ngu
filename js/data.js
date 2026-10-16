// Nạp và tra cứu dữ liệu từ vựng.
import { stripTone } from './pinyin.js';

let db = null;

function fold(s) {
  // bỏ dấu tiếng Việt và dấu thanh pinyin để tìm kiếm không phân biệt dấu
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function buildIndex(raw) {
  const byId = new Map(raw.words.map((w) => [w.id, w]));
  const byHanzi = new Map(raw.words.map((w) => [w.hanzi, w]));
  const lessonById = new Map(raw.lessons.map((l) => [l.id, l]));
  const topicById = new Map(raw.topics.map((t) => [t.id, t]));
  const lessonsByLevel = {};
  for (const l of raw.lessons) (lessonsByLevel[l.level] ||= []).push(l);
  const order = raw.lessons.flatMap((l) => l.words);
  const searchText = new Map(
    raw.words.map((w) => [
      w.id,
      fold([w.hanzi, w.py.join(''), w.py.map(stripTone).join(''), w.py.map(stripTone).join('').replaceAll('ü', 'v'), w.vi, w.en, w.hv].join(' | ')),
    ]),
  );
  return { ...raw, byId, byHanzi, lessonById, topicById, lessonsByLevel, order, searchText };
}

export async function loadData(url = 'data/words.json') {
  if (db) return db;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được dữ liệu (${res.status})`);
  db = buildIndex(await res.json());
  return db;
}

export function data() {
  return db;
}

export function setData(raw) {
  db = buildIndex(raw);
  return db;
}

export const word = (id) => db.byId.get(id);
export const wordByHanzi = (hz) => db.byHanzi.get(hz);
export const lesson = (id) => db.lessonById.get(id);
export const topic = (id) => db.topicById.get(id);
export const lessonWords = (id) => lesson(id).words.map(word);

/** Tên bài: "Ăn uống · 2" (bỏ số khi chủ đề chỉ có một bài). */
export function lessonTitle(l) {
  const t = topic(l.topic);
  return l.parts > 1 ? `${t.vi} · ${l.part}` : t.vi;
}

/** Thứ tự từ để giới thiệu từ mới: theo cấp đã chọn, theo bài. */
export function studyOrder(levels) {
  return db.order.filter((id) => levels.includes(word(id).level));
}

export function search(query, limit = 40) {
  const q = fold(query.trim());
  if (!q) return [];
  const exact = [];
  const rest = [];
  for (const w of db.words) {
    const text = db.searchText.get(w.id);
    if (!text.includes(q)) continue;
    if (w.hanzi === query.trim() || fold(w.py.join('')) === q || text.startsWith(q)) exact.push(w);
    else rest.push(w);
  }
  return [...exact, ...rest].slice(0, limit);
}

/** Các từ khác có chung chữ Hán với từ này. */
export function relatedWords(w, limit = 6) {
  const ids = new Set();
  for (const ch of w.hanzi) {
    for (const id of db.chars[ch]?.words || []) if (id !== w.id) ids.add(id);
  }
  return [...ids].slice(0, limit).map(word);
}

export const charInfo = (ch) => db.chars[ch];

/** Các cấp HSK có trong dữ liệu, ví dụ [3, 4, 5]. */
export function levelsAvailable() {
  return [...new Set(db.lessons.map((l) => l.level))].sort((a, b) => a - b);
}

// ---------- hội thoại (tải riêng khi cần) ----------
let dlgPromise = null;
let dlgIndex = null;

export function loadDialogues(url = 'data/dialogues.json') {
  if (!dlgPromise) {
    dlgPromise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Không tải được hội thoại (${r.status})`);
        return r.json();
      })
      .then((raw) => {
        dlgIndex = new Map(raw.dialogues.map((d) => [d.id, d]));
        return raw.dialogues;
      });
    dlgPromise.catch(() => {
      dlgPromise = null;
    });
  }
  return dlgPromise;
}

export function setDialogues(list) {
  dlgIndex = new Map(list.map((d) => [d.id, d]));
  dlgPromise = Promise.resolve(list);
}

/** Hội thoại đã tải (gọi sau loadDialogues). */
export const dialogue = (id) => dlgIndex?.get(id);

// ---------- từ điển nhỏ để thêm pinyin cho hội thoại tự nhập ----------
let lexPromise = null;
export function loadLexicon(url = 'data/lexicon.json') {
  if (!lexPromise) {
    lexPromise = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Không tải được từ điển (${r.status})`);
      return r.json();
    });
    lexPromise.catch(() => {
      lexPromise = null;
    });
  }
  return lexPromise;
}
