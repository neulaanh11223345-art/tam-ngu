import { lesson, lessonTitle, lessonWords, topic } from '../data.js';
import { bar, button, h, icon, pinyinWord, zh } from '../dom.js';
import { learnedCount, startedCount, wordState } from './common.js';

export function render(ctx) {
  const { store, params } = ctx;
  const l = lesson(params[0]);
  if (!l) {
    ctx.navigate('#/lessons', { replace: true });
    return { el: h('div', { class: 'view' }) };
  }
  const t = topic(l.topic);
  const words = lessonWords(l.id);
  const learned = learnedCount(store, l.words);
  const started = startedCount(store, l.words);

  const head = h(
    'header',
    { class: 'topbar' },
    h('a', { class: 'icon-btn', href: `#/lessons?level=${l.level}`, 'aria-label': 'Quay lại danh sách bài' }, icon('back', 24)),
    h('span', { class: 'topbar-title' }, `HSK ${l.level}`),
    h('span', { style: { width: '44px' } }),
  );

  const intro = h(
    'section',
    { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '16px' } },
    h('span', { class: `tile ${learned === words.length ? 'done' : 'current'}`, style: { width: '64px', height: '64px', fontSize: '30px' }, 'aria-hidden': 'true' }, t.icon),
    h(
      'div',
      { class: 'row-main' },
      h('h1', { style: { fontSize: '22px' } }, lessonTitle(l)),
      h('span', { class: 'muted small' }, `${t.en} · ${words.length} từ`),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' } }, h('div', { style: { flex: '1' } }, bar(learned / words.length, 'good', 'Tiến độ bài')), h('span', { class: 'small', style: { fontWeight: '700' } }, `${learned}/${words.length}`)),
    ),
  );

  const actions = h(
    'div',
    { class: 'lesson-actions' },
    button(started ? 'Học tiếp' : 'Học thẻ', { href: `#/review/lesson/${l.id}`, icon: 'cards' }),
    button('Kiểm tra', { href: `#/quiz/lesson/${l.id}`, icon: 'list', variant: 'secondary' }),
    button('Luyện viết', { href: `#/write/lesson/${l.id}`, icon: 'pen', variant: 'secondary' }),
  );

  const dlgCard = l.dlg
    ? h(
        'a',
        { class: 'card dlg-card', href: `#/dialogue/${l.id}` },
        h('span', { class: 'tile current', 'aria-hidden': 'true' }, icon('talk', 22)),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Hội thoại của bài'), h('span', { class: 'row-sub' }, 'Đọc, nghe, nhập vai và điền từ với chính các từ trong bài')),
        icon('chevron', 18),
      )
    : null;

  const list = h(
    'div',
    { class: 'list stagger', style: { marginTop: '16px' } },
    words.map((w) =>
      h(
        'a',
        { href: `#/word/${w.id}`, class: 'row-link word-row' },
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, zh(w.hanzi), pinyinWord(w.py)), h('span', { class: 'row-sub' }, `${w.vi} · ${w.en}`)),
        h('span', { class: 'row-end' }, h('span', { class: `state-dot ${wordState(store, w.id)}`, title: stateLabel(wordState(store, w.id)) }), icon('chevron', 18)),
      ),
    ),
  );

  const legend = h(
    'div',
    { class: 'legend' },
    h('span', null, h('i', { style: { background: 'var(--line)', borderRadius: '50%' } }), 'Chưa học'),
    h('span', null, h('i', { style: { background: 'var(--warn)', borderRadius: '50%' } }), 'Đang học'),
    h('span', null, h('i', { style: { background: 'var(--good)', borderRadius: '50%' } }), 'Đã thuộc'),
  );

  const el = h('div', { class: 'view' }, head, intro, actions, dlgCard, h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Từ vựng trong bài'), legend), list));
  return { el, title: lessonTitle(l) };
}

function stateLabel(s) {
  return s === 'review' ? 'Đã thuộc' : s === 'learn' ? 'Đang học' : 'Chưa học';
}
