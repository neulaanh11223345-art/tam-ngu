// Lưu tiến độ học trong trình duyệt (localStorage), có xuất/nhập file sao lưu
// và hàm gộp hai bản tiến độ (dùng khi đồng bộ giữa các thiết bị).
import { dayKey, newCard, schedule } from './srs.js';

const KEY = 'tamngu:v1';

export const DEFAULT_SETTINGS = {
  levels: [3, 4, 5],
  newPerDay: 10,
  front: { py: true, hv: false, en: false, vi: false },
  toneColors: true,
  theme: 'system',
  autoSpeak: true,
  rate: 0.9,
  // tiếng Anh: giọng Anh-Mỹ/Anh-Anh, tốc độ riêng, tự đọc nghĩa tiếng Anh sau tiếng Trung khi lật thẻ
  enAccent: 'en-US',
  enRate: 0.95,
  autoSpeakEn: false,
  dailyGoal: 15,
  // các lớp hiện trong hội thoại và bài khóa
  dlg: { zh: true, py: true, vi: true, en: true },
  // nghe cả bài: chỉ tiếng Trung, chỉ tiếng Anh, hoặc tiếng Trung rồi tiếng Anh từng câu
  playLang: 'zh',
};

const STATE_VERSION = 3;

function emptyState() {
  return {
    version: STATE_VERSION,
    created: Date.now(),
    // mốc thời gian để gộp tiến độ giữa các thiết bị
    resetAt: 0,
    settingsAt: 0,
    savedAt: 0,
    settings: structuredClone(DEFAULT_SETTINGS),
    cards: {},
    log: {},
    writing: {},
    saved: {},
    // tiến độ hội thoại theo bài: {id: {reads, last, best}}
    dialogues: {},
    // hội thoại người học tự nhập: {id: {title, lines, created, updated, deleted?}}
    mine: {},
  };
}

const LOG_FIELDS = ['reviews', 'fresh', 'good', 'bad', 'ms', 'writes'];

function safeStorage() {
  try {
    const t = '__tamngu_test__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
  }
}

/** Gộp dữ liệu đọc được với giá trị mặc định để thêm trường mới không làm hỏng dữ liệu cũ. */
export function normalize(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...raw };
  out.settings = { ...base.settings, ...(raw.settings || {}) };
  out.settings.front = { ...base.settings.front, ...((raw.settings && raw.settings.front) || {}) };
  out.settings.dlg = { ...base.settings.dlg, ...((raw.settings && raw.settings.dlg) || {}) };
  for (const k of ['cards', 'log', 'writing', 'saved', 'dialogues', 'mine']) {
    out[k] = raw[k] && typeof raw[k] === 'object' ? raw[k] : {};
  }
  for (const k of ['resetAt', 'settingsAt', 'savedAt']) {
    out[k] = Number(raw[k]) || 0;
  }
  // bản 1 chỉ có HSK 3–4: ai đang học cả hai cấp thì được thêm HSK 5
  if ((Number(raw.version) || 1) < 2) {
    if (out.settings.levels.length === 2 && out.settings.levels.includes(3) && out.settings.levels.includes(4)) out.settings.levels = [3, 4, 5];
  }
  // bản 3 (Hán Lộ) đọc được tiếng Anh: bật sẵn lớp tiếng Anh trong bài khóa cho người học cũ
  if ((Number(raw.version) || 1) < 3) out.settings.dlg.en = true;
  out.version = STATE_VERSION;
  return out;
}

/** Bản ghi mới hơn theo trường thời gian cho trước. */
function newerBy(field) {
  return (x, y) => (!x ? y : !y ? x : (y[field] || 0) > (x[field] || 0) ? y : x);
}

function newerCard(x, y) {
  if (!x) return y;
  if (!y) return x;
  if ((x.last || 0) !== (y.last || 0)) return (x.last || 0) > (y.last || 0) ? x : y;
  return (x.reps || 0) >= (y.reps || 0) ? x : y;
}

