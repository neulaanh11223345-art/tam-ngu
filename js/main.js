// Khởi động app, điều hướng giữa các màn hình và chuyển cảnh mượt.
import { loadData, studyOrder } from './data.js';
import { h, icon } from './dom.js';
import { startCloudSync } from './host.js';
import { initSpeech, stopSpeaking } from './speech.js';
import { buildQueue } from './srs.js';
import { createStore } from './store.js';

const routes = [
  { re: /^\/?$/, view: () => import('./views/home.js'), tab: 'home' },
  { re: /^\/lessons$/, view: () => import('./views/lessons.js'), tab: 'lessons' },
  { re: /^\/lesson\/([\w-]+)$/, view: () => import('./views/lesson.js'), tab: 'lessons' },
  { re: /^\/word\/([\w-]+)$/, view: () => import('./views/word.js'), tab: 'lessons' },
  { re: /^\/dialogues$/, view: () => import('./views/dialogues.js'), tab: 'lessons' },
  { re: /^\/(dialogue)\/([\w-]+)$/, view: () => import('./views/dialogue.js'), tab: 'lessons' },
  { re: /^\/mine\/(new)$/, view: () => import('./views/mine-edit.js'), tab: 'lessons' },
  { re: /^\/mine\/([\w-]+)\/edit$/, view: () => import('./views/mine-edit.js'), tab: 'lessons' },
  { re: /^\/(mine)\/([\w-]+)$/, view: () => import('./views/dialogue.js'), tab: 'lessons' },
  { re: /^\/review$/, view: () => import('./views/review.js'), tab: 'review' },
  { re: /^\/review\/(lesson|word|words|saved)\/?([\w,-]*)$/, view: () => import('./views/review.js'), tab: 'review' },
  { re: /^\/quiz$/, view: () => import('./views/quiz.js'), tab: 'review' },
  { re: /^\/quiz\/(lesson|words)\/([\w,-]+)$/, view: () => import('./views/quiz.js'), tab: 'review' },
  { re: /^\/write$/, view: () => import('./views/write.js'), tab: 'write' },
  { re: /^\/write\/(word|lesson|words)\/([\w,-]+)$/, view: () => import('./views/write.js'), tab: 'write' },
  { re: /^\/stats$/, view: () => import('./views/stats.js'), tab: 'stats' },
  { re: /^\/settings$/, view: () => import('./views/settings.js'), tab: 'home' },
];

const TABS = [
  ['home', '#/', 'home', 'Trang chủ'],
  ['lessons', '#/lessons', 'book', 'Bài học'],
  ['review', '#/review', 'cards', 'Ôn tập'],
  ['write', '#/write', 'pen', 'Luyện viết'],
  ['stats', '#/stats', 'chart', 'Thống kê'],
];
const TAB_ROOTS = new Set(['', '/', '/lessons', '/dialogues', '/review', '/write', '/stats']);

const store = createStore();
// giao diện sáng/tối do trang chứa app đặt (ví dụ khi mở trong Claude); app chỉ ghi đè khi người học tự chọn Sáng/Tối
let hostTheme = document.documentElement.getAttribute('data-theme');
let appliedTheme = hostTheme;
let current = null;
let currentTab = 'home';
let renderToken = 0;
const historyStack = [];
let lastActivity = 0;

function parseHash() {
  let raw = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  // cho phép liên kết ngắn như #lessons, #write
  if (!raw.startsWith('/')) raw = `/${raw}`;
  const [path, qs] = raw.split('?');
  return { path, query: new URLSearchParams(qs || '') };
}

export function navigate(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, '', hash);
    route();
  } else if (location.hash === hash) {
    route();
  } else {
    location.hash = hash;
  }
}

/** Đếm số thẻ cần ôn hôm nay (đến hạn + từ mới còn lại). */
export function dueSummary() {
  const s = store.state.settings;
  const log = store.todayLog();
  const { due, fresh } = buildQueue({
    wordIds: studyOrder(s.levels),
    cards: store.state.cards,
    now: Date.now(),
    newLimit: Math.max(0, s.newPerDay - log.fresh),
  });
  return { due: due.length, fresh: fresh.length, total: due.length + fresh.length };
}

function applyTheme() {
  const t = store.state.settings.theme;
  const want = t === 'system' ? hostTheme : t;
  const root = document.documentElement;
  appliedTheme = want;
  if (root.getAttribute('data-theme') !== want) {
    if (want) root.setAttribute('data-theme', want);
    else root.removeAttribute('data-theme');
  }
  document.body.classList.toggle('no-tone-colors', !store.state.settings.toneColors);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
}

