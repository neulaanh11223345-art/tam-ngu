// Tài khoản lớp học (máy chủ Google Apps Script của giáo viên, xem apps-script/):
// đăng nhập, nhiều tài khoản trên một máy, đồng bộ tiến độ giữa các máy và gửi bảng tóm tắt cho giáo viên.
import { ACCOUNT_URL } from './config.js';
import { levelsAvailable, word } from './data.js';
import { dayKey } from './srs.js';
import { mergeStates, normalize, stableJSON, streak } from './store.js';

const REG_KEY = 'hanlo:accounts';
const GUEST_KEY = 'tamngu:v1';
const CLASS_KEY = 'hanlo:class';
const UNLOCK_KEY = 'hanlo:unlocked';
const PUSH_DELAY = 15000;
const PULL_EVERY = 300000;

export const SEAL_COLORS = ['#a51d1d', '#2f6b45', '#355c8a', '#8f5c08', '#6d3fb0', '#b0466b'];

export const accountsEnabled = () => Boolean(ACCOUNT_URL);

function local() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// ---------- danh sách tài khoản trên máy ----------

/** {list: [{user, name, token, color, pin, base, lastSync, levelsApplied}], current, guest, guestAdopted} */
export function loadRegistry() {
  try {
    const r = JSON.parse(local()?.getItem(REG_KEY) || 'null');
    if (r && Array.isArray(r.list)) return { list: r.list, current: r.current ?? null, guest: Boolean(r.guest), guestAdopted: Boolean(r.guestAdopted) };
  } catch {
    /* bỏ qua bản hỏng */
  }
  return { list: [], current: null, guest: false, guestAdopted: false };
}

export function saveRegistry(reg) {
  try {
    local()?.setItem(REG_KEY, JSON.stringify(reg));
  } catch {
    /* bộ nhớ đầy hoặc bị chặn */
  }
}

export function currentAccount(reg = loadRegistry()) {
  return reg.list.find((a) => a.user === reg.current) || null;
}

/** Chỗ lưu tiến độ trong localStorage: khách dùng chỗ cũ, mỗi tài khoản một chỗ riêng. */
export function storeKey(acc) {
  return acc ? `${GUEST_KEY}@${acc.user}` : GUEST_KEY;
}

export function updateAccount(user, patch) {
  const reg = loadRegistry();
  const a = reg.list.find((x) => x.user === user);
  if (!a) return null;
  Object.assign(a, patch);
  saveRegistry(reg);
  return a;
}

/** "Bùi Văn Chung" → "VC", "lan" → "L". */
export function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const pick = words.length > 1 ? words.slice(-2) : words;
  return pick.map((w) => w[0].toUpperCase()).join('');
}

export function deviceLabel() {
  const ua = navigator.userAgent || '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Máy khác';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${os} · ${br}` : os;
}

// ---------- mã PIN (chống vào nhầm tài khoản trên máy dùng chung) ----------

export async function pinHash(user, pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`hanlo-pin:${user}:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isUnlocked(acc) {
  if (!acc?.pin) return true;
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === acc.user;
  } catch {
    return false;
  }
}

export function markUnlocked(user) {
  try {
    sessionStorage.setItem(UNLOCK_KEY, user);
  } catch {
    /* bỏ qua */
  }
}

/** Màn hình cần hiện trước khi vào app: null (vào thẳng), 'login' hoặc 'pin'. */
export function gateState() {
  if (!accountsEnabled()) return null;
  const reg = loadRegistry();
  const acc = currentAccount(reg);
  if (acc && acc.token) return isUnlocked(acc) ? null : 'pin';
  if (!acc && reg.guest) return null;
  return 'login';
}

// ---------- gọi máy chủ ----------

export class AccountError extends Error {
  constructor(code, data = {}) {
    super(code);
    this.code = code;
    this.data = data;
  }
}