/**
 * Gộp hai bản tiến độ của cùng một người (ví dụ điện thoại và máy tính).
 * Bản nào vừa xóa tiến độ hoặc nhập sao lưu (resetAt mới hơn) thì thắng hẳn;
 * còn lại gộp từng phần: thẻ lấy lần ôn mới nhất, nhật ký ngày lấy số lớn hơn.
 */
export function mergeStates(a, b) {
  a = normalize(a);
  b = normalize(b);
  if (a.resetAt !== b.resetAt) return a.resetAt > b.resetAt ? a : b;
  const out = normalize({
    ...a,
    created: Math.min(a.created || Infinity, b.created || Infinity),
  });
  out.created = Number.isFinite(out.created) ? out.created : Date.now();
  if (b.settingsAt > a.settingsAt) {
    out.settings = b.settings;
    out.settingsAt = b.settingsAt;
  }
  if (b.savedAt > a.savedAt) {
    out.saved = b.saved;
    out.savedAt = b.savedAt;
  }
  out.cards = {};
  for (const id of new Set([...Object.keys(a.cards), ...Object.keys(b.cards)])) {
    out.cards[id] = newerCard(a.cards[id], b.cards[id]);
  }
  out.log = {};
  for (const day of new Set([...Object.keys(a.log), ...Object.keys(b.log)])) {
    const x = a.log[day] || {};
    const y = b.log[day] || {};
    out.log[day] = Object.fromEntries(LOG_FIELDS.map((f) => [f, Math.max(x[f] || 0, y[f] || 0)]));
  }
  const mergeMap = (key, pick) => {
    out[key] = {};
    for (const id of new Set([...Object.keys(a[key]), ...Object.keys(b[key])])) out[key][id] = pick(a[key][id], b[key][id]);
  };
  mergeMap('writing', newerBy('last'));
  mergeMap('dialogues', newerBy('last'));
  mergeMap('mine', newerBy('updated'));
  return out;
}

