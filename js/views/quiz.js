// Bài kiểm tra nhanh: 5 dạng câu hỏi, chấm ngay, tổng kết cuối bài.
import { data, lesson, lessonTitle, studyOrder, word } from '../data.js';
import { button, h, icon, pinyinWord, vibrate, zh } from '../dom.js';
import { hasChineseVoice, speak } from '../speech.js';
import { TYPE_LABELS, TYPES, makeQuiz, makeRng } from '../quiz.js';
import { confetti, speakButton, wordState } from './common.js';

function pickTargets(ctx) {
  const { store, params } = ctx;
  const [mode, arg] = params;
  if (mode === 'lesson') {
    const l = lesson(arg);
    return { targets: l ? l.words.map(word) : [], title: l ? `Kiểm tra · ${lessonTitle(l)}` : 'Kiểm tra' };
  }
  if (mode === 'words') return { targets: arg.split(',').map(word).filter(Boolean), title: 'Kiểm tra lại' };
  // mặc định: từ đã bắt đầu học; nếu còn ít thì thêm từ của bài đầu tiên
  const order = studyOrder(store.state.settings.levels);
  const learning = order.filter((id) => wordState(store, id) !== 'new');
  const ids = learning.length >= 8 ? learning : [...learning, ...order.filter((id) => !learning.includes(id)).slice(0, 12 - learning.length)];
  return { targets: ids.map(word), title: 'Kiểm tra nhanh' };
}