export async function api(action, body = {}, { timeout = 30000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    // text/plain để trình duyệt không phải hỏi trước (Apps Script không trả lời yêu cầu OPTIONS)
    res = await fetch(ACCOUNT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...body }), signal: ctrl.signal, redirect: 'follow' });
  } catch {
    throw new AccountError('network');
  } finally {
    clearTimeout(t);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new AccountError(res.ok ? 'bad_response' : 'network');
  }
  if (!data || !data.ok) throw new AccountError(data?.error || 'server', data || {});
  return data;
}

export function errorText(e) {
  const code = e?.code || 'network';
  const map = {
    bad_login: 'Sai tên đăng nhập hoặc mật khẩu.',
    throttled: 'Sai mật khẩu nhiều lần. Hãy chờ 10 phút rồi thử lại, hoặc nhờ giáo viên đặt lại mật khẩu.',
    locked: 'Tài khoản đang bị khóa. Hãy hỏi giáo viên của lớp.',
    no_signup: 'Lớp chưa cho tự tạo tài khoản. Hãy nhờ giáo viên tạo cho bạn.',
    taken: 'Tên đăng nhập này đã có người dùng. Hãy chọn tên khác.',
    invalid_username: 'Tên đăng nhập cần 3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.',
    weak_password: `Mật khẩu cần ít nhất ${e?.data?.minPw || 6} ký tự.`,
    bad_token: 'Phiên đăng nhập đã hết hạn (có thể mật khẩu vừa được đổi). Hãy đăng nhập lại.',
    too_large: 'Tiến độ quá lớn để lưu lên máy chủ. Hãy báo giáo viên.',
    network: 'Không kết nối được máy chủ của lớp. Hãy kiểm tra mạng rồi thử lại.',
  };
  return map[code] || 'Máy chủ của lớp đang lỗi. Hãy thử lại sau hoặc báo giáo viên.';
}

/** Tên lớp, có cho tự tạo tài khoản không (lưu lại để mở khi không có mạng). */
export function cachedClassInfo() {
  try {
    return JSON.parse(local()?.getItem(CLASS_KEY) || 'null');
  } catch {
    return null;
  }
}

export async function fetchClassInfo() {
  const info = await api('info', {}, { timeout: 15000 });
  const out = { className: info.className || '', allowSignup: Boolean(info.allowSignup), minPw: info.minPw || 6 };
  try {
    local()?.setItem(CLASS_KEY, JSON.stringify(out));
  } catch {
    /* bỏ qua */
  }
  return out;
}

// ---------- đăng nhập, đổi, đăng xuất ----------

/** Máy này có tiến độ học khi chưa đăng nhập không (để hỏi chuyển vào tài khoản). */
export function guestProgress() {
  try {
    const s = JSON.parse(local()?.getItem(GUEST_KEY) || 'null');
    if (!s) return 0;
    return Object.keys(s.cards || {}).length + Object.keys(s.writing || {}).length + Object.keys(s.mine || {}).length;
  } catch {
    return 0;
  }
}

export async function signIn({ username, password, signup = false, name = '', adoptGuest = false }) {
  const data = await api(signup ? 'signup' : 'login', { username, password, name, device: deviceLabel() });
  const reg = loadRegistry();
  const prev = reg.list.find((a) => a.user === data.user);
  const entry = {
    color: SEAL_COLORS[reg.list.length % SEAL_COLORS.length],
    added: Date.now(),
    base: null,
    ...prev,
    user: data.user,
    name: data.name || data.user,
    token: data.token,
  };
  if (adoptGuest) {
    // chuyển tiến độ đang học như khách vào tài khoản (gộp nếu tài khoản đã có tiến độ trên máy)
    const store = local();
    const guest = store?.getItem(GUEST_KEY);
    if (guest) {
      const mine = store.getItem(storeKey(entry));
      store.setItem(storeKey(entry), mine ? JSON.stringify(mergeStates(JSON.parse(mine), JSON.parse(guest))) : guest);
    }
    reg.guestAdopted = true;
  }
  reg.list = [...reg.list.filter((a) => a.user !== data.user), entry];
  reg.current = entry.user;
  reg.guest = false;
  saveRegistry(reg);
  markUnlocked(entry.user);
  return entry;
}

