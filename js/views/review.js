// Ôn tập bằng thẻ: lật thẻ 3D, vuốt trái/phải để chấm, lặp lại ngắt quãng.
import { lesson, lessonTitle, studyOrder, word } from '../data.js';
import { button, emptyState, h, icon, meaningRow, pinyinWord, prefersReducedMotion, vibrate, zh } from '../dom.js';
import { hasVoice, speak } from '../speech.js';
import { AGAIN, EASY, GOOD, HARD, buildQueue, isDueToday, previewLabels } from '../srs.js';
import { confetti, exampleBlock, miniSay, sayAs, speakButton } from './common.js';

const LAYERS = [
  ['py', 'Pinyin'],
  ['hv', 'Hán Việt'],
  ['en', 'English'],
  ['vi', 'Tiếng Việt'],
];
const RATINGS = [
  [AGAIN, 'Quên', 'again'],
  [HARD, 'Khó', 'hard'],
  [GOOD, 'Nhớ', 'good'],
  [EASY, 'Dễ', 'easy'],
];

function sessionIds(ctx) {
  const { store, params, query } = ctx;
  const s = store.state.settings;
  const now = Date.now();
  const [mode, arg] = params;
  if (mode === 'lesson') {
    const l = lesson(arg);
    if (!l) return { ids: [], title: 'Ôn tập' };
    const due = l.words.filter((id) => isDueToday(store.state.cards[id], now));
    const fresh = l.words.filter((id) => !store.state.cards[id] || store.state.cards[id].state === 'new');
    const ids = [...due, ...fresh];
    return { ids: ids.length ? ids : [...l.words], title: lessonTitle(l), cram: ids.length === 0 };
  }
  if (mode === 'word') return { ids: word(arg) ? [arg] : [], title: 'Ôn từ' };
  if (mode === 'words') return { ids: arg.split(',').filter((id) => word(id)), title: 'Ôn lại' };
  if (mode === 'saved') return { ids: Object.keys(store.state.saved).filter((id) => word(id)), title: 'Sổ từ đã lưu' };
  const extra = Number(query.get('extra') || 0) * 5;
  const log = store.todayLog();
  const { due, fresh } = buildQueue({
    wordIds: studyOrder(s.levels),
    cards: store.state.cards,
    now,
    newLimit: Math.max(0, s.newPerDay - log.fresh) + extra,
  });
  return { ids: [...due, ...fresh], title: 'Ôn tập hôm nay', daily: true };
}

