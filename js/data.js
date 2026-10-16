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
  return { ...raw, byId, lessonById, topicById, lessonsByLevel, order, searchText };
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