export function switchTo(user) {
  const reg = loadRegistry();
  reg.current = user;
  reg.guest = false;
  saveRegistry(reg);
}

export function continueAsGuest() {
  const reg = loadRegistry();
  reg.current = null;
  reg.guest = true;
  saveRegistry(reg);
}

/** Đăng xuất và xóa tài khoản (cùng tiến độ đã lưu trên máy) khỏi máy này. */
export async function signOut(user) {
  const reg = loadRegistry();
  const acc = reg.list.find((a) => a.user === user);
  if (acc?.token) await api('logout', { user, token: acc.token }, { timeout: 8000 }).catch(() => {});
  reg.list = reg.list.filter((a) => a.user !== user);
  if (reg.current === user) {
    reg.current = null;
    reg.guest = false;
  }
  saveRegistry(reg);
  try {
    local()?.removeItem(storeKey({ user }));
  } catch {
    /* bỏ qua */
  }
}

export async function changePassword(acc, old, password) {
  await api('password', { user: acc.user, token: acc.token, old, password });
}

/** Mở lại app từ đầu (sau khi đổi tài khoản), để mọi màn hình đọc tiến độ của tài khoản mới. */
export function restartApp() {
  location.hash = '#/';
  location.reload();
}

// ---------- bảng tóm tắt gửi giáo viên ----------