/** JSON với khóa đã sắp xếp, để so sánh hai bản tiến độ. */
export function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJSON(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function createStore(storage = safeStorage(), now = () => Date.now()) {
  let state;
  try {
    state = normalize(JSON.parse(storage.getItem(KEY) || 'null'));
  } catch {
    state = emptyState();
  }
  const listeners = new Set();
  let timer = null;

  function persist() {
    timer = null;
    try {
      storage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Không lưu được tiến độ', e);
    }
  }

  function changed(meta = {}) {
    if (!timer) timer = setTimeout(persist, 150);
    for (const fn of listeners) fn(state, meta);
  }

  function today() {
    const k = dayKey(now());
    if (!state.log[k]) state.log[k] = { reviews: 0, fresh: 0, good: 0, bad: 0, ms: 0, writes: 0 };
    return state.log[k];
  }

  return {
    get state() {
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        persist();
      }
    },
    setSettings(patch) {
      state.settings = { ...state.settings, ...patch };
      state.settingsAt = now();
      changed();
    },
    /** Thay toàn bộ tiến độ (sau khi gộp với bản trên máy khác). */
    replaceState(next, meta = {}) {
      state = normalize(next);
      changed(meta);
    },
    card(id) {
      return state.cards[id] || newCard(id);
    },
    /** Chấm điểm một thẻ, ghi nhật ký ngày. Trả về thẻ mới. */
    rate(id, rating) {
      const before = state.cards[id] || newCard(id);
      const after = schedule(before, rating, now());
      state.cards[id] = after;
      const log = today();
      log.reviews += 1;
      if (before.state === 'new') log.fresh += 1;
      if (rating === 1) log.bad += 1;
      else log.good += 1;
      changed();
      return after;
    },
    /** Đặt lại thẻ về trạng thái trước (hoàn tác). */
    restore(id, card, wasNew) {
      if (wasNew) delete state.cards[id];
      else state.cards[id] = card;
      const log = today();
      log.reviews = Math.max(0, log.reviews - 1);
      changed();
    },
    addStudyTime(ms) {
      if (ms <= 0) return;
      today().ms += Math.min(ms, 120000);
      changed();
    },
    recordQuiz(correct) {
      const log = today();
      if (correct) log.good += 1;
      else log.bad += 1;
      changed();
    },
    recordWriting(char, mistakes) {
      const w = state.writing[char] || { n: 0, mistakes: 0, best: null, last: 0 };
      w.n += 1;
      w.mistakes += mistakes;
      w.best = w.best === null ? mistakes : Math.min(w.best, mistakes);
      w.lastMistakes = mistakes;
      w.last = now();
      state.writing[char] = w;
      today().writes += 1;
      changed();
    },
    /** Ghi lại một lần đọc/luyện hội thoại; score: tỉ lệ đúng khi điền từ (0–1). */
    recordDialogue(id, score) {
      const d = state.dialogues[id] || { reads: 0, last: 0, best: null };
      d.reads += 1;
      d.last = now();
      if (typeof score === 'number') d.best = d.best === null ? score : Math.max(d.best, score);
      state.dialogues[id] = d;
      changed();
      return d;
    },
    /** Lưu hội thoại tự nhập (tạo mới nếu chưa có id). Trả về id. */
    saveMine(id, data) {
      const t = now();
      const key = id || `m${t.toString(36)}`;
      const prev = state.mine[key];
      state.mine[key] = { ...data, created: prev?.created || t, updated: t };
      changed();
      return key;
    },
    deleteMine(id) {
      if (!state.mine[id]) return;
      // giữ dấu đã xóa để máy khác đồng bộ cũng xóa theo
      state.mine[id] = { deleted: true, created: state.mine[id].created, updated: now() };
      changed();
    },
    toggleSaved(id) {
      if (state.saved[id]) delete state.saved[id];
      else state.saved[id] = now();
      state.savedAt = now();
      changed();
      return Boolean(state.saved[id]);
    },
    todayLog() {
      return state.log[dayKey(now())] || { reviews: 0, fresh: 0, good: 0, bad: 0, ms: 0, writes: 0 };
    },
    exportJSON() {
      // giữ mã 'tam-ngu' (tên cũ của app) để bản sao lưu cũ và mới đều nhập được
      return JSON.stringify({ app: 'tam-ngu', exported: new Date(now()).toISOString(), ...state }, null, 1);
    },
    importJSON(text) {
      const raw = JSON.parse(text);
      if (!raw || raw.app !== 'tam-ngu') throw new Error('Tệp không phải bản sao lưu của Hán Lộ (Tam Ngữ)');
      delete raw.app;
      delete raw.exported;
      state = normalize(raw);
      // bản sao lưu vừa nhập thay hẳn tiến độ đang có trên mọi thiết bị
      state.resetAt = now();
      changed();
      persist();
    },
    reset() {
      const keep = state.settings;
      const keepAt = state.settingsAt;
      const mine = state.mine;
      state = emptyState();
      state.settings = keep;
      state.settingsAt = keepAt;
      // hội thoại tự nhập là nội dung của người học, không phải tiến độ: giữ lại
      state.mine = mine;
      state.resetAt = now();
      changed();
      persist();
    },
  };
}

/** Chuỗi ngày học liên tiếp tính đến hôm nay (hôm nay chưa học vẫn giữ chuỗi của hôm qua). */
export function streak(log, now = Date.now()) {
  const active = (k) => {
    const d = log[k];
    return d && (d.reviews > 0 || d.writes > 0 || d.good + d.bad > 0);
  };
  let count = 0;
  const d = new Date(now);
  if (!active(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  while (active(dayKey(d.getTime()))) {
    count += 1;
    d.setDate(d.getDate() - 1);
  }
  return count;
}
