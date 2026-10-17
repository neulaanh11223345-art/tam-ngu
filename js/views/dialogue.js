// Đọc và luyện một hội thoại: đọc (nghe từng câu hoặc cả bài), nhập vai, điền từ.
// Dùng cho hội thoại theo bài (#/dialogue/<mã bài>) và hội thoại tự nhập (#/mine/<id>).
import { dialogue, lesson, lessonTitle, loadDialogues, loadLexicon, word, wordByHanzi } from '../data.js';
import { button, emptyState, h, icon, pinyinSentence, segmented, toast, zh } from '../dom.js';
import { annotate, parseDialogueText } from '../pygen.js';
import { makeRng, shuffle } from '../quiz.js';
import { hasChineseVoice, hasVoice, speak, stopSpeaking } from '../speech.js';
import { confetti, displaySheet, displaySummary, sayAs, speakButton, wordPeek } from './common.js';

const PITCH = [1, 1.18, 0.9];

/** Hội thoại tự nhập → cùng dạng với hội thoại theo bài. */
export async function mineModel(id, entry) {
  const lex = await loadLexicon();
  const { cast, lines } = parseDialogueText(entry.text || '');
  return {
    kind: 'mine',
    id,
    title: { zh: '', vi: entry.title || 'Hội thoại của bạn' },
    cast: cast.map((c) => ({ zh: c, vi: c })),
    lines: lines.map((l) => {
      const { py, tokens } = annotate(l.zh, lex);
      return { ...l, py, tokens };
    }),
    words: [],
    lex,
  };
}

/** Các đoạn của một câu: chữ thường và từ bấm được để tra nghĩa. */
function lineSegments(line, model) {
  if (model.kind === 'lesson') {
    const targets = model.words.map(word).sort((a, b) => b.hanzi.length - a.hanzi.length);
    const out = [];
    let rest = line.zh;
    while (rest) {
      let best = null;
      for (const w of targets) {
        const i = rest.indexOf(w.hanzi);
        if (i >= 0 && (!best || i < best.i || (i === best.i && w.hanzi.length > best.w.hanzi.length))) best = { i, w };
      }
      if (!best) {
        out.push(rest);
        break;
      }
      if (best.i) out.push(rest.slice(0, best.i));
      out.push({ text: best.w.hanzi, w: best.w });
      rest = rest.slice(best.i + best.w.hanzi.length);
    }
    return out;
  }
  // hội thoại tự nhập: gạch chân từ có trong từ vựng HSK 3–5 hoặc HSK 6
  return line.tokens.map((t) => {
    const w = wordByHanzi(t);
    if (w) return { text: t, w };
    if (model.lex.g6[t]) return { text: t, gloss: model.lex.g6[t], py: model.lex.w[t] };
    return t;
  });
}