function daysBack(n, now) {
  const out = new Set();
  const d = new Date(now);
  for (let i = 0; i < n; i++) {
    out.add(dayKey(d.getTime()));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

export function summarize(state, now = Date.now()) {
  const learned = {};
  let last = 0;
  for (const [id, c] of Object.entries(state.cards)) {
    if (c.last > last) last = c.last;
    if (c.state !== 'review') continue;
    const w = word(id);
    if (w) learned[w.level] = (learned[w.level] || 0) + 1;
  }
  for (const x of [...Object.values(state.writing), ...Object.values(state.dialogues)]) if (x?.last > last) last = x.last;
  const week = daysBack(7, now);
  const month = daysBack(30, now);
  let ms = 0;
  let reviews = 0;
  let good = 0;
  let bad = 0;
  for (const [day, l] of Object.entries(state.log)) {
    reviews += l.reviews || 0;
    if (week.has(day)) ms += l.ms || 0;
    if (month.has(day)) {
      good += l.good || 0;
      bad += l.bad || 0;
    }
  }
  return {
    learned,
    streak: streak(state.log, now),
    min7: Math.round(ms / 60000),
    reviews,
    acc: good + bad ? Math.round((good / (good + bad)) * 100) : null,
    dialogues: Object.keys(state.dialogues).filter((k) => !k.startsWith('mine:')).length,
    chars: Object.keys(state.writing).length,
    last: last || null,
  };
}

// ---------- đồng bộ ----------

let status = { state: 'off', last: 0, error: null };
const listeners = new Set();
let syncFn = null;

/** state: 'off' | 'syncing' | 'ok' | 'error' | 'signedout'; last: lần đồng bộ xong gần nhất. */
export function accountStatus() {
  return status;
}

export function onAccountStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(patch) {
  status = { ...status, ...patch };
  for (const fn of listeners) fn(status);
}

/** Đồng bộ ngay (nút "Đồng bộ ngay", trước khi đăng xuất). Trả về true nếu xong không lỗi. */
export async function syncNow() {
  if (!syncFn) return false;
  await syncFn(true);
  return status.state === 'ok';
}

/**
 * Bắt đầu đồng bộ tiến độ của tài khoản đang dùng với máy chủ lớp học.
 * onRemote: tiến độ trên máy vừa nhận thêm từ máy khác (vẽ lại màn hình);
 * onSignedOut(code): máy chủ không nhận phiên này nữa (đổi mật khẩu, bị khóa).
 */
export async function startAccountSync(store, acc, { onRemote, onSignedOut } = {}) {
  let base = typeof acc.base === 'number' ? acc.base : null;
  let pushedKey = null;
  let running = null;
  let again = false;
  let timer = null;
  let backoff = 0;
  let stopped = false;
  let lastPull = 0;
  const auth = () => ({ user: acc.user, token: acc.token });

  function applyMeta(r) {
    if (r.name && r.name !== acc.name) {
      acc.name = r.name;
      updateAccount(acc.user, { name: r.name });
    }
    // giáo viên đặt cấp HSK cho học viên: áp dụng mỗi khi giáo viên đổi
    const key = JSON.stringify(r.levels || null);
    if (key === (acc.levelsApplied ?? 'null')) return;
    const levels = (r.levels || []).filter((l) => levelsAvailable().includes(l));
    if (levels.length) store.setSettings({ levels });
    acc.levelsApplied = key;
    updateAccount(acc.user, { levelsApplied: key });
  }

  async function run(full) {
    setStatus({ state: 'syncing' });
    let remote = null;
    if (full || base === null) {
      const r = await api('pull', auth());
      lastPull = Date.now();
      applyMeta(r);
      base = r.updated || 0;
      remote = r.state ? normalize(r.state) : null;
      pushedKey = remote ? stableJSON(remote) : null;
    }
    for (let attempt = 0; ; attempt++) {
      const mine = store.state;
      const merged = remote ? mergeStates(mine, remote) : mine;
      const mergedKey = stableJSON(merged);
      if (remote && mergedKey !== stableJSON(mine)) {
        store.replaceState(merged, { source: 'sync' });
        onRemote?.();
      }
      if (mergedKey === pushedKey) break;
      try {
        const r = await api('push', { ...auth(), base, state: merged, summary: summarize(merged) });
        base = r.updated;
        pushedKey = mergedKey;
        break;
      } catch (e) {
        // máy khác vừa lưu: lấy bản đó, gộp rồi gửi lại
        if (e.code !== 'conflict' || attempt >= 3) throw e;
        base = e.data.updated;
        remote = normalize(e.data.state);
        pushedKey = stableJSON(remote);
      }
    }
    updateAccount(acc.user, { base, lastSync: Date.now() });
    setStatus({ state: 'ok', last: Date.now(), error: null });
  }

  async function sync(full = false) {
    if (stopped) return;
    if (running) {
      again = true;
      return running;
    }
    clearTimeout(timer);
    timer = null;
    running = (async () => {
      try {
        await run(full);
        backoff = 0;
      } catch (e) {
        if (e.code === 'bad_token' || e.code === 'locked') {
          stopped = true;
          updateAccount(acc.user, { token: null });
          setStatus({ state: 'signedout', error: e.code });
          onSignedOut?.(e.code);
          return;
        }
        console.warn('Chưa đồng bộ được tiến độ', e);
        setStatus({ state: 'error', error: e.code || 'network' });
        backoff = Math.min(backoff ? backoff * 2 : 30000, 300000);
        timer = setTimeout(() => sync(), backoff);
      }
    })();
    try {
      await running;
    } finally {
      running = null;
    }
    if (again && !stopped) {
      again = false;
      schedule(1000);
    }
  }

  function schedule(delay = PUSH_DELAY) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => sync(), Math.max(delay, backoff));
  }

  syncFn = sync;
  setStatus({ state: 'syncing', last: acc.lastSync || 0 });
  store.subscribe((_, meta) => {
    if (!meta || meta.source !== 'sync') schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (stopped) return;
    // rời app: gửi ngay phần chưa lưu; quay lại: lấy tiến độ mới từ máy khác
    if (document.visibilityState === 'hidden') {
      if (timer) sync();
    } else if (Date.now() - lastPull > 60000) {
      sync(true);
    }
  });
  window.addEventListener('online', () => sync(true));
  setInterval(() => {
    if (document.visibilityState === 'visible') sync(true);
  }, PULL_EVERY);
  await sync(true);
}
