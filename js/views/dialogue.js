// Đọc và luyện một hội thoại: đọc (nghe từng câu hoặc cả bài), nhập vai, điền từ.
// Dùng cho hội thoại theo bài (#/dialogue/<mã bài>) và hội thoại tự nhập (#/mine/<id>).
import { dialogue, lesson, lessonTitle, loadDialogues, loadLexicon, word, wordByHanzi } from '../data.js';
import { button, emptyState, h, icon, pinyinSentence, segmented, toast, zh } from '../dom.js';
import { annotate, parseDialogueText } from '../pygen.js';
import { makeRng, shuffle } from '../quiz.js';
import { hasChineseVoice, speak, stopSpeaking } from '../speech.js';
import { confetti, speakButton, wordPeek } from './common.js';

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
        ctx.navigate('#/dialogues', { replace: true });
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
    const back = model.kind === 'lesson' ? `#/lesson/${model.id}` : '#/dialogues';
    let mode = 'read';
    let playing = false;
    let stopRequested = false;
    const voice = hasChineseVoice();

    const head = h(
      'header',
      { class: 'topbar' },
      h('a', { class: 'icon-btn', href: back, 'aria-label': 'Quay lại' }, icon('back', 24)),
      h('span', { class: 'topbar-title' }, model.kind === 'lesson' ? `Hội thoại · HSK ${model.level}` : 'Hội thoại của bạn'),
      model.kind === 'mine' ? h('a', { class: 'icon-btn', href: `#/mine/${model.id}/edit`, 'aria-label': 'Sửa hội thoại' }, icon('pen', 22)) : h('span', { style: { width: '44px' } }),
    );

    const intro = h(
      'section',
      { class: 'dlg-intro' },
      model.title.zh ? zh(model.title.zh, 'dlg-title-zh') : null,
      h('h1', { class: 'dlg-title' }, model.title.vi),
      model.scene ? h('p', { class: 'muted' }, model.scene.vi) : null,
      h(
        'div',
        { class: 'dlg-cast' },
        model.cast.map((c, i) => h('span', { class: `cast-chip s${i}` }, h('i', { 'aria-hidden': 'true' }), c.zh !== c.vi ? [zh(c.zh), ` ${c.vi}`] : c.vi)),
        l ? h('a', { class: 'chip', href: `#/lesson/${l.id}` }, icon('book', 14), lessonTitle(l)) : null,
      ),
    );

    const modes = [['read', 'Đọc'], ['role', 'Nhập vai']];
    if (model.kind === 'lesson' && model.words.length >= 3) modes.push(['cloze', 'Điền từ']);
    const modeSeg = segmented(modes, mode, (v) => setMode(v), 'Cách luyện');
    const body = h('div', { class: 'dlg-body' });

    el.replaceChildren(head, intro, h('div', { style: { marginTop: '16px' } }, modeSeg), body);

    function show() {
      return store.state.settings.dlg;
    }

    function bubble(line, i, { hideZh = false, segments = true } = {}) {
      const s = show();
      const speaker = model.cast[line.s] || model.cast[0];
      const textEl = h('p', { class: 'b-zh', lang: 'zh-CN' });
      if (!hideZh) {
        for (const seg of segments ? lineSegments(line, model) : [line.zh]) {
          if (typeof seg === 'string') textEl.append(seg);
          else
            textEl.append(
              h('button', {
                type: 'button',
                class: `wtap ${seg.w ? 'hl' : 'soft'}`,
                onclick: (e) => {
                  e.stopPropagation();
                  if (seg.w) wordPeek({ hanzi: seg.w.hanzi, py: seg.w.py, vi: seg.w.vi, en: seg.w.en, id: seg.w.id, level: seg.w.level }, store);
                  else wordPeek({ hanzi: seg.text, py: seg.py, en: seg.gloss, level: 6 }, store);
                },
              }, seg.text),
            );
        }
      }
      return h(
        'article',
        { class: `bubble s${line.s % 3} ${line.s % 2 ? 'right' : 'left'}`, 'data-i': String(i) },
        h('header', { class: 'b-who' }, h('span', null, speaker.vi), speaker.zh !== speaker.vi ? zh(speaker.zh) : null),
        h(
          'div',
          { class: 'b-main' },
          h('div', { class: 'b-text' }, hideZh ? null : textEl, !hideZh && s.py && line.py ? h('p', { class: 'b-py' }, pinyinSentence(line.py)) : null, s.vi && line.vi ? h('p', { class: 'b-vi' }, line.vi) : null, s.en && line.en ? h('p', { class: 'b-en', lang: 'en' }, line.en) : null),
          hideZh ? null : speakButton(line.zh, store, { label: 'Nghe câu', cls: 'icon-btn soft b-say' }),
        ),
      );
    }

    // ---------- Đọc ----------
    function drawRead() {
      const s = show();
      const chip = (key, label) => {
        const b = h('button', { type: 'button', class: 'tchip', 'aria-pressed': String(Boolean(s[key])) }, icon('check', 14), h('span', null, label));
        b.addEventListener('click', () => {
          store.setSettings({ dlg: { ...show(), [key]: !show()[key] } });
          drawRead();
        });
        return b;
      };
      const playBtn = button(playing ? 'Dừng' : 'Nghe cả bài', { icon: playing ? 'close' : 'play', size: 'sm', variant: voice ? 'primary' : 'secondary', disabled: !voice, onclick: () => (playing ? stopAll() : playAll()) });
      const list = h('div', { class: 'chat' }, model.lines.map((line, i) => bubble(line, i)));
      const used = model.words.map(word).filter(Boolean);
      body.replaceChildren(
        h(
          'div',
          { class: 'dlg-tools' },
          h('div', { class: 'toggle-chips', role: 'group', 'aria-label': 'Lớp hiển thị' }, chip('py', 'Pinyin'), chip('vi', 'Tiếng Việt'), model.kind === 'lesson' ? chip('en', 'English') : null),
          playBtn,
        ),
        voice ? null : h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Máy chưa có giọng đọc tiếng Trung nên chưa nghe được. Hãy cài giọng tiếng Trung (Trung Quốc) trong cài đặt máy.'),
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
      playing = true;
      stopRequested = false;
      drawRead();
      const nodes = [...body.querySelectorAll('.bubble')];
      for (let i = 0; i < model.lines.length; i++) {
        if (stopRequested || mode !== 'read') break;
        nodes.forEach((n) => n.classList.toggle('speaking', n === nodes[i]));
        nodes[i]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        await speak(model.lines[i].zh, store.state.settings.rate, PITCH[model.lines[i].s % 3]);
        await new Promise((r) => setTimeout(r, 250));
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
        chat.replaceChildren(...model.lines.slice(0, step + 1).map((line, i) => (line.s === me && i === step && !revealed ? promptBubble(line) : bubble(line, i))));
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
      else if (m === 'role') drawRole();
      else drawCloze();
    }

    drawRead();
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