export function render(ctx) {
  const { store } = ctx;
  const { ids, title, daily } = sessionIds(ctx);
  const total = ids.length;
  const queue = [...ids];
  const finished = new Set();
  const stats = { seen: 0, again: 0, start: Date.now() };
  let index = 0;
  let revealed = false;
  let undoStack = [];
  let busy = false;

  const el = h('div', { class: 'view full' });

  if (!total) {
    el.append(
      h('header', { class: 'topbar' }, h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Về trang chủ' }, icon('close', 24)), h('span', { class: 'topbar-title' }, title)),
      emptyState(
        'Hôm nay không còn thẻ nào',
        'Bạn đã ôn hết thẻ đến hạn. Có thể học thêm từ mới hoặc làm một bài kiểm tra nhanh.',
        h('div', { class: 'done-actions' }, button('Học thêm 5 từ mới', { href: '#/review?extra=1', icon: 'sparkle' }), button('Kiểm tra nhanh', { href: '#/quiz', variant: 'secondary', icon: 'list' })),
      ),
    );
    return { el, title, immersive: true };
  }

  // ---- khung màn hình ----
  const progressFill = h('span', { class: 'bar-fill' });
  const progress = h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Tiến độ buổi ôn', 'aria-valuemin': '0', 'aria-valuemax': String(total) }, progressFill);
  const countEl = h('span', { class: 'session-count' });
  const undoBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Hoàn tác thẻ vừa chấm', title: 'Hoàn tác', disabled: true }, icon('undo', 22));
  const top = h('header', { class: 'session-top' }, h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Thoát buổi ôn' }, icon('close', 24)), progress, countEl, undoBtn);

  const chips = LAYERS.map(([key, label]) => {
    const b = h('button', { type: 'button', class: 'tchip', 'aria-pressed': String(Boolean(store.state.settings.front[key])) }, icon('check', 14), h('span', null, label));
    b.addEventListener('click', () => {
      const front = { ...store.state.settings.front, [key]: !store.state.settings.front[key] };
      store.setSettings({ front });
      b.setAttribute('aria-pressed', String(front[key]));
      if (!revealed) drawCard(false);
    });
    return b;
  });
  const toggles = h('section', { class: 'layer-toggles' }, h('p', null, 'Hiện sẵn ở mặt trước'), h('div', { class: 'toggle-chips', role: 'group', 'aria-label': 'Lớp hiện ở mặt trước' }, chips));

  const stage = h('div', { class: 'stage' });
  const bottom = h('div', { class: 'session-bottom' });
  el.append(top, toggles, stage, bottom);

  function updateProgress() {
    const done = finished.size;
    progressFill.style.width = `${(done / total) * 100}%`;
    progress.setAttribute('aria-valuenow', String(done));
    countEl.textContent = `${Math.min(done + 1, total)}/${total}`;
    undoBtn.disabled = undoStack.length === 0;
  }

  function cardKind(id) {
    const c = store.state.cards[id];
    if (!c || c.state === 'new') return 'Từ mới';
    if (c.state === 'review') return 'Ôn lại';
    return 'Đang học';
  }

  function layerBlock(w, show, withSay = false) {
    return [
      show.py ? pinyinWord(w.py, 'fc-py') : null,
      show.hv ? h('div', { class: 'hv' }, w.hv) : null,
      show.vi || show.en
        ? h(
            'div',
            { class: 'fc-meanings' },
            show.vi ? meaningRow('VI', w.vi, { class: 'vi', end: withSay ? miniSay(w.vi, store, 'vi') : null }) : null,
            show.en ? meaningRow('EN', w.en, { class: 'en', lang: 'en', end: withSay ? miniSay(w.en, store, 'en') : null }) : null,
          )
        : null,
    ];
  }

  let wrap = null;
  function drawCard(animate = true) {
    const id = queue[index];
    const w = word(id);
    const front = store.state.settings.front;
    const long = w.hanzi.length >= 3 ? 'long' : '';
    const fc = h('div', { class: 'fc', role: 'button', tabindex: '0', 'aria-label': revealed ? `Mặt sau thẻ ${w.hanzi}` : `Thẻ ${w.hanzi}. Chạm để lật` });
    const frontFace = h(
      'div',
      { class: 'fc-face fc-front' },
      h('div', { class: 'fc-head' }, h('span', { class: 'badge-soft badge-gray' }, `HSK ${w.level} · ${cardKind(id)}`), speakButton(w.hanzi, store)),
      h('div', { class: 'fc-center' }, zh(w.hanzi, `fc-hz ${long}`), layerBlock(w, front)),
      h('p', { class: 'fc-hint' }, 'Chạm thẻ để lật · nhớ nghĩa trước khi xem'),
    );
    const backFace = h(
      'div',
      { class: 'fc-face fc-back' },
      h('div', { class: 'fc-head' }, h('span', { class: 'badge-soft badge-gray' }, `HSK ${w.level} · ${w.pos || 'từ'}`), speakButton(w.hanzi, store)),
      h('div', { class: 'fc-center', style: { flex: 'none', padding: '8px 0' } }, zh(w.hanzi, `fc-hz ${long}`), layerBlock(w, { py: true, hv: true, en: true, vi: true }, true)),
      exampleBlock(w, store),
      h('a', { href: `#/word/${w.id}`, class: 'small', style: { marginTop: '12px', alignSelf: 'center' } }, 'Xem chi tiết từ'),
    );
    fc.append(frontFace, backFace);
    if (revealed) fc.classList.add('flipped');
    fc.addEventListener('click', (e) => {
      if (e.target.closest('button, a')) return;
      if (!revealed) reveal();
    });
    fc.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !revealed) {
        e.preventDefault();
        reveal();
      }
    });

    const newWrap = h('div', { class: `fc-wrap ${animate ? 'enter' : ''}`.trim() }, h('span', { class: 'fc-swipe-hint left' }, 'Quên'), h('span', { class: 'fc-swipe-hint right' }, 'Nhớ'), fc);
    attachSwipe(newWrap);
    const nextBg = index + 1 < queue.length ? h('div', { class: 'fc-next', 'aria-hidden': 'true' }) : null;
    stage.replaceChildren(...[nextBg, newWrap].filter(Boolean));
    wrap = newWrap;
    drawBottom();
    updateProgress();
  }

  function drawBottom() {
    if (!revealed) {
      bottom.replaceChildren(button('Hiện đáp án', { icon: 'rotate', variant: 'dark', cls: 'btn-block', onclick: reveal }));
      bottom.firstChild.style.minHeight = '64px';
      return;
    }
    const labels = previewLabels(store.card(queue[index]), Date.now());
    bottom.replaceChildren(
      h(
        'div',
        { class: 'rate-row', role: 'group', 'aria-label': 'Bạn nhớ từ này thế nào?' },
        RATINGS.map(([r, label, cls]) =>
          h('button', { type: 'button', class: `rate-btn ${cls}`, onclick: () => rate(r), 'aria-keyshortcuts': String(r) }, h('span', null, label), h('small', null, labels[r])),
        ),
      ),
    );
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    ctx.activity();
    wrap.querySelector('.fc').classList.add('flipped');
    wrap.querySelector('.fc').setAttribute('aria-label', `Mặt sau thẻ ${word(queue[index]).hanzi}`);
    drawBottom();
    readAloud(queue[index]);
  }

  /** Tự đọc khi lật thẻ: chữ Hán, rồi nghĩa tiếng Anh nếu người học bật. */
  async function readAloud(id) {
    const s = store.state.settings;
    const w = word(id);
    if (s.autoSpeak) await speak(w.hanzi, s.rate);
    if (s.autoSpeakEn && hasVoice('en') && queue[index] === id && revealed) {
      if (s.autoSpeak) await new Promise((r) => setTimeout(r, 250));
      if (queue[index] === id && revealed) sayAs(store, w.en, 'en');
    }
  }

  function rate(r) {
    if (busy || !revealed) return;
    busy = true;
    ctx.activity();
    const id = queue[index];
    const before = store.state.cards[id];
    const now = Date.now();
    // ôn lại thẻ chưa đến hạn (học theo bài) thì không dời lịch, trừ khi quên
    const skipSchedule = before && before.state === 'review' && !isDueToday(before, now) && r !== AGAIN;
    const after = skipSchedule ? before : store.rate(id, r);
    undoStack.push({ id, before, wasNew: !before, queue: [...queue], index, finished: new Set(finished), skipped: skipSchedule });
    if (undoStack.length > 20) undoStack = undoStack.slice(-20);
    stats.seen += 1;
    if (r === AGAIN) stats.again += 1;
    vibrate(r === AGAIN ? [20, 40, 20] : 12);

    // thẻ còn ở bước học ngắn thì quay lại sau vài thẻ
    if (after.state === 'learn' || after.state === 'relearn') {
      queue.splice(Math.min(queue.length, index + 4), 0, id);
    } else {
      finished.add(id);
    }
    const dir = r === AGAIN || r === HARD ? 'leave-left' : r === EASY ? 'leave-up' : 'leave-right';
    const go = () => {
      index += 1;
      revealed = false;
      busy = false;
      if (index >= queue.length) finish();
      else drawCard(true);
    };
    if (prefersReducedMotion()) go();
    else {
      wrap.classList.add(dir);
      setTimeout(go, 260);
    }
  }

  function undo() {
    const last = undoStack.pop();
    if (!last) return;
    if (!last.skipped) store.restore(last.id, last.before, last.wasNew);
    queue.splice(0, queue.length, ...last.queue);
    index = last.index;
    finished.clear();
    for (const id of last.finished) finished.add(id);
    revealed = true;
    stats.seen = Math.max(0, stats.seen - 1);
    drawCard(true);
  }
  undoBtn.addEventListener('click', undo);

  function attachSwipe(target) {
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dragging = false;
    const hintL = target.querySelector('.fc-swipe-hint.left');
    const hintR = target.querySelector('.fc-swipe-hint.right');
    target.addEventListener('pointerdown', (e) => {
      if (!revealed || e.target.closest('button, a')) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      target.setPointerCapture(e.pointerId);
      target.style.transition = 'none';
    });
    target.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) * 1.4 && Math.abs(dx) < 20) return;
      target.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
      hintL.style.opacity = String(Math.min(1, Math.max(0, -dx / 110)));
      hintR.style.opacity = String(Math.min(1, Math.max(0, dx / 110)));
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      target.style.transition = '';
      if (Math.abs(dx) > 110) {
        target.style.transform = '';
        rate(dx > 0 ? GOOD : AGAIN);
      } else {
        target.style.transition = 'transform .35s var(--spring)';
        target.style.transform = '';
        hintL.style.opacity = '0';
        hintR.style.opacity = '0';
      }
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  function finish() {
    const minutes = Math.max(1, Math.round((Date.now() - stats.start) / 60000));
    const remembered = stats.seen ? Math.round(((stats.seen - stats.again) / stats.seen) * 100) : 0;
    bottom.replaceChildren();
    toggles.remove();
    stage.replaceWith(
      h(
        'section',
        { class: 'done-screen' },
        h('div', { class: 'medal' }, icon('trophy', 44)),
        h('h1', null, 'Hoàn thành!'),
        h('p', { class: 'muted' }, daily ? 'Bạn đã ôn xong các thẻ của hôm nay.' : 'Bạn đã học xong nhóm từ này.'),
        h(
          'div',
          { class: 'done-stats' },
          stat(String(total), 'thẻ'),
          stat(`${remembered}%`, 'nhớ ngay'),
          stat(`${minutes}`, 'phút'),
        ),
        h(
          'div',
          { class: 'done-actions' },
          button('Kiểm tra lại', { href: `#/quiz/words/${ids.slice(0, 30).join(',')}`, icon: 'list', variant: 'secondary' }),
          daily ? button('Học thêm 5 từ', { href: '#/review?extra=1', icon: 'sparkle' }) : button('Luyện viết', { href: `#/write/words/${ids.slice(0, 12).join(',')}`, icon: 'pen' }),
        ),
        h('a', { href: '#/', class: 'small', style: { marginTop: '12px' } }, 'Về trang chủ'),
      ),
    );
    progressFill.style.width = '100%';
    countEl.textContent = `${total}/${total}`;
    undoBtn.disabled = true;
    confetti();
    ctx.refreshNav();
  }

  function stat(value, label) {
    return h('div', { class: 'stat-tile' }, h('strong', null, value), h('small', null, label));
  }

  function onKey(e) {
    if (e.target.closest('input, textarea')) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      reveal();
    } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
      rate(Number(e.key));
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      undo();
    }
  }
  document.addEventListener('keydown', onKey);

  drawCard(false);

  return {
    el,
    title,
    immersive: true,
    destroy() {
      document.removeEventListener('keydown', onKey);
      ctx.refreshNav?.();
    },
  };
}
