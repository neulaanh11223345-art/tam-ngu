// Lưu tiến độ học trong trình duyệt (localStorage), có xuất/nhập file sao lưu
// và hàm gộp hai bản tiến độ (dùng khi đồng bộ giữa các thiết bị).
import { dayKey, newCard, schedule } from './srs.js';

const KEY = 'tamngu:v1';

export const DEFAULT_SETTINGS = {
  levels: [3, 4],
  newPerDay: 10,
  front: { py: true, hv: false, en: false, vi: false },
  toneColors: true,
  theme: 'system',
  autoSpeak: true,
  rate: 0.9,
  dailyGoal: 15,
};

function emptyState() {
  return {
    version: 1,
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
  for (const k of ['cards', 'log', 'writing', 'saved']) {
    out[k] = raw[k] && typeof raw[k] === 'object' ? raw[k] : {};
  }
  for (const k of ['resetAt', 'settingsAt', 'savedAt']) {
    out[k] = Number(raw[k]) || 0;
  }
  return out;
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
  out.writing = {};
  for (const ch of new Set([...Object.keys(a.writing), ...Object.keys(b.writing)])) {
    const x = a.writing[ch];
    const y = b.writing[ch];
    out.writing[ch] = !x ? y : !y ? x : (y.last || 0) > (x.last || 0) ? y : x;
  }
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
      return JSON.stringify({ app: 'tam-ngu', exported: new Date(now()).toISOString(), ...state }, null, 1);
    },
    importJSON(text) {
      const raw = JSON.parse(text);
      if (!raw || raw.app !== 'tam-ngu') throw new Error('Tệp không phải bản sao lưu của Tam Ngữ');
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
      state = emptyState();
      state.settings = keep;
      state.settingsAt = keepAt;
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