export function render(ctx) {
  const { store } = ctx;
  const { targets, title } = pickTargets(ctx);
  const types = hasChineseVoice() ? TYPES : TYPES.filter((t) => t !== 'listen');
  const questions = makeQuiz({ targets, pool: data().words, count: Math.min(10, targets.length), types, rng: makeRng() });
  const results = [];
  let qi = 0;

  const el = h('div', { class: 'view full' });
  const segs = h('div', { style: { flex: '1', display: 'grid', gridTemplateColumns: `repeat(${questions.length}, minmax(0,1fr))`, gap: '4px' }, 'aria-hidden': 'true' });
  const step = h('span', { class: 'session-count' });
  const top = h('header', { class: 'session-top' }, h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Thoát bài kiểm tra' }, icon('close', 24)), segs, step);
  const body = h('div', { style: { flex: '1', display: 'flex', flexDirection: 'column' } });
  el.append(top, body);

  function drawSegs() {
    segs.replaceChildren(
      ...questions.map((_, i) => {
        const r = results[i];
        const bg = r === undefined ? 'var(--line)' : r ? 'var(--good)' : 'var(--bad)';
        return h('span', { style: { height: '8px', borderRadius: '999px', background: bg, transition: 'background .3s' } });
      }),
    );
    step.textContent = qi < questions.length ? `${qi + 1}/${questions.length}` : 'Xong';
  }

  function prompt(q) {
    const w = q.word;
    if (q.type === 'meaning' || q.type === 'pinyin') {
      return h('div', { class: 'q-prompt' }, zh(w.hanzi), speakButton(w.hanzi, store));
    }
    if (q.type === 'hanzi') {
      return h('div', { class: 'q-prompt' }, h('div', null, h('div', { class: 'vi' }, w.vi), h('div', { class: 'muted', lang: 'en' }, w.en)));
    }
    if (q.type === 'listen') {
      const big = h('button', { type: 'button', class: 'btn btn-primary', style: { minHeight: '88px', width: '100%', fontSize: '17px', borderRadius: '22px' } }, icon('sound', 28), h('span', null, 'Bấm để nghe lại'));
      big.addEventListener('click', () => speak(w.hanzi, store.state.settings.rate));
      setTimeout(() => speak(w.hanzi, store.state.settings.rate), 350);
      return h('div', { style: { marginTop: '18px' } }, big);
    }
    // điền từ
    return h(
      'div',
      null,
      h('p', { class: 'q-sentence', lang: 'zh-CN' }, h('span', { class: 'zh' }, q.blank.before), h('span', { class: 'blank zh' }, '？'), h('span', { class: 'zh' }, q.blank.after)),
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, w.ex.vi),
    );
  }

  const ASK = {
    meaning: 'Từ này nghĩa là gì?',
    hanzi: 'Chữ Hán nào có nghĩa này?',
    pinyin: 'Từ này đọc thế nào?',
    listen: 'Bạn vừa nghe từ nào?',
    fill: 'Chọn từ điền vào chỗ trống.',
  };

  function drawQuestion() {
    drawSegs();
    const q = questions[qi];
    let answered = false;
    const letters = ['A', 'B', 'C', 'D'];
    const opts = q.options.map((o, i) => {
      const main = o.zh ? zh(o.main) : q.type === 'pinyin' ? h('b', { class: 'py' }, o.main) : h('b', null, o.main);
      const btn = h('button', { type: 'button', class: 'opt' }, h('span', { class: 'letter' }, letters[i]), h('span', { class: 'opt-main' }, main, o.sub ? h('small', { lang: 'en' }, o.sub) : null));
      btn.addEventListener('click', () => choose(i));
      return btn;
    });
    const feedbackSlot = h('div', { style: { marginTop: 'auto' } });

    function choose(i) {
      if (answered) return;
      answered = true;
      ctx.activity();
      const ok = i === q.answer;
      results[qi] = ok;
      store.recordQuiz(ok);
      vibrate(ok ? 12 : [20, 40, 20]);
      opts.forEach((b, j) => {
        b.setAttribute('aria-disabled', 'true');
        if (j === q.answer) b.classList.add('right');
        else if (j === i) b.classList.add('wrong');
        else b.classList.add('dim');
      });
      drawSegs();
      const w = q.word;
      const next = button(qi + 1 < questions.length ? 'Tiếp tục' : 'Xem kết quả', { cls: 'btn-block', onclick: () => advance() });
      feedbackSlot.replaceChildren(
        h(
          'div',
          { class: `feedback ${ok ? 'ok' : 'no'}`, role: 'status' },
          h('h3', null, icon(ok ? 'check' : 'close', 22), ok ? 'Chính xác!' : 'Chưa đúng'),
          h('p', null, zh(w.hanzi), ' ', pinyinWord(w.py), ` · ${w.vi} · `, h('span', { lang: 'en' }, w.en)),
          next,
        ),
      );
      next.focus({ preventScroll: true });
      if (q.type !== 'listen') speak(w.hanzi, store.state.settings.rate);
    }

    body.replaceChildren(
      h(
        'section',
        { class: 'stagger', style: { marginTop: '18px' } },
        h('span', { class: 'q-type' }, icon('list', 14), TYPE_LABELS[q.type]),
        prompt(q),
        h('p', { class: 'q-ask' }, ASK[q.type]),
        h('div', { class: 'q-options', role: 'group', 'aria-label': 'Các đáp án' }, opts),
      ),
      feedbackSlot,
    );
    onKey = (e) => {
      if (['1', '2', '3', '4'].includes(e.key) && !answered) choose(Number(e.key) - 1);
      else if (e.key === 'Enter' && answered) advance();
    };
  }

  function advance() {
    qi += 1;
    if (qi < questions.length) drawQuestion();
    else finish();
  }

  function finish() {
    drawSegs();
    onKey = () => {};
    const score = results.filter(Boolean).length;
    const wrongIds = questions.filter((_, i) => !results[i]).map((q) => q.word.id);
    body.replaceChildren(
      h(
        'section',
        { class: 'done-screen' },
        h('div', { class: 'medal' }, icon('trophy', 44)),
        h('h1', null, score === questions.length ? 'Tuyệt vời!' : 'Hoàn thành!'),
        h('p', { class: 'muted' }, `Bạn trả lời đúng ${score}/${questions.length} câu.`),
        h(
          'div',
          { class: 'list', style: { width: '100%', maxWidth: '420px', marginTop: '16px' } },
          questions.map((q, i) =>
            h(
              'a',
              { href: `#/word/${q.word.id}`, class: 'row-link', style: { padding: '10px 14px' } },
              zh(q.word.hanzi, 'row-title'),
              h('span', { class: 'row-main' }, h('span', { class: 'row-sub' }, q.word.vi)),
              h('span', { class: results[i] ? 'badge-soft' : 'pill-bad', style: results[i] ? { background: 'var(--good-soft)', color: 'var(--good)' } : null }, results[i] ? 'Đúng' : 'Cần ôn'),
            ),
          ),
        ),
        h(
          'div',
          { class: 'done-actions' },
          wrongIds.length ? button('Ôn các từ sai', { href: `#/review/words/${wrongIds.join(',')}`, icon: 'cards' }) : null,
          button('Làm bài khác', { variant: 'secondary', icon: 'rotate', onclick: () => ctx.navigate(location.hash) }),
        ),
        h('a', { href: '#/', class: 'small', style: { marginTop: '12px' } }, 'Về trang chủ'),
      ),
    );
    if (score >= Math.ceil(questions.length * 0.8)) confetti();
  }

  let onKey = () => {};
  const keyHandler = (e) => onKey(e);
  document.addEventListener('keydown', keyHandler);

  if (!questions.length) {
    body.replaceChildren(h('p', { class: 'empty' }, 'Chưa đủ từ để tạo bài kiểm tra.'));
  } else {
    drawQuestion();
  }

  return {
    el,
    title,
    immersive: true,
    destroy() {
      document.removeEventListener('keydown', keyHandler);
    },
  };
}
