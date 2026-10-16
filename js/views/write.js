// Luyện viết chữ Hán: xem thứ tự nét → tô theo mẫu → tự viết từ trí nhớ.
import { charInfo, data, lesson, lessonTitle, lessonWords, search, studyOrder, word } from '../data.js';
import { button, emptyState, h, icon, pinyinWord, segmented, toast, vibrate, zh } from '../dom.js';
import { speak } from '../speech.js';
import { createWriter, loadCharData } from '../writer.js';
import { confetti, wordState } from './common.js';

const MODES = [
  ['watch', 'Xem nét'],
  ['trace', 'Tô theo'],
  ['recall', 'Tự viết'],
];

const STAR = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';

let hubTab = 'learning';

export function render(ctx) {
  const [mode, arg] = ctx.params;
  if (!mode) return renderHub(ctx);
  let words = [];
  let title = 'Luyện viết';
  if (mode === 'word') words = [word(arg)].filter(Boolean);
  else if (mode === 'lesson') {
    const l = lesson(arg);
    if (l) {
      words = lessonWords(l.id);
      title = `Luyện viết · ${lessonTitle(l)}`;
    }
  } else if (mode === 'words') words = arg.split(',').map(word).filter(Boolean);
  if (!words.length) {
    ctx.navigate('#/write', { replace: true });
    return { el: h('div', { class: 'view' }) };
  }
  return renderPractice(ctx, words, title);
}

// ---------------- màn chọn chữ ----------------
function renderHub(ctx) {
  const { store } = ctx;
  const db = data();
  const order = studyOrder(store.state.settings.levels);
  const learning = order.filter((id) => wordState(store, id) !== 'new').map(word);
  const area = h('div', { style: { marginTop: '16px' } });

  function charGrid(entries) {
    return h(
      'div',
      { class: 'pick-grid stagger' },
      entries.map(([ch, w, extra]) => h('a', { href: `#/write/word/${w.id}`, 'aria-label': `Luyện viết chữ ${ch} trong từ ${w.hanzi}` }, zh(ch), h('small', null, extra ?? db.chars[ch]?.hv?.[0] ?? ''))),
    );
  }

  function uniqueChars(list) {
    const seen = new Set();
    const out = [];
    for (const w of list) {
      for (const ch of w.hanzi) {
        if (!seen.has(ch) && db.chars[ch]) {
          seen.add(ch);
          out.push([ch, w]);
        }
      }
    }
    return out;
  }

  function draw() {
    if (hubTab === 'learning') {
      const list = learning.length ? learning.slice(-30).reverse() : lessonWords(db.lessons.find((l) => store.state.settings.levels.includes(l.level)).id);
      const entries = uniqueChars(list).slice(0, 40);
      const sample = list.slice(0, 6).map((w) => w.id).join(',');
      area.replaceChildren(
        h('p', { class: 'small muted', style: { marginBottom: '12px' } }, learning.length ? 'Các chữ trong những từ bạn đang học, mới nhất trước.' : 'Bạn chưa học từ nào, đây là chữ của bài đầu tiên.'),
        button('Luyện liền 6 từ', { href: `#/write/words/${sample}`, icon: 'play', cls: 'btn-block' }),
        h('div', { style: { marginTop: '16px' } }, charGrid(entries)),
      );
    } else if (hubTab === 'lessons') {
      const level = store.state.settings.levels[0] || 3;
      const listEl = h('div', { class: 'list stagger', style: { marginTop: '12px' } });
      const drawLessons = (lv) => {
        listEl.replaceChildren(
          ...db.lessonsByLevel[lv].map((l) =>
            h(
              'a',
              { href: `#/write/lesson/${l.id}`, class: 'row-link' },
              h('span', { class: 'tile', 'aria-hidden': 'true' }, db.topicById.get(l.topic).icon),
              h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, lessonTitle(l)), h('span', { class: 'row-sub zh', style: { fontWeight: '600' } }, l.words.map((id) => word(id).hanzi).join(' '))),
              icon('chevron', 18),
            ),
          ),
        );
      };
      area.replaceChildren(
        segmented(
          [
            [3, 'HSK 3'],
            [4, 'HSK 4'],
          ],
          level,
          drawLessons,
          'Chọn cấp HSK',
        ),
        listEl,
      );
      drawLessons(level);
    } else {
      const stats = Object.entries(store.state.writing)
        .filter(([, v]) => v.n > 0)
        .map(([ch, v]) => [ch, v.mistakes / v.n, v])
        .filter(([, avg]) => avg > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40);
      if (!stats.length) {
        area.replaceChildren(emptyState('Chưa có chữ nào viết sai', 'Sau khi luyện viết, các chữ bạn hay sai nét sẽ hiện ở đây để luyện lại.'));
        return;
      }
      const entries = stats
        .map(([ch, avg]) => {
          const wid = db.chars[ch]?.words?.[0];
          return wid ? [ch, word(wid), `sai ${avg.toFixed(1)}/lần`] : null;
        })
        .filter(Boolean);
      area.replaceChildren(
        button('Luyện lại các chữ này', { href: `#/write/words/${[...new Set(entries.map(([, w]) => w.id))].slice(0, 10).join(',')}`, icon: 'play', cls: 'btn-block' }),
        h('div', { style: { marginTop: '16px' } }, charGrid(entries)),
      );
    }
  }

  const results = h('div', { class: 'list', style: { marginTop: '12px' } });
  const input = h('input', { type: 'search', placeholder: 'Tìm chữ cần viết', 'aria-label': 'Tìm chữ để luyện viết', autocomplete: 'off' });
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) {
      results.replaceChildren();
      return;
    }
    results.replaceChildren(
      ...search(q, 12).map((w) =>
        h(
          'a',
          { href: `#/write/word/${w.id}`, class: 'row-link word-row' },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, zh(w.hanzi), pinyinWord(w.py)), h('span', { class: 'row-sub' }, w.vi)),
          icon('pen', 18),
        ),
      ),
    );
  });

  const el = h(
    'div',
    { class: 'view' },
    h('header', { class: 'topbar' }, h('h1', { class: 'grow' }, 'Luyện viết')),
    h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Xem thứ tự nét, tô theo mẫu rồi tự viết từ trí nhớ. Viết bằng ngón tay hoặc chuột ngay trên ô chữ.'),
    h('label', { class: 'search' }, icon('search', 20), input),
    results,
    h(
      'div',
      { style: { marginTop: '16px' } },
      segmented(
        [
          ['learning', 'Từ đang học'],
          ['lessons', 'Theo bài'],
          ['mistakes', 'Hay viết sai'],
        ],
        hubTab,
        (v) => {
          hubTab = v;
          draw();
        },
        'Nguồn chữ',
      ),
    ),
    area,
  );
  draw();
  return { el, title: 'Luyện viết' };
}

