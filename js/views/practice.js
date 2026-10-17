// Luyện tập: ôn thẻ hôm nay, kiểm tra, luyện viết, hội thoại, sổ từ.
import { button, h, icon } from '../dom.js';

export function render(ctx) {
  const { store } = ctx;
  const sum = ctx.dueSummary();
  const saved = Object.keys(store.state.saved).length;
  const allDone = sum.total === 0;

  const hero = h(
    'section',
    { class: 'hero' },
    h('div', { class: 'hero-art', 'aria-hidden': 'true' }),
    h('p', { class: 'eyebrow' }, 'Ôn thẻ hôm nay'),
    h('div', { class: 'hero-count' }, h('strong', null, allDone ? 'Xong rồi!' : `${sum.total} thẻ`), h('span', null, allDone ? 'Bạn đã ôn hết thẻ hôm nay' : `${sum.due} thẻ đến hạn · ${sum.fresh} từ mới`)),
    h('div', { class: 'actions' }, allDone ? button('Học thêm từ mới', { href: '#/review?extra=1', icon: 'sparkle' }) : button('Bắt đầu ôn', { href: '#/review', icon: 'play' })),
  );

  const item = (href, ic, title, sub, glyph) =>
    h(
      'a',
      { href, class: 'row-link practice-row' },
      h('span', { class: 'tile current', 'aria-hidden': 'true' }, glyph ? h('span', { lang: 'zh-CN' }, glyph) : icon(ic, 22)),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), h('span', { class: 'row-sub' }, sub)),
      icon('chevron', 18),
    );

  const list = h(
    'div',
    { class: 'list stagger' },
    item('#/quiz', 'list', 'Kiểm tra nhanh', 'Chọn nghĩa, chọn chữ, nghe chọn từ, điền từ vào câu', '考'),
    item('#/write', 'pen', 'Luyện viết chữ Hán', 'Xem thứ tự nét, tô theo mẫu, tự viết từ trí nhớ', '写'),
    item('#/library', 'talk', 'Hội thoại', 'Nghe Trung – Anh, nhập vai, điền từ vào bài khóa', '说'),
    saved ? item('#/review/saved', 'bookmark', 'Ôn sổ từ', `${saved} từ bạn đã lưu`, '记') : null,
  );

  const el = h(
    'div',
    { class: 'view' },
    h('header', { class: 'topbar' }, h('h1', { class: 'grow' }, 'Luyện tập')),
    h('div', { class: 'grid-2' }, h('div', { class: 'col stagger' }, hero), h('div', { class: 'col' }, h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Cách luyện khác')), list))),
  );
  return { el, title: 'Luyện tập' };
}
