// Khối giao diện dùng chung giữa các màn hình.
import { lesson, lessonTitle, topic } from '../data.js';
import { h, icon, meaningRow, pinyinSentence, pinyinWord, segmented, sentenceWithWord, zh } from '../dom.js';
import { speak } from '../speech.js';

/** Nút loa: đọc chữ Hán, có hiệu ứng khi đang đọc. */
export function speakButton(text, store, { label = 'Nghe phát âm', rate, cls = 'speak-btn' } = {}) {
  const btn = h('button', { type: 'button', class: cls, 'aria-label': `${label} ${text}`, title: label }, icon('sound', 22));
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    btn.classList.add('playing');
    await speak(text, rate ?? store.state.settings.rate);
    btn.classList.remove('playing');
  });
  return btn;
}

/** Câu ví dụ đủ 4 lớp: chữ Hán, pinyin, Anh, Việt. */
export function exampleBlock(w, store, { withSpeak = true } = {}) {
  return h(
    'div',
    { class: 'example' },
    h(
      'div',
      { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } },
      h('div', { style: { flex: '1', minWidth: '0' } }, h('p', { class: 'ex-zh' }, sentenceWithWord(w.ex.zh, w.hanzi)), h('p', { class: 'ex-py' }, pinyinSentence(w.ex.py))),
      withSpeak ? speakButton(w.ex.zh, store, { label: 'Nghe câu', cls: 'icon-btn soft' }) : null,
    ),
    meaningRow('EN', w.ex.en, { lang: 'en' }),
    meaningRow('VI', w.ex.vi),
  );
}

/** Thẻ từ đầy đủ (dùng cho "Từ của ngày"). */
export function wordCard(w, store) {
  return h(
    'article',
    { class: 'card word-card' },
    h(
      'div',
      { class: 'wc-top' },
      h(
        'div',
        null,
        zh(w.hanzi, 'wc-hz'),
        h('div', { class: 'wc-py' }, pinyinWord(w.py), h('span', { class: 'badge-soft badge-gray' }, `HSK ${w.level}${w.pos ? ` · ${w.pos}` : ''}`)),
      ),
      speakButton(w.hanzi, store),
    ),
    h(
      'div',
      { class: 'mrows' },
      meaningRow('VI', w.vi, { class: 'vi' }),
      meaningRow('EN', w.en, { lang: 'en' }),
      meaningRow('HV', h('span', { class: 'hv' }, w.hv)),
    ),
    exampleBlock(w, store, { withSpeak: false }),
  );
}

/** Trạng thái học của một từ để hiển thị chấm màu. */
export function wordState(store, id) {
  const c = store.state.cards[id];
  if (!c || c.state === 'new') return 'new';
  if (c.state === 'review') return 'review';
  return 'learn';
}

/** Số từ đã thuộc (đang ở trạng thái ôn dài hạn) trong một danh sách id. */
export function learnedCount(store, ids) {
  return ids.filter((id) => wordState(store, id) === 'review').length;
}

export function startedCount(store, ids) {
  return ids.filter((id) => wordState(store, id) !== 'new').length;
}

/** Dòng bài học trong danh sách. */
export function lessonRow(l, store, { current = false } = {}) {
  const t = topic(l.topic);
  const learned = learnedCount(store, l.words);
  const started = startedCount(store, l.words);
  const done = learned === l.words.length;
  const state = done ? 'done' : started > 0 || current ? 'current' : '';
  return h(
    'a',
    { href: `#/lesson/${l.id}`, class: `row-link ${state === 'current' ? 'current' : ''}`.trim() },
    h('span', { class: `tile ${state}`.trim(), lang: 'zh-CN', 'aria-hidden': 'true' }, t.icon),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, lessonTitle(l)), h('span', { class: 'row-sub' }, `${t.en} · ${l.words.length} từ`)),
    done
      ? h('span', { class: 'check-dot', role: 'img', 'aria-label': 'Đã thuộc hết' }, icon('check', 16))
      : h('span', { class: 'row-end' }, h('span', { style: { color: started ? 'var(--accent)' : null } }, `${learned}/${l.words.length}`), h('span', { style: { width: '44px' } }, barMini(learned / l.words.length))),
  );
}

