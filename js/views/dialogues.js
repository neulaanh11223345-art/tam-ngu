// Danh sách hội thoại: hội thoại tự nhập của bạn và hội thoại theo bài HSK 4–5.
import { lesson, lessonTitle, loadDialogues, topic } from '../data.js';
import { button, emptyState, h, icon, segmented, zh } from '../dom.js';
import { lessonsTabs } from './common.js';

let lastLevel = null;

export function render(ctx) {
  const { store } = ctx;
  const mineArea = h('section', { class: 'section' });
  const levelArea = h('div', { style: { marginTop: '16px' } });
  const list = h('div', { class: 'list stagger', style: { marginTop: '12px' } }, h('p', { class: 'small muted' }, 'Đang tải hội thoại…'));

  const mine = Object.entries(store.state.mine)
    .filter(([, d]) => !d.deleted)
    .sort((a, b) => b[1].updated - a[1].updated);
  mineArea.replaceChildren(
    h('div', { class: 'section-head' }, h('h2', null, 'Hội thoại của bạn'), h('a', { href: '#/mine/new' }, 'Thêm')),
    mine.length
      ? h(
          'div',
          { class: 'list' },
          mine.map(([id, d]) => {
            const n = (d.text || '').split('\n').filter((x) => x.trim()).length;
            const read = store.state.dialogues[`mine:${id}`];
            return h('a', { href: `#/mine/${id}`, class: 'row-link' }, h('span', { class: 'tile current', 'aria-hidden': 'true' }, icon('bookmark', 20)), h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, d.title || 'Hội thoại chưa đặt tên'), h('span', { class: 'row-sub' }, `${n} câu${read ? ` · đã đọc ${read.reads} lần` : ''}`)), icon('chevron', 18));
          }),
        )
      : h(
          'div',
          { class: 'card mine-empty' },
          h('p', null, 'Dán hội thoại trong sách bạn đang học vào đây. App tự thêm pinyin, đọc to từng câu và giúp bạn nhập vai. Chỉ bạn xem được.'),
          button('Thêm hội thoại', { href: '#/mine/new', icon: 'pen', size: 'sm' }),
        ),
  );

  loadDialogues()
    .then((all) => {
      const levels = [...new Set(all.map((d) => d.level))].sort();
      if (!levels.length) {
        list.replaceChildren(emptyState('Chưa có hội thoại', 'Hội thoại theo bài sẽ có ở đây.'));
        return;
      }
      let level = levels.includes(lastLevel) ? lastLevel : levels.includes(store.state.settings.levels.at(-1)) ? store.state.settings.levels.at(-1) : levels[0];
      const draw = () => {
        lastLevel = level;
        const items = all.filter((d) => d.level === level);
        list.replaceChildren(
          ...items.map((d) => {
            const l = lesson(d.id);
            const t = topic(d.topic);
            const p = store.state.dialogues[d.id];
            return h(
              'a',
              { href: `#/dialogue/${d.id}`, class: 'row-link' },
              h('span', { class: `tile ${p ? 'done' : ''}`.trim(), lang: 'zh-CN', 'aria-hidden': 'true' }, t.icon),
              h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, zh(d.title.zh)), h('span', { class: 'row-sub' }, d.title.vi), h('span', { class: 'row-sub small' }, `${l ? lessonTitle(l) : t.vi} · ${d.lines.length} câu${p?.best != null ? ` · điền từ ${Math.round(p.best * 100)}%` : p ? ' · đã đọc' : ''}`)),
              p ? h('span', { class: 'check-dot', role: 'img', 'aria-label': 'Đã đọc' }, icon('check', 16)) : icon('chevron', 18),
            );
          }),
        );
      };
      levelArea.replaceChildren(
        segmented(
          levels.map((lv) => [lv, `HSK ${lv}`]),
          level,
          (v) => {
            level = v;
            draw();
          },
          'Chọn cấp HSK',
        ),
      );
      draw();
    })
    .catch((e) => list.replaceChildren(emptyState('Không tải được hội thoại', `${e.message}. Hãy kiểm tra mạng rồi mở lại.`)));

  const el = h(
    'div',
    { class: 'view' },
    h('header', { class: 'topbar' }, h('h1', { class: 'grow' }, 'Bài học')),
    lessonsTabs('dialogues', ctx.navigate),
    mineArea,
    h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Hội thoại theo bài')), h('p', { class: 'small muted' }, 'Mỗi bài từ vựng HSK 4–5 có một hội thoại dùng chính các từ của bài, soạn riêng cho Tam Ngữ.'), levelArea, list),
  );
  return { el, title: 'Hội thoại' };
}