// ---------------- màn luyện ----------------
function renderPractice(ctx, words, title) {
  const { store } = ctx;
  // danh sách chữ cần viết (không lặp), kèm từ chứa chữ đó
  const items = [];
  const seen = new Set();
  for (const w of words) {
    [...w.hanzi].forEach((ch, i) => {
      if (seen.has(ch) || !charInfo(ch)) return;
      seen.add(ch);
      items.push({ ch, w, pos: i });
    });
  }
  let idx = 0;
  let mode = 'watch';
  let writer = null;
  let strokeCount = 0;
  let stepNum = 0;
  let mistakes = 0;
  let strokesDone = 0;
  let destroyed = false;
  let resizeObs = null;
  let boardSize = 0;
  const results = new Map();

  const progressFill = h('span', { class: 'bar-fill' });
  const progress = h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Tiến độ luyện viết' }, progressFill);
  const countEl = h('span', { class: 'session-count' });
  const top = h('header', { class: 'session-top' }, h('a', { class: 'icon-btn', href: '#/write', 'aria-label': 'Thoát luyện viết' }, icon('close', 24)), progress, countEl);

  const wordLine = h('section', { class: 'write-word' });
  const modeSeg = segmented(MODES, mode, (v) => setMode(v), 'Chế độ luyện');
  const board = h('div', { class: 'tzg' });
  board.innerHTML = '<svg class="diag" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;inset:0"><line x1="0" y1="0" x2="100" y2="100"/><line x1="100" y1="0" x2="0" y2="100"/></svg>';
  const hw = h('div', { class: 'hw', role: 'img' });
  board.append(hw);
  const status = h('div', { class: 'write-status', 'aria-live': 'polite' });
  const tools = h('div', { class: 'write-tools' });
  const result = h('div');
  const facts = h('div', { class: 'char-facts' });

  const el = h(
    'div',
    { class: 'view full' },
    top,
    wordLine,
    h('div', { style: { marginTop: '14px' } }, modeSeg),
    h('section', { class: 'write-board' }, board, status, tools, result, facts),
  );

  function current() {
    return items[idx];
  }

  function updateProgress() {
    progressFill.style.width = `${(results.size / items.length) * 100}%`;
    countEl.textContent = `${Math.min(idx + 1, items.length)}/${items.length}`;
  }

  function drawWordLine() {
    const { w, pos } = current();
    wordLine.replaceChildren(
      h(
        'div',
        { class: 'ww-hz zh', lang: 'zh-CN' },
        [...w.hanzi].map((ch, i) => h('span', { class: i === pos ? 'on' : results.has(ch) ? 'done' : '' }, ch)),
      ),
      h('div', { class: 'ww-meta' }, pinyinWord(w.py), h('span', { class: 'muted' }, w.vi.split(';')[0])),
    );
    const info = charInfo(current().ch);
    facts.replaceChildren(
      h('span', { class: 'chip' }, `${info.strokes} nét`),
      h('span', { class: 'chip' }, 'Bộ ', h('b', { class: 'zh', style: { margin: '0 2px' } }, info.radical || '?'), info.radVi || ''),
      h('span', { class: 'chip' }, 'Hán Việt: ', h('b', { style: { marginLeft: '3px' } }, (w_hv(current()) || '').toUpperCase())),
      h('button', { type: 'button', class: 'chip', style: { border: '0' }, onclick: () => speak(current().ch, store.state.settings.rate) }, icon('sound', 16), 'Nghe'),
    );
    hw.setAttribute('aria-label', `Ô viết chữ ${current().ch}`);
  }

  function w_hv({ w, pos }) {
    return w.hv.split(' ')[pos];
  }

  function drawStatus() {
    if (mode === 'watch') {
      status.replaceChildren(h('span', null, 'Thứ tự nét: ', h('b', null, `${Math.min(stepNum, strokeCount)}/${strokeCount}`)), h('span', null, 'Nét bộ thủ tô màu xanh'));
    } else {
      status.replaceChildren(h('span', null, 'Đã viết: ', h('b', null, `${strokesDone}/${strokeCount}`), ' nét'), h('span', null, 'Sai: ', h('b', null, String(mistakes))));
    }
  }

  async function ensureWriter() {
    const { ch } = current();
    const size = Math.round(board.clientWidth || 300);
    if (!writer) {
      boardSize = size;
      writer = await createWriter(hw, ch, { size, showCharacter: false, showOutline: true, radical: true });
      // xoay màn hình hoặc đổi cỡ cửa sổ: vẽ lại bảng viết theo cỡ mới, giữ nguyên nét đang viết
      if (typeof ResizeObserver === 'function') {
        resizeObs = new ResizeObserver(() => {
          const s = Math.round(board.clientWidth);
          if (!writer || s <= 0 || Math.abs(s - boardSize) < 3) return;
          boardSize = s;
          writer.updateDimensions({ width: s, height: s, padding: Math.round(s * 0.06) });
        });
        resizeObs.observe(board);
      }
    } else {
      await writer.setCharacter(ch);
    }
    const charData = await loadCharData(ch);
    strokeCount = charData.strokes.length;
  }

  async function setMode(m) {
    mode = m;
    modeSeg.querySelectorAll('.seg-btn').forEach((b, i) => b.setAttribute('aria-checked', String(MODES[i][0] === m)));
    result.replaceChildren();
    if (!writer) return;
    writer.cancelQuiz();
    mistakes = 0;
    strokesDone = 0;
    stepNum = 0;
    if (m === 'watch') {
      await writer.showOutline();
      await writer.hideCharacter();
      drawTools();
      drawStatus();
      playAll();
    } else {
      // bắt đầu chấm ngay để nét viết đầu tiên không bị bỏ qua; mẫu mờ ẩn/hiện song song
      if (m === 'trace') writer.showOutline();
      else writer.hideOutline();
      drawTools();
      drawStatus();
      startQuiz();
    }
  }

  function playAll() {
    stepNum = 0;
    drawStatus();
    writer.hideCharacter();
    writer.animateCharacter({
      onComplete: () => {
        stepNum = strokeCount;
        drawStatus();
      },
    });
  }

  async function stepOnce() {
    if (stepNum >= strokeCount) {
      stepNum = 0;
      await writer.hideCharacter();
    }
    await writer.animateStroke(stepNum);
    stepNum += 1;
    drawStatus();
  }

  function startQuiz() {
    mistakes = 0;
    strokesDone = 0;
    drawStatus();
    writer.quiz({
      showHintAfterMisses: mode === 'trace' ? 2 : 3,
      leniency: mode === 'trace' ? 1.2 : 1,
      markStrokeCorrectAfterMisses: mode === 'recall' ? 5 : false,
      onMistake: () => {
        mistakes += 1;
        ctx.activity();
        vibrate(25);
        drawStatus();
      },
      onCorrectStroke: () => {
        strokesDone += 1;
        ctx.activity();
        drawStatus();
      },
      onComplete: ({ totalMistakes }) => {
        mistakes = totalMistakes;
        strokesDone = strokeCount;
        drawStatus();
        complete();
      },
    });
  }

  function complete() {
    const { ch } = current();
    const stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
    // viết xong: thay hàng công cụ bằng kết quả và nút đi tiếp
    tools.replaceChildren();
    if (mode === 'recall') {
      store.recordWriting(ch, mistakes);
      results.set(ch, Math.min(results.get(ch) ?? 99, mistakes));
      updateProgress();
      drawWordLine();
    }
    const msg = mode === 'trace' ? (mistakes === 0 ? 'Tô rất chuẩn! Giờ thử tự viết không nhìn mẫu.' : 'Đã tô xong. Thử tự viết để nhớ lâu hơn.') : mistakes === 0 ? 'Hoàn hảo, đúng hết các nét!' : `Xong! Sai ${mistakes} lần — viết lại để nhớ chắc hơn.`;
    const primary =
      mode === 'trace'
        ? button('Tự viết', { icon: 'pen', onclick: () => setMode('recall') })
        : idx + 1 < items.length
          ? button('Chữ tiếp theo', { icon: 'steps', onclick: () => go(idx + 1) })
          : button('Hoàn thành', { icon: 'check', onclick: finish });
    result.replaceChildren(
      h(
        'div',
        { class: 'write-result', role: 'status' },
        h('div', { class: 'stars', 'aria-label': `${stars} trên 3 sao` }, [1, 2, 3].map((i) => h('span', { class: i <= stars ? 'on' : '', html: STAR }))),
        h('p', { class: 'small', style: { textAlign: 'center' } }, msg),
        h('div', { class: 'write-tools', style: { marginTop: '6px' } }, button('Viết lại', { icon: 'rotate', variant: 'secondary', onclick: () => setMode(mode) }), primary),
      ),
    );
  }

  function drawTools() {
    if (mode === 'watch') {
      tools.replaceChildren(
        button('Phát lại', { icon: 'play', variant: 'secondary', size: 'sm', onclick: playAll }),
        button('Từng nét', { icon: 'steps', variant: 'secondary', size: 'sm', onclick: stepOnce }),
        button('Tô theo', { icon: 'pen', size: 'sm', onclick: () => setMode('trace') }),
      );
    } else {
      tools.replaceChildren(
        button('Gợi ý', {
          icon: 'eye',
          variant: 'secondary',
          size: 'sm',
          onclick: async () => {
            if (mode === 'recall') {
              await writer.showOutline();
              setTimeout(() => !destroyed && mode === 'recall' && writer.hideOutline(), 1200);
            } else {
              writer.highlightStroke(Math.min(strokesDone, strokeCount - 1));
            }
          },
        }),
        button('Viết lại', { icon: 'rotate', variant: 'secondary', size: 'sm', onclick: () => setMode(mode) }),
        button('Bỏ qua', { icon: 'steps', variant: 'ghost', size: 'sm', onclick: () => (idx + 1 < items.length ? go(idx + 1) : finish()) }),
      );
    }
  }

  async function go(i) {
    idx = i;
    drawWordLine();
    updateProgress();
    result.replaceChildren();
    try {
      await ensureWriter();
    } catch {
      toast('Không tải được nét chữ, hãy kiểm tra mạng');
      return;
    }
    if (destroyed) return;
    await setMode('watch');
  }

  function finish() {
    const list = items.map(({ ch, w }) => {
      const m = results.get(ch);
      return h(
        'a',
        { href: `#/write/word/${w.id}`, class: 'row-link', style: { padding: '10px 14px' } },
        zh(ch, 'row-title'),
        h('span', { class: 'row-main' }, h('span', { class: 'row-sub' }, `${w.hanzi} · ${w.vi.split(';')[0]}`)),
        m === undefined ? h('span', { class: 'small muted' }, 'Bỏ qua') : m === 0 ? h('span', { class: 'badge-soft', style: { background: 'var(--good-soft)', color: 'var(--good)' } }, 'Không sai') : h('span', { class: 'pill-bad' }, `Sai ${m}`),
      );
    });
    el.replaceChildren(
      top,
      h(
        'section',
        { class: 'done-screen' },
        h('div', { class: 'medal' }, icon('pen', 40)),
        h('h1', null, 'Viết xong!'),
        h('p', { class: 'muted' }, `Bạn đã tự viết ${results.size}/${items.length} chữ.`),
        h('div', { class: 'list', style: { width: '100%', maxWidth: '420px', marginTop: '16px' } }, list),
        h('div', { class: 'done-actions' }, button('Luyện lại', { icon: 'rotate', variant: 'secondary', onclick: () => ctx.navigate(location.hash) }), button('Chọn chữ khác', { href: '#/write', icon: 'pen' })),
      ),
    );
    progressFill.style.width = '100%';
    confetti();
  }

  // dựng bảng viết khi đã gắn vào trang (cần kích thước thật)
  return {
    el,
    title,
    immersive: true,
    mounted() {
      go(0);
    },
    destroy() {
      destroyed = true;
      resizeObs?.disconnect();
      try {
        writer?.cancelQuiz();
        writer?.pauseAnimation();
      } catch {
        /* bỏ qua */
      }
    },
  };
}
