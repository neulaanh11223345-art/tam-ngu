// Một bài học: tab Bài học (bài khóa), Từ vựng, Luyện tập.
import { data, dialogue, lesson, lessonTitle, lessonWords, loadDialogues, topic } from '../data.js';
import { bar, button, h, icon, pinyinSentence, pinyinWord, segmented, toast, zh } from '../dom.js';
import { displaySheet, learnedCount, miniSay, speakButton, startedCount, wordState } from './common.js';

const PITCH = [1, 1.18, 0.9];
const LETTERS = 'ABCDE';
const tabByLesson = new Map();
let wordFilter = 'all';

export function render(ctx) {
  const { store, params, query } = ctx;
  const l = lesson(params[0]);
  if (!l) {
    ctx.navigate('#/lessons', { replace: true });
    return { el: h('div', { class: 'view' }) };
  }
  const t = topic(l.topic);
  const words = lessonWords(l.id);
  const learned = learnedCount(store, l.words);
  const started = startedCount(store, l.words);
  const number = data().lessonsByLevel[l.level].indexOf(l) + 1;
  let tab = query.get('tab') || tabByLesson.get(l.id) || (l.dlg ? 'text' : 'words');
  if (tab === 'text' && !l.dlg) tab = 'words';
  let dlg = null;

  const head = h(
    'header',
    { class: 'topbar' },
    h('a', { class: 'icon-btn', href: `#/lessons?level=${l.level}`, 'aria-label': 'Quay lại danh sách bài' }, icon('back', 24)),
    h('span', { class: 'topbar-title left' }, `HSK ${l.level} · Bài ${number}`),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tùy chọn hiển thị', title: 'Tùy chọn hiển thị', onclick: () => displaySheet(store, () => drawTab(), { play: Boolean(l.dlg) }) }, icon('sliders', 22)),
  );

  const titleZh = h('h1', { class: 'lh-zh', lang: 'zh-CN' }, t.icon);
  const titleVi = h('p', { class: 'lh-vi' }, lessonTitle(l));
  const titleEn = h('p', { class: 'lh-en', lang: 'en' }, t.en);
  const hero = h(
    'section',
    { class: 'lesson-hero' },
    h('div', { class: 'lh-art', 'aria-hidden': 'true' }),
    h('div', { class: 'lh-text' }, titleZh, titleVi, titleEn, h('div', { class: 'lh-progress' }, h('div', { style: { flex: '1' } }, bar(learned / words.length, 'good', 'Tiến độ bài')), h('span', { class: 'small' }, `${learned}/${words.length} từ đã thuộc`))),
  );

  const tabs = [['words', `Từ vựng`], ['practice', 'Luyện tập']];
  if (l.dlg) tabs.unshift(['text', 'Bài học']);
  const tabBar = segmented(tabs, tab, (v) => {
    tab = v;
    tabByLesson.set(l.id, v);
    drawTab();
  }, 'Phần của bài');
  tabBar.classList.add('tabs-line');
  const body = h('div', { class: 'lesson-body' });

  function show() {
    return { zh: true, py: true, vi: true, en: false, ...store.state.settings.dlg };
  }

  // ---------- Bài học: bài khóa ----------
  function drawText() {
    if (!dlg) {
      body.replaceChildren(h('p', { class: 'small muted', role: 'status' }, 'Đang tải bài khóa…'));
      return;
    }
    const s = show();
    const lines = dlg.lines.map((line) => {
      const who = dlg.cast[line.s] || dlg.cast[0];
      const say = (text, lang, cls = 'mini-say', size = 18) => speakButton(text, store, { lang, cls, size, pitch: PITCH[line.s % 3] });
      return h(
        'li',
        { class: `text-line s${line.s % 3}` },
        h('span', { class: 'tl-who', title: who.vi }, `${LETTERS[line.s] || '·'}:`),
        h(
          'div',
          { class: 'tl-body' },
          s.zh ? h('p', { class: 'tl-zh', lang: 'zh-CN' }, line.zh) : null,
          s.py ? h('p', { class: 'tl-py' }, pinyinSentence(line.py)) : null,
          s.vi && line.vi ? h('p', { class: 'tl-vi' }, line.vi, say(line.vi, 'vi')) : null,
          s.en && line.en ? h('p', { class: 'tl-en', lang: 'en' }, line.en, say(line.en, 'en')) : null,
        ),
        say(line.zh, 'zh', 'mini-say zh-say', 20),
      );
    });
    body.replaceChildren(
      h(
        'section',
        { class: 'card text-card' },
        h('div', { class: 'text-head' }, h('span', { class: 'play-dot', 'aria-hidden': 'true' }, icon('play', 14)), h('h2', null, 'Bài khóa'), h('span', { class: 'small muted', lang: 'zh-CN' }, dlg.title.zh)),
        h('p', { class: 'text-cast' }, dlg.cast.map((c, i) => [i ? ' · ' : '', h('b', null, `${LETTERS[i]}: `), c.vi, c.zh !== c.vi ? [' ', zh(c.zh)] : null])),
        h('ol', { class: 'text-lines' }, lines),
        h('div', { class: 'text-actions' }, button('Mở bài khóa', { href: `#/dialogue/${l.id}`, icon: 'talk' }), button('Từng câu', { href: `#/dialogue/${l.id}?mode=line`, icon: 'steps', variant: 'secondary' })),
      ),
      dlg.scene
        ? h('section', { class: 'card topic-card' }, h('div', { class: 'topic-head' }, icon('bulb', 20), h('h3', null, 'Chủ đề bài học')), h('p', null, dlg.scene.vi), dlg.scene.en ? h('p', { class: 'small muted', lang: 'en' }, dlg.scene.en, miniSay(dlg.scene.en, store, 'en')) : null)
        : null,
    );
  }

  // ---------- Từ vựng ----------
  function drawWords() {
    const filterSeg = segmented(
      [
        ['all', `Tất cả (${words.length})`],
        ['zh', 'Tiếng Trung'],
        ['en', 'Tiếng Anh'],
      ],
      wordFilter,
      (v) => {
        wordFilter = v;
        drawWords();
      },
      'Cách xem từ vựng',
    );
    filterSeg.classList.add('seg-sm');
    const list = h(
      'div',
      { class: 'vocab-list stagger' },
      words.map((w) => {
        const star = h('button', { type: 'button', class: 'icon-btn star-btn', 'aria-label': `Lưu ${w.hanzi} vào sổ từ`, 'aria-pressed': String(Boolean(store.state.saved[w.id])) }, icon('star', 20));
        star.addEventListener('click', () => {
          const on = store.toggleSaved(w.id);
          star.setAttribute('aria-pressed', String(on));
          toast(on ? 'Đã lưu vào sổ từ' : 'Đã bỏ khỏi sổ từ');
        });
        return h(
          'article',
          { class: 'vocab-card' },
          speakButton(w.hanzi, store, { cls: 'speak-btn vc-say', size: 20 }),
          h(
            'a',
            { class: 'vc-main', href: `#/word/${w.id}` },
            h('span', { class: 'vc-top' }, zh(w.hanzi, 'vc-hz'), h('span', { class: `state-dot ${wordState(store, w.id)}`, title: stateLabel(wordState(store, w.id)) })),
            pinyinWord(w.py, 'vc-py'),
            w.pos ? h('span', { class: 'vc-pos' }, w.pos) : null,
            wordFilter !== 'en' ? h('span', { class: 'vc-vi' }, w.vi) : null,
            wordFilter === 'zh' ? h('span', { class: 'hv vc-hv' }, w.hv) : null,
            wordFilter !== 'zh' ? h('span', { class: 'vc-en', lang: 'en' }, w.en) : null,
          ),
          h('div', { class: 'vc-side' }, star, wordFilter !== 'zh' ? speakButton(w.en, store, { lang: 'en', cls: 'mini-say en-say', size: 18 }) : null),
        );
      }),
    );
    body.replaceChildren(
      filterSeg,
      h('div', { class: 'legend', style: { marginTop: '12px' } }, h('span', null, h('i', { class: 'state-dot' }), 'Chưa học'), h('span', null, h('i', { class: 'state-dot learn' }), 'Đang học'), h('span', null, h('i', { class: 'state-dot review' }), 'Đã thuộc')),
      list,
      button('Ôn tập từ vựng này', { href: `#/review/lesson/${l.id}`, icon: 'cards', variant: 'outline', cls: 'btn-block' }),
    );
  }

  // ---------- Luyện tập ----------
  function drawPractice() {
    const item = (href, glyph, title, sub) => h('a', { href, class: 'row-link practice-row' }, h('span', { class: 'tile current', lang: 'zh-CN', 'aria-hidden': 'true' }, glyph), h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), h('span', { class: 'row-sub' }, sub)), icon('chevron', 18));
    body.replaceChildren(
      h(
        'div',
        { class: 'list stagger' },
        item(`#/review/lesson/${l.id}`, '卡', started ? 'Học tiếp bằng thẻ' : 'Học thẻ', 'Lật thẻ, nghe Trung – Anh, chấm mức nhớ'),
        item(`#/quiz/lesson/${l.id}`, '考', 'Kiểm tra', '10 câu chọn nghĩa, chọn chữ, nghe chọn từ'),
        item(`#/write/lesson/${l.id}`, '写', 'Luyện viết', 'Viết từng chữ của bài theo thứ tự nét'),
        l.dlg ? item(`#/dialogue/${l.id}?mode=role`, '说', 'Nhập vai bài khóa', 'Nói thay một nhân vật, so với câu mẫu') : null,
        l.dlg ? item(`#/dialogue/${l.id}?mode=cloze`, '填', 'Điền từ vào bài khóa', 'Chọn từ của bài vào chỗ trống') : null,
      ),
    );
  }

  function drawTab() {
    if (tab === 'text') drawText();
    else if (tab === 'words') drawWords();
    else drawPractice();
  }

  if (l.dlg) {
    loadDialogues()
      .then(() => {
        dlg = dialogue(l.id);
        if (!dlg) return;
        titleZh.textContent = dlg.title.zh;
        titleZh.classList.add('long');
        titleVi.textContent = dlg.title.vi;
        titleEn.textContent = dlg.title.en;
        if (tab === 'text') drawText();
      })
      .catch(() => {
        if (tab === 'text') body.replaceChildren(h('p', { class: 'small muted' }, 'Không tải được bài khóa. Hãy kiểm tra mạng rồi mở lại.'));
      });
  }

  drawTab();
  const el = h('div', { class: 'view' }, head, hero, h('div', { class: 'lesson-tabs' }, tabBar), body);
  return { el, title: lessonTitle(l) };
}

function stateLabel(s) {
  return s === 'review' ? 'Đã thuộc' : s === 'learn' ? 'Đang học' : 'Chưa học';
}
