// Tính năng thêm khi app được mở qua link Claude (artifact): lưu tệp và đồng bộ tiến độ
// vào tài khoản. Trên web thường (GitHub Pages, máy cá nhân) không có window.claude,
// các hàm ở đây tự lùi về cách làm thông thường.
import { h } from './dom.js';
import { mergeStates, normalize, stableJSON } from './store.js';

const runtime = typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function' ? window.claude : null;
const using = new Map();

function use(name) {
  if (!runtime) return Promise.resolve(null);
  if (!using.has(name)) using.set(name, Promise.resolve(runtime.use(name)).catch(() => null));
  return using.get(name);
}

// hỏi trước để lúc bấm nút đã sẵn sàng
if (runtime) use('downloads');

/** Lưu tệp văn bản về máy. Trả về 'saved', 'declined' hoặc 'failed'. */
export async function saveTextFile(filename, text) {
  const downloads = await use('downloads');
  if (downloads) {
    try {
      await downloads.save({ filename, data: text });
      return 'saved';
    } catch (e) {
      return e && e.code === 'declined' ? 'declined' : 'failed';
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: filename, hidden: true });
    document.body.append(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

// ---------- đồng bộ tiến độ ----------
const MAX_DOC = 240000;
const PUSH_DELAY = 12000;
let status = 'off';
const statusListeners = new Set();

function setStatus(s) {
  status = s;
  for (const fn of statusListeners) fn(s);
}

/** 'off' (không có đồng bộ), 'connecting', 'on' hoặc 'error'. */
export function syncStatus() {
  return status;
}

export function onSyncStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

function trimForCloud(state) {
  let json = JSON.stringify(state);
  if (json.length <= MAX_DOC) return json;
  // giữ nhật ký 1 năm gần nhất nếu bản lưu quá lớn
  const cutoff = Object.keys(state.log).sort().slice(-366)[0];
  const log = Object.fromEntries(Object.entries(state.log).filter(([k]) => k >= cutoff));
  json = JSON.stringify({ ...state, log });
  return json.length <= MAX_DOC ? json : null;
}

/**
 * Bật đồng bộ khi trang chạy trong Claude và người xem có tài khoản.
 * onRemote(initial) được gọi khi tiến độ trên máy này vừa nhận thêm dữ liệu từ máy khác.
 */
export async function startCloudSync(store, onRemote) {
  if (!runtime) return;
  setStatus('connecting');
  const [db, user] = await Promise.all([use('db'), use('user')]);
  const uid = user ? await user.id().catch(() => null) : null;
  if (!db || !uid) {
    setStatus('off');
    return;
  }
  let ref;
  try {
    ref = db.doc(`data/users/${uid}/progress`);
  } catch {
    setStatus('off');
    return;
  }

  let running = false;
  let again = false;
  let timer = null;
  let backoff = 0;

  async function pull() {
    const snap = await ref.get();
    if (!snap.exists) return null;
    const body = snap.data();
    if (!body || typeof body.json !== 'string') return null;
    try {
      return normalize(JSON.parse(body.json));
    } catch {
      return null;
    }
  }

  async function sync(initial = false) {
    if (running) {
      again = true;
      return;
    }
    running = true;
    clearTimeout(timer);
    timer = null;
    try {
      const remote = await pull();
      const local = store.state;
      const merged = remote ? mergeStates(local, remote) : local;
      const mergedKey = stableJSON(merged);
      if (remote && mergedKey !== stableJSON(local)) {
        store.replaceState(merged, { source: 'sync' });
        onRemote?.(initial);
      }
      if (!remote || mergedKey !== stableJSON(remote)) {
        const json = trimForCloud(merged);
        if (json) await ref.set({ v: 1, updated: Date.now(), json });
      }
      backoff = 0;
      setStatus('on');
    } catch (e) {
      const code = e && e.code;
      if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') {
        setStatus('off');
        running = false;
        return;
      }
      console.warn('Chưa đồng bộ được tiến độ', e);
      setStatus('error');
      backoff = Math.min(backoff ? backoff * 2 : 30000, 300000);
      timer = setTimeout(() => sync(), backoff);
    } finally {
      running = false;
    }
    if (again) {
      again = false;
      schedule();
    }
  }

  function schedule(delay = PUSH_DELAY) {
    if (status === 'off') return;
    clearTimeout(timer);
    timer = setTimeout(() => sync(), Math.max(delay, backoff));
  }

  store.subscribe((_, meta) => {
    if (!meta || meta.source !== 'sync') schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (status === 'off') return;
    // rời trang: đẩy ngay phần chưa lưu; quay lại: lấy tiến độ mới từ máy khác
    if (document.visibilityState === 'hidden') {
      if (timer) sync();
    } else {
      sync();
    }
  });
  await sync(true);
}
