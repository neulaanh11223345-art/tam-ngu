import { data, levelsAvailable, word } from '../data.js';
import { bar, brandSeal, button, h, icon, pinyinWord, segmented, zh } from '../dom.js';
import { dayKey } from '../srs.js';
import { streak } from '../store.js';
import { learnedCount } from './common.js';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
let period = 'week';

function daysBack(n) {
  const out = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(x);
  }
  return out;
}

export function render(ctx) {
  const { store } = ctx;
  const db = data();
  const st = store.state;
  const days = streak(st.log);
  const allIds = db.words.map((w) => w.id);
  const learned = learnedCount(store, allIds);
  let good = 0;
  let bad = 0;
  for (const d of daysBack(30)) {
    const l = st.log[dayKey(d.getTime())];
    if (l) {
      good += l.good;
      bad += l.bad;
    }
  }
  const accuracy = good + bad ? Math.round((good / (good + bad)) * 100) : 0;
  const written = Object.keys(st.writing).length;

  const tile = (ic, color, soft, value, label) =>
    h('div', { class: 'stat-tile' }, h('span', { class: 'ico', style: { background: soft, color } }, icon(ic, 18)), h('strong', null, value), h('small', null, label));

  const tiles = h(
    'section',
    { class: 'tiles-3', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' } },
    tile('flame', 'var(--warn)', 'var(--warn-soft)', String(days), 'ngày liên tiếp'),
    tile('book', 'var(--good)', 'var(--good-soft)', String(learned), 'từ đã thuộc'),
    tile('target', 'var(--easy)', 'var(--easy-soft)', good + bad ? `${accuracy}%` : '—', 'trả lời đúng (30 ngày)'),
    tile('pen', 'var(--accent)', 'var(--accent-soft)', String(written), 'chữ đã luyện viết'),
  );

  const chartBox = h('div');
  function drawChart() {
    const goal = st.settings.dailyGoal;
    let cols;
    let goalVal;
    if (period === 'week') {
      cols = daysBack(7).map((d, i, arr) => {
        const l = st.log[dayKey(d.getTime())];
        return { label: WEEKDAYS[d.getDay()], value: l ? Math.round(l.ms / 60000) : 0, now: i === arr.length - 1 };
      });
      goalVal = goal;
    } else {
      const ds = daysBack(28);
      cols = [0, 1, 2, 3].map((w) => {
        const slice = ds.slice(w * 7, w * 7 + 7);
        const value = slice.reduce((s, d) => s + Math.round((st.log[dayKey(d.getTime())]?.ms || 0) / 60000), 0);
        return { label: w === 3 ? 'Tuần này' : `${3 - w} tuần trước`, value, now: w === 3 };
      });
      goalVal = goal * 7;
    }
    const max = Math.max(goalVal * 1.25, ...cols.map((c) => c.value), 1);
    const total = cols.reduce((s, c) => s + c.value, 0);
    const colEls = cols.map((c) => {
      const fill = h('div', { class: `col ${c.now ? 'now' : c.value >= goalVal ? 'met' : ''}`.trim() });
      requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.height = `${Math.max(c.value ? 4 : 2, (c.value / max) * 118)}px`)));
      return h('div', { class: 'chart-col' }, h('span', { class: 'val' }, c.value ? String(c.value) : ''), fill);
    });
    const spoken = cols.map((c) => `${c.label}: ${c.value} phút`).join(', ');
    chartBox.replaceChildren(
      h('div', { class: 'section-head' }, h('h2', null, 'Thời gian học'), h('span', { class: 'small muted' }, `Tổng ${total} phút`)),
      h('div', { class: 'chart', role: 'img', 'aria-label': `Thời gian học. ${spoken}` }, h('div', { class: 'chart-goal', style: { bottom: `${(goalVal / max) * 118}px` }, 'aria-hidden': 'true' }), colEls),
      h('div', { class: 'chart-labels', 'aria-hidden': 'true' }, cols.map((c) => h('span', { class: c.now ? 'now' : '' }, c.label))),
      h(
        'div',
        { class: 'legend' },
        h('span', null, h('i', { style: { borderTop: '1.5px dashed var(--ink-3)', height: '0', width: '16px', borderRadius: '0' } }), period === 'week' ? `Mục tiêu ${goal} phút/ngày` : `Mục tiêu ${goal * 7} phút/tuần`),
        h('span', null, h('i', { style: { background: 'var(--good)' } }), 'Đạt mục tiêu'),
        h('span', null, h('i', { style: { background: 'var(--accent-bg)' } }), period === 'week' ? 'Hôm nay' : 'Tuần này'),
      ),
    );
  }

  const levels = h(
    'section',
    { class: 'card section' },
    h('div', { class: 'section-head' }, h('h2', null, 'Lộ trình HSK')),
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      levelsAvailable().map((lv) => {
        const ids = db.lessonsByLevel[lv].flatMap((l) => l.words);
        const n = learnedCount(store, ids);
        const learning = ids.filter((id) => {
          const c = st.cards[id];
          return c && c.state !== 'review' && c.state !== 'new';
        }).length;
        return h(
          'div',
          null,
          h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '14px' } }, h('b', null, `HSK ${lv}`), h('span', { class: 'muted' }, `${n}/${ids.length} đã thuộc${learning ? ` · ${learning} đang học` : ''}`)),
          h('div', { style: { marginTop: '8px' } }, bar(n / ids.length, n === ids.length ? 'good' : '', `HSK ${lv}`)),
        );
      }),
    ),
  );

  const forgot = Object.values(st.cards)
    .filter((c) => c.lapses > 0 && word(c.id))
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, 6);
  const forgotSec = h(
    'section',
    { class: 'card section', style: { paddingBottom: '6px' } },
    h('div', { class: 'section-head', style: { marginBottom: '4px' } }, h('h2', null, 'Từ hay quên'), forgot.length ? h('a', { href: `#/review/words/${forgot.map((c) => c.id).join(',')}` }, 'Ôn ngay') : null),
    forgot.length
      ? forgot.map((c) => {
          const w = word(c.id);
          return h('a', { href: `#/word/${w.id}`, class: 'forgot-row' }, zh(w.hanzi), h('span', { class: 'row-main' }, pinyinWord(w.py), h('span', { class: 'row-sub' }, `${w.vi} · ${w.en}`)), h('span', { class: 'pill-bad' }, `quên ${c.lapses} lần`));
        })
      : h('p', { class: 'small muted', style: { padding: '8px 0 12px' } }, 'Chưa có từ nào bị quên. Cứ giữ nhịp ôn đều mỗi ngày nhé!'),
  );

  const savedIds = Object.keys(st.saved).filter((id) => word(id));
  const savedSec = h(
    'section',
    { class: 'card section', style: { display: 'flex', alignItems: 'center', gap: '14px' } },
    h('span', { class: 'tile current', 'aria-hidden': 'true' }, icon('bookmark', 22)),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'Sổ từ đã lưu'), h('span', { class: 'row-sub' }, savedIds.length ? `${savedIds.length} từ` : 'Bấm biểu tượng ngôi sao ở một từ để lưu')),
    savedIds.length ? button('Ôn', { href: '#/review/saved', size: 'sm', icon: 'play' }) : null,
  );

  const el = h(
    'div',
    { class: 'view' },
    h('header', { class: 'topbar' }, h('h1', { class: 'grow' }, 'Tôi'), h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Cài đặt', title: 'Cài đặt' }, icon('settings', 22))),
    h(
      'section',
      { class: 'card me-card' },
      brandSeal('seal-lg'),
      h('div', { class: 'row-main' }, h('strong', { class: 'me-name' }, 'Hành trình của bạn'), h('span', { class: 'small muted' }, `${learned} từ đã thuộc · chuỗi ${days} ngày`)),
    ),
    h(
      'div',
      { class: 'section-head', style: { marginTop: '20px' } },
      h('h2', null, 'Thống kê'),
      segmented(
        [
          ['week', 'Tuần'],
          ['month', 'Tháng'],
        ],
        period,
        (v) => {
          period = v;
          drawChart();
        },
        'Khoảng thời gian',
      ),
    ),
    h('div', { class: 'stagger' }, tiles, h('section', { class: 'card section' }, chartBox), h('div', { class: 'grid-2', style: { marginTop: '0' } }, h('div', { class: 'col' }, levels, savedSec), h('div', { class: 'col' }, forgotSec))),
  );
  drawChart();
  return { el, title: 'Tôi' };
}
