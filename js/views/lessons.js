import { data, search } from '../data.js';
import { emptyState, h, icon, pinyinWord, ring, segmented, zh } from '../dom.js';
import { learnedCount, lessonRow, nextLesson, wordState } from './common.js';

let lastLevel = null;

export function render(ctx) {
  const { store, query } = ctx;
  const db = data();
  let level = Number(query.get('level')) || lastLevel || store.state.settings.levels[0] || 3;
  if (!db.lessonsByLevel[level]) level = 3;

  const summary = h('section', { class: 'card level-summary', style: { marginTop: '16px' } });
  const list = h('div', { class: 'list stagger', style: { marginTop: '16px' } });
  const results = h('div', { class: 'list', style: { marginTop: '16px' }, 'aria-live': 'polite' });
  const lessonsArea = h('div', null, summary, list);

  function drawLevel() {
    lastLevel = level;
    const lessons = db.lessonsByLevel[level];
    const ids = lessons.flatMap((l) => l.words);
    const n = learnedCount(store, ids);
    summary.replaceChildren(
      h('div', null, h('strong', null, `HSK ${level}`), h('span', { class: 'muted small' }, `${ids.length} từ · ${lessons.length} bài theo chủ đề`), h('p', { class: 'small', style: { marginTop: '8px' } }, h('b', null, `${n}/${ids.length}`), ' từ đã thuộc')),
      ring(n / ids.length, 64, `Đã thuộc ${Math.round((n / ids.length) * 100)}% HSK ${level}`),
    );
    const next = nextLesson(store, db);
    list.replaceChildren(...lessons.map((l) => lessonRow(l, store, { current: next && next.id === l.id })));
  }

  function drawSearch(q) {
    const found = search(q);
    if (!q.trim()) {
      results.replaceChildren();
      lessonsArea.hidden = false;
      return;
    }
    lessonsArea.hidden = true;
    if (!found.length) {
      results.replaceChildren(emptyState('Không tìm thấy', 'Thử gõ chữ Hán, pinyin không dấu (vd: lvyou), nghĩa tiếng Việt hoặc tiếng Anh.'));
      return;
    }
    results.replaceChildren(
      ...found.map((w) =>
        h(
          'a',
          { href: `#/word/${w.id}`, class: 'row-link word-row' },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, zh(w.hanzi), pinyinWord(w.py)), h('span', { class: 'row-sub' }, `${w.vi} · ${w.en}`)),
          h('span', { class: 'row-end' }, h('span', { class: 'badge-soft badge-gray' }, `HSK ${w.level}`), h('span', { class: `state-dot ${wordState(store, w.id)}`, 'aria-hidden': 'true' })),
        ),
      ),
    );
  }

  const input = h('input', { type: 'search', placeholder: 'Tìm chữ Hán, pinyin hoặc nghĩa', 'aria-label': 'Tìm từ', autocomplete: 'off', enterkeyhint: 'search' });
  let t = null;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => drawSearch(input.value), 120);
  });

  const el = h(
    'div',
    { class: 'view' },
    h('header', { class: 'topbar' }, h('h1', { class: 'grow' }, 'Bài học')),
    h('label', { class: 'search' }, icon('search', 20), input),
    h(
      'div',
      { style: { marginTop: '16px' } },
      segmented(
        [
          [3, 'HSK 3'],
          [4, 'HSK 4'],
        ],
        level,
        (v) => {
          level = v;
          history.replaceState(null, '', `#/lessons?level=${v}`);
          drawLevel();
        },
        'Chọn cấp HSK',
      ),
    ),
    lessonsArea,
    results,
  );
  drawLevel();
  return { el, title: 'Bài học' };
}
