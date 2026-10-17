import { data, lessonWords, levelsAvailable, studyOrder, word } from '../data.js';
import { bar, brandSeal, button, h, icon, ring, zh } from '../dom.js';
import { dayKey } from '../srs.js';
import { streak } from '../store.js';
import { learnedCount, lessonRow, nextLesson, wordCard, wordState } from './common.js';

function greeting() {
  const hr = new Date().getHours();
  if (hr < 11) return 'Chào buổi sáng';
  if (hr < 14) return 'Chào buổi trưa';
  if (hr < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/** Từ của ngày: cố định trong một ngày, ưu tiên từ đang học. */
function wordOfDay(store) {
  const ids = studyOrder(store.state.settings.levels);
  const learning = ids.filter((id) => wordState(store, id) !== 'new');
  const pool = learning.length >= 5 ? learning : ids.slice(0, 60);
  const key = dayKey(Date.now());
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return word(pool[hash % pool.length]);
}

export function render(ctx) {
  const { store } = ctx;
  const db = data();
  const s = store.state.settings;
  const log = store.todayLog();
  const minutes = Math.round(log.ms / 60000);
  const sum = ctx.dueSummary();
  const days = streak(store.state.log);

  const head = h(
    'header',
    { class: 'home-head' },
    h('div', { class: 'brand' }, brandSeal(), h('div', { class: 'brand-name' }, h('strong', null, 'Hán Lộ'), h('small', null, 'Trung · Anh song ngữ'))),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' } }, h('span', { class: 'streak', title: 'Chuỗi ngày học liên tiếp' }, icon('flame', 18), h('span', null, `${days} ngày`)), h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Cài đặt', title: 'Cài đặt' }, icon('settings', 22))),
  );

  const greet = h(
    'section',
    { class: 'greet' },
    h('div', { class: 'greet-art', 'aria-hidden': 'true' }),
    h('h1', null, `${greeting()}!`),
    h('p', { class: 'quote' }, '“Ngôn ngữ là cây cầu, kết nối bạn với thế giới rộng lớn hơn.”'),
    h('p', null, `Mục tiêu ${s.dailyGoal} phút mỗi ngày · hôm nay đã học ${minutes} phút, ôn ${log.reviews} thẻ`),
    bar(Math.min(1, minutes / s.dailyGoal), '', 'Tiến độ mục tiêu hôm nay'),
  );

  const allDone = sum.total === 0;
  const hero = h(
    'section',
    { class: 'hero' },
    h('div', { class: 'hero-art', 'aria-hidden': 'true' }),
    h('p', { class: 'eyebrow' }, 'Ôn tập hôm nay'),
    h('div', { class: 'hero-count' }, h('strong', null, allDone ? 'Xong rồi!' : `${sum.total} thẻ`), h('span', null, allDone ? 'Bạn đã ôn hết thẻ hôm nay' : `khoảng ${Math.max(1, Math.round(sum.total * 0.35))} phút`)),
    h(
      'div',
      { class: 'chips' },
      h('span', { class: 'chip' }, h('span', { class: 'dot', style: { background: '#f5c86b' } }), `${sum.due} thẻ đến hạn`),
      h('span', { class: 'chip' }, h('span', { class: 'dot', style: { background: '#bfe8d4' } }), `${sum.fresh} từ mới`),
    ),
    h(
      'div',
      { class: 'actions' },
      allDone ? button('Học thêm từ mới', { href: '#/review?extra=1', icon: 'sparkle' }) : button('Bắt đầu ôn', { href: '#/review', icon: 'play' }),
      button('Kiểm tra', { href: '#/quiz', icon: 'list', variant: 'onhero' }),
    ),
  );

  const next = nextLesson(store, db);
  const continueSec = next
    ? h(
        'section',
        { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', null, 'Tiếp tục học'), h('a', { href: '#/lessons' }, 'Lộ trình')),
        h(
          'div',
          { class: 'list' },
          lessonRow(next, store, { current: true }),
          next.dlg
            ? h('a', { href: `#/dialogue/${next.id}`, class: 'row-link' }, h('span', { class: 'tile', 'aria-hidden': 'true' }, icon('talk', 22)), h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Bài khóa của bài này'), h('span', { class: 'row-sub' }, store.state.dialogues[next.id] ? 'Đã đọc · luyện thêm nhập vai, điền từ' : 'Đọc, nghe và nhập vai với từ của bài')), icon('chevron', 18))
            : null,
        ),
      )
    : null;

  // gợi ý chữ để luyện viết: chữ trong các từ đang học, nếu chưa có thì lấy từ bài tiếp theo
  const learning = studyOrder(s.levels).filter((id) => wordState(store, id) !== 'new');
  const source = learning.length ? learning.slice(-8).map(word) : next ? lessonWords(next.id) : [];
  const chars = [...new Set(source.flatMap((w) => [...w.hanzi]))].slice(0, 8);
  const writeSec = chars.length
    ? h(
        'section',
        { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', null, 'Luyện viết chữ Hán'), h('a', { href: '#/write' }, 'Mở bảng viết')),
        h(
          'div',
          { class: 'pick-grid home-picks' },
          chars.map((ch) => {
            const w = source.find((x) => x.hanzi.includes(ch));
            return h('a', { href: `#/write/word/${w.id}`, 'aria-label': `Luyện viết chữ ${ch}` }, zh(ch), h('small', null, db.chars[ch]?.hv?.[0] || ''));
          }),
        ),
      )
    : null;

  const wod = wordOfDay(store);
  const wodSec = h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Từ của ngày'), h('a', { href: `#/word/${wod.id}` }, 'Xem chi tiết')), wordCard(wod, store));

  const levelsSec = h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Lộ trình HSK')),
    h(
      'div',
      { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      levelsAvailable().map((lv) => {
        const ids = db.lessonsByLevel[lv].flatMap((l) => l.words);
        const n = learnedCount(store, ids);
        return h(
          'a',
          { href: `#/lessons?level=${lv}`, style: { display: 'flex', alignItems: 'center', gap: '14px', color: 'inherit', textDecoration: 'none' } },
          ring(n / ids.length, 56, `Đã thuộc ${n} trên ${ids.length} từ HSK ${lv}`),
          h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, `HSK ${lv}`), h('span', { class: 'row-sub' }, `${n}/${ids.length} từ đã thuộc · ${db.lessonsByLevel[lv].length} bài`)),
          icon('chevron', 20, 'muted'),
        );
      }),
    ),
  );

  const el = h(
    'div',
    { class: 'view' },
    head,
    h('div', { class: 'grid-2' }, h('div', { class: 'col stagger' }, greet, hero, continueSec, writeSec), h('div', { class: 'col stagger' }, wodSec, levelsSec)),
  );
  return { el };
}