function barMini(f) {
  const el = h('span', { class: 'bar thin', style: { display: 'block' } }, h('span', { class: 'bar-fill', style: { width: `${f * 100}%` } }));
  return el;
}

/** Bài nên học tiếp: bài đầu tiên còn từ chưa thuộc trong các cấp đã chọn. */
export function nextLesson(store, data) {
  const levels = store.state.settings.levels;
  const lessons = data.lessons.filter((l) => levels.includes(l.level));
  return lessons.find((l) => startedCount(store, l.words) > 0 && learnedCount(store, l.words) < l.words.length) || lessons.find((l) => learnedCount(store, l.words) < l.words.length) || lessons[0];
}

export function lessonLabel(id) {
  const l = lesson(id);
  return l ? `HSK ${l.level} · ${lessonTitle(l)}` : '';
}

/** Hiệu ứng pháo giấy nhỏ khi hoàn thành. */
export function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#1f5bd6', '#0e7a5f', '#e8a90c', '#c9302c', '#7e3ab8'];
  const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 36; i++) {
    const piece = h('i', {
      style: {
        left: `${Math.random() * 100}%`,
        background: colors[i % colors.length],
        animationDelay: `${Math.random() * 0.4}s`,
        animationDuration: `${1.2 + Math.random() * 0.9}s`,
        transform: `rotate(${Math.random() * 180}deg)`,
      },
    });
    box.append(piece);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 2600);
}

/** Hai thẻ đầu trang Bài học: Từ vựng | Hội thoại. */
export function lessonsTabs(active, navigate) {
  return segmented(
    [
      ['words', 'Từ vựng'],
      ['dialogues', 'Hội thoại'],
    ],
    active,
    (v) => navigate(v === 'words' ? '#/lessons' : '#/dialogues'),
    'Phần học',
  );
}

/**
 * Bảng nhỏ trượt lên từ dưới để tra nhanh một từ.
 * info: {hanzi, py (mảng âm tiết hoặc chuỗi), vi?, en?, id?}
 */
export function wordPeek(info, store) {
  document.querySelector('.sheet-wrap')?.remove();
  const close = () => {
    wrap.classList.add('closing');
    setTimeout(() => wrap.remove(), 220);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && close();
  const py = Array.isArray(info.py) ? pinyinWord(info.py) : info.py ? pinyinSentence(info.py) : null;
  const sheet = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Nghĩa của ${info.hanzi}` },
    h('div', { class: 'sheet-head' }, h('div', null, zh(info.hanzi, 'sheet-hz'), h('div', { class: 'sheet-py' }, py, info.level ? h('span', { class: 'badge-soft badge-gray' }, `HSK ${info.level}`) : null)), speakButton(info.hanzi, store)),
    h('div', { class: 'mrows' }, info.vi ? meaningRow('VI', info.vi, { class: 'vi' }) : null, info.en ? meaningRow('EN', info.en, { lang: 'en' }) : null, !info.vi && !info.en ? h('p', { class: 'small muted' }, 'Chưa có nghĩa của từ này trong từ điển của app.') : null),
    h('div', { class: 'sheet-actions' }, info.id ? h('a', { class: 'btn btn-secondary btn-sm', href: `#/word/${info.id}`, onclick: close }, 'Xem chi tiết từ') : null, h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: close }, 'Đóng')),
  );
  const wrap = h('div', { class: 'sheet-wrap' }, h('div', { class: 'sheet-backdrop', onclick: close }), sheet);
  document.body.append(wrap);
  document.addEventListener('keydown', onKey);
  sheet.querySelector('.btn-primary').focus({ preventScroll: true });
  return close;
}
