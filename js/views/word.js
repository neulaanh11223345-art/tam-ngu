import { charInfo, lesson, lessonTitle, relatedWords, word } from '../data.js';
import { button, h, icon, pinyinWord, toast, zh } from '../dom.js';
import { speak } from '../speech.js';
import { formatGap } from '../srs.js';
import { createWriter } from '../writer.js';
import { exampleBlock, miniSay, sayAs, speakButton } from './common.js';

function statusText(store, id) {
  const c = store.state.cards[id];
  if (!c || c.state === 'new') return 'Chưa học từ này';
  if (c.state === 'review') {
    const gap = c.due - Date.now();
    return gap > 0 ? `Đã thuộc · ôn lại sau ${formatGap(gap)}` : 'Đã thuộc · đến hạn ôn hôm nay';
  }
  return 'Đang học · sẽ ôn lại trong hôm nay';
}

export function render(ctx) {
  const { store, params } = ctx;
  const w = word(params[0]);
  if (!w) {
    ctx.navigate('#/lessons', { replace: true });
    return { el: h('div', { class: 'view' }) };
  }
  const writers = [];
  const l = lesson(w.lesson);

  const saveBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Lưu vào sổ từ', title: 'Lưu vào sổ từ', 'aria-pressed': String(Boolean(store.state.saved[w.id])) }, icon('star', 22));
  saveBtn.addEventListener('click', () => {
    const on = store.toggleSaved(w.id);
    saveBtn.setAttribute('aria-pressed', String(on));
    toast(on ? 'Đã lưu vào sổ từ' : 'Đã bỏ khỏi sổ từ');
  });

  const head = h(
    'header',
    { class: 'topbar' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quay lại', onclick: () => (history.length > 1 ? history.back() : ctx.navigate(`#/lesson/${w.lesson}`)) }, icon('back', 24)),
    h('span', { class: 'topbar-title' }, 'Chi tiết từ'),
    saveBtn,
  );

  const hero = h(
    'section',
    { class: 'word-hero' },
    h('div', { class: 'badges' }, h('span', { class: 'badge-soft' }, `HSK ${w.level}`), w.pos ? h('span', { class: 'badge-soft badge-gray' }, w.pos) : null),
    zh(w.hanzi, 'big'),
    pinyinWord(w.py),
    h('div', { class: 'hv' }, w.hv),
    w.trad ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, 'Phồn thể: ', zh(w.trad)) : null,
    h(
      'div',
      { class: 'actions' },
      button('Nghe', { icon: 'sound', onclick: () => speak(w.hanzi, store.state.settings.rate) }),
      button('Nghe chậm', { icon: 'slow', variant: 'secondary', onclick: () => speak(w.hanzi, 0.55) }),
      button('English', { icon: 'sound', variant: 'secondary', ariaLabel: `Nghe tiếng Anh: ${w.en}`, onclick: () => sayAs(store, w.en, 'en') }),
      button('Tập viết', { icon: 'pen', variant: 'secondary', href: `#/write/word/${w.id}` }),
    ),
  );

  const meanings = h(
    'section',
    { class: 'card meanings', style: { marginTop: '20px', padding: '4px 16px' } },
    h('div', { class: 'mrow has-end' }, h('span', { class: 'tag' }, 'VI'), h('span', { class: 'mrow-text' }, h('small', null, 'Tiếng Việt'), h('b', null, w.vi)), miniSay(w.vi, store, 'vi')),
    h('div', { class: 'mrow has-end' }, h('span', { class: 'tag' }, 'EN'), h('span', { class: 'mrow-text', lang: 'en' }, h('small', null, 'English'), h('b', null, w.en)), miniSay(w.en, store, 'en')),
    h('div', { class: 'mrow' }, h('span', { class: 'tag' }, 'HV'), h('span', { class: 'mrow-text' }, h('small', null, 'Âm Hán Việt'), h('b', { class: 'hv', style: { fontSize: '15px' } }, w.hv))),
  );

  const chars = h(
    'div',
    { class: 'chars-grid' },
    [...w.hanzi].map((ch, i) => {
      const info = charInfo(ch) || {};
      const box = h('div', { class: 'tzg' }, h('div', { class: 'tzg-char', lang: 'zh-CN' }, ch), h('div', { class: 'hw' }));
      const card = h(
        'button',
        { type: 'button', class: 'char-card', 'aria-label': `Xem thứ tự nét chữ ${ch}` },
        box,
        h('span', { style: { display: 'flex', alignItems: 'baseline', gap: '8px' } }, pinyinWord([w.py[i] || info.py?.[0] || '']), h('span', { class: 'hv', style: { fontSize: '12px' } }, (w.hv.split(' ')[i] || info.hv?.[0] || ''))),
        h('span', { class: 'meta' }, `${info.strokes || '?'} nét · bộ ${info.radical || '?'} ${info.radVi || ''}`),
        info.def ? h('span', { class: 'meta', lang: 'en' }, info.def.length > 48 ? `${info.def.slice(0, 46)}…` : info.def) : null,
      );
      let writer = null;
      card.addEventListener('click', async () => {
        const hw = box.querySelector('.hw');
        if (!writer) {
          box.querySelector('.tzg-char').style.opacity = '0';
          try {
            writer = await createWriter(hw, ch, { size: box.clientWidth, showCharacter: false, radical: true });
            writers.push(writer);
          } catch {
            toast('Chưa có dữ liệu nét cho chữ này');
            box.querySelector('.tzg-char').style.opacity = '1';
            return;
          }
        }
        writer.animateCharacter();
      });
      return card;
    }),
  );

  const rel = relatedWords(w);
  const relSec = rel.length
    ? h(
        'section',
        { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', null, 'Từ có chung chữ')),
        h(
          'div',
          { class: 'related' },
          rel.map((r) => h('a', { href: `#/word/${r.id}` }, zh(r.hanzi), pinyinWord(r.py), h('small', null, r.vi.split(';')[0]))),
        ),
      )
    : null;

  const status = h('p', { class: 'status-line' }, icon('cards', 18), statusText(store, w.id));
  const footer = h(
    'section',
    { class: 'section card', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    status,
    l ? h('a', { href: `#/lesson/${l.id}`, class: 'small' }, `Thuộc bài: HSK ${l.level} · ${lessonTitle(l)}`) : null,
    button('Ôn từ này ngay', { href: `#/review/word/${w.id}`, icon: 'play', cls: 'btn-block' }),
  );

  const el = h(
    'div',
    { class: 'view' },
    head,
    h(
      'div',
      { class: 'grid-2' },
      h('div', { class: 'col' }, hero, meanings, h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Ví dụ'), speakButton(w.ex.zh, store, { label: 'Nghe câu', cls: 'icon-btn soft' })), exampleBlock(w, store, { withSpeak: false }))),
      h('div', { class: 'col' }, h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Từng chữ'), h('span', { class: 'small muted' }, 'Chạm để xem thứ tự nét')), chars), relSec, footer),
    ),
  );

  return {
    el,
    title: w.hanzi,
    destroy() {
      for (const wr of writers) wr.pauseAnimation?.();
    },
  };
}