let navEl;
function renderNav(activeTab = currentTab) {
  currentTab = activeTab;
  if (!navEl) {
    navEl = h('nav', { class: 'nav', 'aria-label': 'Điều hướng chính' });
    document.querySelector('.app').prepend(navEl);
  }
  const { total } = dueSummary();
  navEl.replaceChildren(
    h('div', { class: 'nav-brand' }, h('div', { class: 'brand-seal', 'aria-hidden': 'true' }, '语'), h('div', { class: 'brand-name' }, h('strong', null, 'Tam Ngữ'), h('small', null, 'Trung · Anh · Việt'))),
    ...TABS.map(([key, href, ic, label]) =>
      h(
        'a',
        { href, 'aria-current': key === activeTab ? 'page' : null },
        icon(ic, 24),
        h('span', null, label),
        key === 'review' && total > 0 ? h('span', { class: 'badge', 'aria-label': `${total} thẻ cần ôn` }, total > 99 ? '99+' : String(total)) : null,
      ),
    ),
  );
}

function trackActivity() {
  const now = Date.now();
  if (lastActivity && now - lastActivity < 90000) store.addStudyTime(now - lastActivity);
  lastActivity = now;
}

/** quiet: vẽ lại màn hình hiện tại tại chỗ, không chuyển cảnh, không cuộn lên đầu. */
async function route({ quiet = false } = {}) {
  const token = ++renderToken;
  const { path, query } = parseHash();
  const match = routes.map((r) => [r, path.match(r.re)]).find(([, m]) => m);
  if (!match) return navigate('#/', { replace: true });
  const [r, m] = match;

  // hướng chuyển cảnh: tab ↔ tab thì mờ dần, đi sâu thì trượt sang, quay lại thì trượt về
  const key = location.hash || '#/';
  let dir = 'forward';
  if (historyStack.length > 1 && historyStack[historyStack.length - 2] === key) {
    historyStack.pop();
    dir = 'back';
  } else if (historyStack[historyStack.length - 1] !== key) {
    historyStack.push(key);
  }
  const prevPath = current?.path;
  if (TAB_ROOTS.has(path) && (prevPath === undefined || TAB_ROOTS.has(prevPath))) dir = 'tab';

  const mod = await r.view();
  if (token !== renderToken) return;

  const ctx = {
    store,
    params: m.slice(1),
    query,
    navigate,
    dueSummary,
    activity: trackActivity,
    refreshNav: () => renderNav(r.tab),
  };

  const swap = () => {
    try {
      current?.destroy?.();
    } catch (e) {
      console.warn(e);
    }
    stopSpeaking();
    const result = mod.render(ctx);
    const main = document.querySelector('.main');
    main.replaceChildren(result.el);
    document.body.classList.toggle('immersive', Boolean(result.immersive));
    document.title = result.title ? `${result.title} · Tam Ngữ` : 'Tam Ngữ';
    current = { ...result, path };
    renderNav(r.tab);
    if (dir !== 'back' && !quiet) window.scrollTo(0, 0);
    result.mounted?.();
  };

  const root = document.documentElement;
  root.classList.remove('nav-forward', 'nav-back', 'nav-tab');
  root.classList.add(`nav-${dir}`);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (quiet) {
    swap();
  } else if (document.startViewTransition && !reduce && current) {
    document.startViewTransition(swap);
  } else {
    swap();
    if (!reduce) document.querySelector('.main > .view')?.classList.add('fallback-enter');
  }
}

let navQueued = false;
function queueNav() {
  if (navQueued) return;
  navQueued = true;
  requestAnimationFrame(() => {
    navQueued = false;
    if (navEl) renderNav();
  });
}

async function boot() {
  document.documentElement.lang = 'vi';
  applyTheme();
  try {
    await loadData();
  } catch (e) {
    document.querySelector('.main').replaceChildren(
      h('div', { class: 'boot' }, h('div', { class: 'brand-seal' }, '语'), h('p', null, 'Không tải được dữ liệu. Hãy kiểm tra mạng rồi tải lại trang.'), h('p', { class: 'small' }, String(e.message || e))),
    );
    return;
  }
  initSpeech();
  store.subscribe(() => {
    applyTheme();
    queueNav();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  // trang chứa app đổi sáng/tối (người xem bấm đổi giao diện của Claude)
  new MutationObserver(() => {
    const cur = document.documentElement.getAttribute('data-theme');
    if (cur === appliedTheme) return;
    hostTheme = cur;
    applyTheme();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('hashchange', () => route());
  window.addEventListener('pagehide', () => store.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush();
  });
  route();

  // mở qua link Claude: lưu tiến độ vào tài khoản; dữ liệu từ máy khác về thì vẽ lại màn hình
  startCloudSync(store, () => {
    if (current && !current.immersive) route({ quiet: true });
  }).catch((e) => console.warn(e));

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