export function render(ctx) {
  const { store, params } = ctx;
  const [kind, id] = params;
  const el = h('div', { class: 'view' }, h('div', { class: 'boot', role: 'status' }, h('p', null, 'Đang mở hội thoại…')));
  let cleanup = () => {};

  const ready = (async () => {
    let model;
    if (kind === 'mine') {
      const entry = store.state.mine[id];
      if (!entry || entry.deleted) {
        ctx.navigate('#/library', { replace: true });
        return;
      }
      model = await mineModel(id, entry);
    } else {
      await loadDialogues();
      const d = dialogue(id);
      if (!d) {
        el.replaceChildren(emptyState('Không tìm thấy hội thoại', 'Bài này chưa có hội thoại.'));
        return;
      }
      model = { kind: 'lesson', ...d };
    }
    cleanup = draw(model);
  })().catch((e) => {
    el.replaceChildren(emptyState('Không mở được hội thoại', `${e.message || e}. Hãy kiểm tra mạng rồi thử lại.`));
  });

  function draw(model) {
    const l = model.kind === 'lesson' ? lesson(model.id) : null;
    const back = model.kind === 'lesson' ? `#/lesson/${model.id}` : '#/library';
    let mode = ['line', 'role', 'cloze'].includes(ctx.query.get('mode')) ? ctx.query.get('mode') : 'read';
    let playing = false;
    let stopRequested = false;
    let lineIndex = 0;
    const voice = hasChineseVoice();

    const head = h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: back, 'aria-label': 'Quay lại' }, icon('back', 24)),
      h('span', { class: 'topbar-title' }, model.kind === 'lesson' ? `Bài khóa · HSK ${model.level}` : 'Hội thoại của bạn'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tùy chọn hiển thị', title: 'Tùy chọn hiển thị', onclick: () => openDisplay() }, icon('sliders', 22)),
      model.kind === 'mine' ? h('a', { class: 'icon-btn', href: `#/mine/${model.id}/edit`, 'aria-label': 'Sửa hội thoại' }, icon('pen', 22)) : null,
    );

    const intro = h(
      'section',
      { class: 'dlg-intro' },
      model.title.zh ? zh(model.title.zh, 'dlg-title-zh') : null,
      h('h1', { class: 'dlg-title' }, model.title.vi),
      model.title.en ? h('p', { class: 'dlg-title-en', lang: 'en' }, model.title.en) : null,
      model.scene ? h('p', { class: 'muted dlg-scene' }, model.scene.vi) : null,
      h(
        'div',
        { class: 'dlg-cast' },
        model.cast.map((c, i) => h('span', { class: `cast-chip s${i}` }, h('i', { 'aria-hidden': 'true' }), c.zh !== c.vi ? [zh(c.zh), ` ${c.vi}`] : c.vi)),
        l ? h('a', { class: 'chip', href: `#/lesson/${l.id}` }, icon('book', 14), lessonTitle(l)) : null,
      ),
    );

    const modes = [['read', 'Cả bài'], ['line', 'Từng câu'], ['role', 'Nhập vai']];
    if (model.kind === 'lesson' && model.words.length >= 3) modes.push(['cloze', 'Điền từ']);
    const modeSeg = segmented(modes, mode, (v) => setMode(v), 'Cách luyện');
    const body = h('div', { class: 'dlg-body' });

    el.replaceChildren(head, intro, h('div', { class: 'dlg-modes' }, modeSeg), body);

    function show() {
      return { zh: true, py: true, vi: true, en: false, ...store.state.settings.dlg };
    }

    function openDisplay() {
      displaySheet(store, () => redraw());
    }

    function redraw() {
      if (mode === 'read') drawRead();
      else if (mode === 'line') drawLine();
    }

    function sayBtn(text, lang, line, cls = 'mini-say', size = 18) {
      return speakButton(text, store, { lang, cls, size, pitch: PITCH[line.s % 3] });
    }

    /** Chữ Hán của câu, từ của bài bấm được để tra nghĩa. */
    function zhText(line, cls = 'b-zh') {
      const textEl = h('p', { class: cls, lang: 'zh-CN' });
      for (const seg of lineSegments(line, model)) {
        if (typeof seg === 'string') textEl.append(seg);
        else
          textEl.append(
            h('button', {
              type: 'button',
              class: `wtap ${seg.w ? 'hl' : 'soft'}`,
              onclick: (e) => {
                e.stopPropagation();
                peek(seg);
              },
            }, seg.text),
          );
      }
      return textEl;
    }

    function peek(seg) {
      if (seg.w) wordPeek({ hanzi: seg.w.hanzi, py: seg.w.py, vi: seg.w.vi, en: seg.w.en, id: seg.w.id, level: seg.w.level }, store);
      else wordPeek({ hanzi: seg.text, py: seg.py, en: seg.gloss, level: 6 }, store);
    }

    function bubble(line, i, { forceZh = false } = {}) {
      const s = show();
      const speaker = model.cast[line.s] || model.cast[0];
      return h(
        'article',
        { class: `bubble s${line.s % 3} ${line.s % 2 ? 'right' : 'left'}`, 'data-i': String(i) },
        h('header', { class: 'b-who' }, h('span', null, speaker.vi), speaker.zh !== speaker.vi ? zh(speaker.zh) : null),
        h(
          'div',
          { class: 'b-main' },
          h(
            'div',
            { class: 'b-text' },
            s.zh || forceZh ? zhText(line) : null,
            s.py && line.py ? h('p', { class: 'b-py' }, pinyinSentence(line.py)) : null,
            s.vi && line.vi ? h('p', { class: 'b-vi b-layer' }, h('span', null, line.vi), sayBtn(line.vi, 'vi', line)) : null,
            s.en && line.en ? h('p', { class: 'b-en b-layer', lang: 'en' }, h('span', null, line.en), sayBtn(line.en, 'en', line)) : null,
          ),
          sayBtn(line.zh, 'zh', line, 'icon-btn soft b-say', 20),
        ),
      );
    }

    function displayChip() {
      return h('button', { type: 'button', class: 'chip chip-btn', onclick: () => openDisplay(), 'aria-label': `Tùy chọn hiển thị: ${displaySummary(show())}` }, icon('sliders', 14), displaySummary(show()));
    }

    function playLabel() {
      const p = store.state.settings.playLang;
      return p === 'en' ? 'Nghe cả bài (Anh)' : p === 'zh-en' ? 'Nghe cả bài (Trung + Anh)' : 'Nghe cả bài';
    }

    // ---------- Đọc cả bài ----------
    function drawRead() {
      const playBtn = button(playing ? 'Dừng' : playLabel(), { icon: playing ? 'close' : 'play', size: 'sm', variant: voice ? 'primary' : 'secondary', disabled: !voice && store.state.settings.playLang === 'zh', onclick: () => (playing ? stopAll() : playAll()) });
      const list = h('div', { class: 'chat' }, model.lines.map((line, i) => bubble(line, i)));
      const used = model.words.map(word).filter(Boolean);
      body.replaceChildren(
        h('div', { class: 'dlg-tools' }, displayChip(), playBtn),
        voice ? null : h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Máy chưa có giọng đọc tiếng Trung nên chưa nghe được tiếng Trung. Hãy cài giọng tiếng Trung (Trung Quốc) trong cài đặt máy.'),
        list,
        used.length
          ? h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Từ của bài trong hội thoại')), h('div', { class: 'word-chips' }, used.map((w) => h('a', { class: 'chip', href: `#/word/${w.id}` }, zh(w.hanzi), h('span', { class: 'muted' }, w.vi.split(/[;,]/)[0])))))
          : model.kind === 'mine'
            ? h('p', { class: 'small muted', style: { marginTop: '14px' } }, 'Chữ có gạch chân là từ HSK 3–6: bấm vào để xem nghĩa. Pinyin được app tự thêm, có thể sai ở vài chữ đa âm.')
            : null,
        h('div', { class: 'done-actions', style: { marginTop: '20px' } }, button('Đã đọc xong', { icon: 'check', variant: 'secondary', onclick: () => finishRead() })),
      );
    }

    async function playAll() {
      let langs = store.state.settings.playLang === 'zh-en' ? ['zh', 'en'] : [store.state.settings.playLang || 'zh'];
      if (langs.includes('en') && !hasVoice('en')) {
        toast('Máy chưa có giọng đọc tiếng Anh, chỉ đọc tiếng Trung.');
        langs = ['zh'];
      }
      playing = true;
      stopRequested = false;
      drawRead();
      const nodes = [...body.querySelectorAll('.bubble')];
      for (let i = 0; i < model.lines.length; i++) {
        if (stopRequested || mode !== 'read') break;
        const line = model.lines[i];
        nodes.forEach((n) => n.classList.toggle('speaking', n === nodes[i]));
        nodes[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        for (const lang of langs) {
          if (stopRequested || mode !== 'read') break;
          const text = lang === 'en' ? line.en : line.zh;
          if (!text) continue;
          await sayAs(store, text, lang, { pitch: PITCH[line.s % 3] });
          await new Promise((r) => setTimeout(r, 200));
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      const finished = !stopRequested && mode === 'read';
      playing = false;
      if (mode === 'read') drawRead();
      if (finished) finishRead(true);
    }

    function stopAll() {
      stopRequested = true;
      stopSpeaking();
      playing = false;
      drawRead();
    }

    function finishRead(quiet) {
      const d = store.recordDialogue(dlgKey(), undefined);
      ctx.activity();
      if (!quiet) toast(d.reads > 1 ? `Đã đọc ${d.reads} lần` : 'Đã đánh dấu đã đọc');
    }

    function dlgKey() {
      return model.kind === 'mine' ? `mine:${model.id}` : model.id;
    }

    // ---------- Từng câu ----------
    function drawLine() {
      const n = model.lines.length;
      lineIndex = Math.max(0, Math.min(lineIndex, n - 1));
      const line = model.lines[lineIndex];
      const s = show();
      const speaker = model.cast[line.s] || model.cast[0];
      const tabs = h(
        'div',
        { class: 'line-tabs', role: 'tablist', 'aria-label': 'Chọn câu' },
        model.lines.map((_, i) =>
          h('button', { type: 'button', role: 'tab', class: 'line-tab', 'aria-selected': String(i === lineIndex), onclick: () => go(i) }, `Câu ${i + 1}`),
        ),
      );
      const layer = (key, badge, label, text, lang, content) =>
        h(
          'div',
          { class: `layer-card lang-${key}` },
          h('div', { class: 'layer-head' }, h('span', { class: `opt-badge lang-${key}`, 'aria-hidden': 'true' }, badge), h('span', null, label)),
          h('div', { class: 'layer-body' }, h('div', { class: 'layer-text', lang: lang === 'en' ? 'en' : null }, content || text), sayBtn(lang === 'py' ? line.zh : text, lang === 'py' ? 'zh' : lang, line, 'icon-btn soft layer-say', 20)),
        );
      const words = lineSegments(line, model).filter((seg) => typeof seg !== 'string');
      const seen = new Set();
      const uniq = words.filter((seg) => !seen.has(seg.text) && seen.add(seg.text));
      const card = h(
        'article',
        { class: 'card line-card' },
        h('header', { class: `line-who s${line.s % 3}` }, h('i', { 'aria-hidden': 'true' }), speaker.vi, speaker.zh !== speaker.vi ? zh(speaker.zh) : null, h('span', { class: 'line-count' }, `${lineIndex + 1}/${n}`)),
        h('div', { class: 'line-main' }, s.zh || (!s.py && !s.vi && !s.en) ? zhText(line, 'line-zh') : h('p', { class: 'line-hidden muted' }, 'Đã ẩn chữ Hán. Bấm loa để nghe, rồi tự nói lại.'), sayBtn(line.zh, 'zh', line, 'speak-btn', 22)),
        h(
          'div',
          { class: 'layers' },
          s.py && line.py ? layer('py', 'pīn', 'Pinyin', line.py, 'py', pinyinSentence(line.py)) : null,
          s.vi && line.vi ? layer('vi', 'VI', 'Tiếng Việt', line.vi, 'vi') : null,
          s.en && line.en ? layer('en', 'EN', 'Tiếng Anh', line.en, 'en') : null,
        ),
      );
      const wordSec = uniq.length
        ? h(
            'section',
            { class: 'line-words' },
            h('h3', null, 'Từ trong câu'),
            h(
              'div',
              { class: 'word-chips' },
              uniq.map((seg) => h('button', { type: 'button', class: 'chip chip-btn', onclick: () => peek(seg) }, zh(seg.text), h('span', { class: 'muted' }, (seg.w ? seg.w.vi : seg.gloss || '').split(/[;,]/)[0]))),
            ),
          )
        : null;
      const last = lineIndex === n - 1;
      const nav = h(
        'div',
        { class: 'line-nav' },
        button('Câu trước', { icon: 'back', variant: 'secondary', disabled: lineIndex === 0, onclick: () => go(lineIndex - 1) }),
        last
          ? button('Hoàn thành', { icon: 'check', onclick: () => (finishRead(), confetti()) })
          : button('Câu tiếp theo', { icon: 'steps', cls: 'icon-end', onclick: () => go(lineIndex + 1, true) }),
      );
      body.replaceChildren(h('div', { class: 'dlg-tools' }, displayChip()), tabs, card, wordSec, nav);
      tabs.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }

    function go(i, autoplay = false) {
      lineIndex = i;
      drawLine();
      body.querySelector('.line-card')?.classList.add('enter');
      if (autoplay && voice) sayAs(store, model.lines[i].zh, 'zh', { pitch: PITCH[model.lines[i].s % 3] });
    }

    // ---------- Nhập vai ----------
    function drawRole() {
      let me = 0;
      let step = 0;
      let revealed = false;
      const roleSeg = segmented(
        model.cast.map((c, i) => [i, c.vi]),
        me,
        (v) => {
          me = v;
          step = 0;
          revealed = false;
          drawStep();
        },
        'Chọn vai của bạn',
      );
      const chat = h('div', { class: 'chat' });
      const controls = h('div', { class: 'role-controls' });
      body.replaceChildren(h('p', { class: 'small muted', style: { margin: '14px 0 8px' } }, 'Chọn vai. Câu của người kia được đọc lên; đến lượt bạn thì nói câu tiếng Trung theo nghĩa gợi ý rồi bấm Hiện câu để so.'), roleSeg, chat, controls);

      function drawStep() {
        chat.replaceChildren(...model.lines.slice(0, step + 1).map((line, i) => (line.s === me && i === step && !revealed ? promptBubble(line) : bubble(line, i, { forceZh: true }))));
        const line = model.lines[step];
        chat.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const last = step >= model.lines.length - 1;
        if (line.s === me && !revealed) {
          controls.replaceChildren(button('Hiện câu', { icon: 'eye', onclick: () => ((revealed = true), drawStep(), speak(line.zh, store.state.settings.rate, PITCH[line.s % 3])) }));
        } else {
          controls.replaceChildren(
            last
              ? button('Xong vai này', { icon: 'check', onclick: () => {
                  store.recordDialogue(dlgKey(), undefined);
                  ctx.activity();
                  confetti();
                  controls.replaceChildren(h('p', { class: 'small', style: { textAlign: 'center' } }, 'Tốt lắm! Đổi vai để luyện phần còn lại.'), button('Luyện lại', { icon: 'rotate', variant: 'secondary', onclick: () => ((step = 0), (revealed = false), drawStep()) }));
                } })
              : button('Tiếp', { icon: 'steps', onclick: () => next() }),
          );
          if (line.s !== me && revealed !== 'spoken') {
            revealed = 'spoken';
            if (voice) speak(line.zh, store.state.settings.rate, PITCH[line.s % 3]);
          }
        }
      }
      function next() {
        step += 1;
        revealed = false;
        drawStep();
      }
      function promptBubble(line) {
        return h(
          'article',
          { class: `bubble s${line.s % 3} ${line.s % 2 ? 'right' : 'left'} prompt` },
          h('header', { class: 'b-who' }, h('span', null, `${model.cast[line.s].vi} (bạn)`)),
          h('div', { class: 'b-main' }, h('div', { class: 'b-text' }, h('p', { class: 'b-ask' }, 'Bạn nói bằng tiếng Trung:'), h('p', { class: 'b-vi' }, line.vi || '(chưa có bản dịch, hãy nhớ lại câu tiếng Trung)'))),
        );
      }
      drawStep();
    }

    // ---------- Điền từ ----------
    function drawCloze() {
      const targets = model.words.map(word).filter(Boolean).sort((a, b) => b.hanzi.length - a.hanzi.length);
      const blanks = [];
      const used = new Set();
      const lines = model.lines.map((line) => {
        const parts = [];
        let rest = line.zh;
        // mỗi từ chỉ làm trống một lần, ở chỗ xuất hiện đầu tiên
        while (rest) {
          let best = null;
          for (const w of targets) {
            if (used.has(w.id)) continue;
            const i = rest.indexOf(w.hanzi);
            if (i >= 0 && (!best || i < best.i)) best = { i, w };
          }
          if (!best) {
            parts.push(rest);
            break;
          }
          if (best.i) parts.push(rest.slice(0, best.i));
          used.add(best.w.id);
          const b = { w: best.w, value: null, el: null };
          blanks.push(b);
          parts.push(b);
          rest = rest.slice(best.i + best.w.hanzi.length);
        }
        return { line, parts };
      });
      let selected = 0;
      let checked = false;
      const bank = h('div', { class: 'word-bank', role: 'group', 'aria-label': 'Các từ để điền' });
      const result = h('div');
      const chat = h(
        'div',
        { class: 'chat cloze' },
        lines.map(({ line, parts }) =>
          h(
            'article',
            { class: `bubble s${line.s % 3} ${line.s % 2 ? 'right' : 'left'}` },
            h('header', { class: 'b-who' }, h('span', null, model.cast[line.s].vi)),
            h(
              'div',
              { class: 'b-main' },
              h(
                'div',
                { class: 'b-text' },
                h(
                  'p',
                  { class: 'b-zh', lang: 'zh-CN' },
                  parts.map((p) => {
                    if (typeof p === 'string') return p;
                    p.el = h('button', { type: 'button', class: 'blank-slot', 'aria-label': 'Chỗ trống', onclick: () => pick(blanks.indexOf(p)) }, '　');
                    return p.el;
                  }),
                ),
                show().vi && line.vi ? h('p', { class: 'b-vi' }, line.vi) : null,
              ),
            ),
          ),
        ),
      );
      const options = shuffle(blanks.map((b) => b.w), makeRng());
      function pick(i) {
        if (checked) return;
        selected = i;
        if (blanks[i].value) {
          blanks[i].value = null;
        }
        drawState();
      }
      function choose(w) {
        if (checked) return;
        const target = blanks[selected] && !blanks[selected].value ? selected : blanks.findIndex((b) => !b.value);
        if (target < 0) return;
        blanks[target].value = w;
        const nextEmpty = blanks.findIndex((b) => !b.value);
        selected = nextEmpty < 0 ? target : nextEmpty;
        drawState();
      }
      function drawState() {
        const usedIds = new Set(blanks.filter((b) => b.value).map((b) => b.value.id));
        blanks.forEach((b, i) => {
          b.el.textContent = b.value ? b.value.hanzi : '　';
          b.el.classList.toggle('filled', Boolean(b.value));
          b.el.classList.toggle('active', !checked && i === selected);
          if (checked) {
            b.el.classList.toggle('right', b.value?.id === b.w.id);
            b.el.classList.toggle('wrong', b.value?.id !== b.w.id);
          }
        });
        bank.replaceChildren(...options.map((w) => h('button', { type: 'button', class: 'chip bank-chip', disabled: usedIds.has(w.id) || checked ? true : null, onclick: () => choose(w) }, zh(w.hanzi))));
        const full = blanks.every((b) => b.value);
        if (!checked) result.replaceChildren(button('Chấm điểm', { icon: 'check', cls: 'btn-block', disabled: !full, onclick: grade }));
      }
      function grade() {
        checked = true;
        const right = blanks.filter((b) => b.value?.id === b.w.id).length;
        const score = right / blanks.length;
        store.recordDialogue(dlgKey(), score);
        ctx.activity();
        drawState();
        if (score === 1) confetti();
        result.replaceChildren(
          h(
            'div',
            { class: `feedback ${score === 1 ? 'ok' : 'no'}`, role: 'status', style: { margin: '16px 0 0', borderRadius: '18px' } },
            h('h3', null, icon(score === 1 ? 'check' : 'list', 22), `Đúng ${right}/${blanks.length} chỗ trống`),
            score < 1 ? h('p', null, 'Ô đỏ là chỗ chưa đúng. Đáp án: ', blanks.filter((b) => b.value?.id !== b.w.id).map((b) => b.w.hanzi).join('、')) : h('p', null, 'Bạn đã dùng đúng mọi từ của bài.'),
            button('Làm lại', { icon: 'rotate', onclick: () => drawCloze() }),
          ),
        );
      }
      body.replaceChildren(h('p', { class: 'small muted', style: { margin: '14px 0 8px' } }, 'Chọn một chỗ trống rồi bấm từ phù hợp bên dưới. Bấm lại chỗ đã điền để xóa.'), chat, h('div', { class: 'cloze-dock' }, bank, result));
      drawState();
    }

    function setMode(m) {
      if (playing) stopAll();
      mode = m;
      modeSeg.querySelectorAll('.seg-btn').forEach((b, i) => b.setAttribute('aria-checked', String(modes[i][0] === m)));
      if (m === 'read') drawRead();
      else if (m === 'line') drawLine();
      else if (m === 'role') drawRole();
      else drawCloze();
    }

    if (mode === 'cloze' && !modes.some(([m]) => m === 'cloze')) mode = 'read';
    setMode(mode);
    return () => {
      stopRequested = true;
      stopSpeaking();
      document.querySelector('.sheet-wrap')?.remove();
    };
  }

  return {
    el,
    title: 'Hội thoại',
    destroy() {
      ready.finally?.(() => cleanup());
      cleanup();
    },
  };
}
