// Khối giao diện dùng chung giữa các màn hình.
import { initials } from '../accounts.js';
import { lesson, lessonTitle, topic } from '../data.js';
import { h, icon, meaningRow, pinyinSentence, pinyinWord, segmented, sentenceWithWord, toast, zh } from '../dom.js';
import { hasVoice, say } from '../speech.js';

const NO_VOICE = {
  en: 'Máy chưa có giọng đọc tiếng Anh. Hãy thêm giọng tiếng Anh trong cài đặt máy.',
  vi: 'Máy chưa có giọng đọc tiếng Việt. Hãy thêm giọng tiếng Việt trong cài đặt máy.',
};

/** Đọc một đoạn theo ngôn ngữ, dùng tốc độ người học đã chọn cho ngôn ngữ đó. */
export function sayAs(store, text, lang = 'zh', { rate, pitch = 1 } = {}) {
  const s = store.state.settings;
  if (lang !== 'zh' && !hasVoice(lang)) {
    toast(NO_VOICE[lang]);
    return Promise.resolve(false);
  }
  return say(text, { lang, rate: rate ?? (lang === 'en' ? s.enRate : lang === 'vi' ? 1 : s.rate), pitch });
}

const SPEAK_LABEL = { zh: 'Nghe phát âm', en: 'Nghe tiếng Anh', vi: 'Nghe tiếng Việt' };

/** Nút loa: đọc chữ Hán (hoặc tiếng Anh, tiếng Việt), có hiệu ứng khi đang đọc. */
export function speakButton(text, store, { lang = 'zh', label, rate, pitch, cls = 'speak-btn', size = 22 } = {}) {
  const name = label || SPEAK_LABEL[lang];
  const btn = h('button', { type: 'button', class: `${cls} say-${lang}`, 'aria-label': `${name}: ${text}`, title: name }, icon('sound', size));
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    document.querySelectorAll('.playing').forEach((b) => b.classList.remove('playing'));
    btn.classList.add('playing');
    await sayAs(store, text, lang, { rate, pitch });
    btn.classList.remove('playing');
  });
  return btn;
}

/** Nút loa nhỏ đặt cuối dòng nghĩa. */
export function miniSay(text, store, lang) {
  return speakButton(text, store, { lang, cls: 'mini-say', size: 18 });
}

/** Câu ví dụ đủ 4 lớp: chữ Hán, pinyin, Anh, Việt. */
export function exampleBlock(w, store, { withSpeak = true } = {}) {
  return h(
    'div',
    { class: 'example' },
    h(
      'div',
      { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } },
      h('div', { style: { flex: '1', minWidth: '0' } }, h('p', { class: 'ex-zh' }, sentenceWithWord(w.ex.zh, w.hanzi)), h('p', { class: 'ex-py' }, pinyinSentence(w.ex.py))),
      withSpeak ? speakButton(w.ex.zh, store, { label: 'Nghe câu', cls: 'icon-btn soft' }) : null,
    ),
    meaningRow('EN', w.ex.en, { lang: 'en', end: miniSay(w.ex.en, store, 'en') }),
    meaningRow('VI', w.ex.vi, { end: miniSay(w.ex.vi, store, 'vi') }),
  );
}

/** Thẻ từ đầy đủ (dùng cho "Từ của ngày"). */
export function wordCard(w, store) {
  return h(
    'article',
    { class: 'card word-card' },
    h(
      'div',
      { class: 'wc-top' },
      h(
        'div',
        null,
        zh(w.hanzi, 'wc-hz'),
        h('div', { class: 'wc-py' }, pinyinWord(w.py), h('span', { class: 'badge-soft badge-gray' }, `HSK ${w.level}${w.pos ? ` · ${w.pos}` : ''}`)),
      ),
      speakButton(w.hanzi, store),
    ),
    h(
      'div',
      { class: 'mrows' },
      meaningRow('VI', w.vi, { class: 'vi', end: miniSay(w.vi, store, 'vi') }),
      meaningRow('EN', w.en, { lang: 'en', end: miniSay(w.en, store, 'en') }),
      meaningRow('HV', h('span', { class: 'hv' }, w.hv)),
    ),
    exampleBlock(w, store, { withSpeak: false }),
  );
}

/** Trạng thái học của một từ để hiển thị chấm màu. */
export function wordState(store, id) {
  const c = store.state.cards[id];
  if (!c || c.state === 'new') return 'new';
  if (c.state === 'review') return 'review';
  return 'learn';
}

/** Số từ đã thuộc (đang ở trạng thái ôn dài hạn) trong một danh sách id. */
export function learnedCount(store, ids) {
  return ids.filter((id) => wordState(store, id) === 'review').length;
}

export function startedCount(store, ids) {
  return ids.filter((id) => wordState(store, id) !== 'new').length;
}

/** Dòng bài học trong danh sách. */
export function lessonRow(l, store, { current = false } = {}) {
  const t = topic(l.topic);
  const learned = learnedCount(store, l.words);
  const started = startedCount(store, l.words);
  const done = learned === l.words.length;
  const state = done ? 'done' : started > 0 || current ? 'current' : '';
  return h(
    'a',
    { href: `#/lesson/${l.id}`, class: `row-link ${state === 'current' ? 'current' : ''}`.trim() },
    h('span', { class: `tile ${state}`.trim(), lang: 'zh-CN', 'aria-hidden': 'true' }, t.icon),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, lessonTitle(l)), h('span', { class: 'row-sub' }, `${t.en} · ${l.words.length} từ`)),
    done
      ? h('span', { class: 'check-dot', role: 'img', 'aria-label': 'Đã thuộc hết' }, icon('check', 16))
      : h('span', { class: 'row-end' }, h('span', { style: { color: started ? 'var(--accent)' : null } }, `${learned}/${l.words.length}`), h('span', { style: { width: '44px' } }, barMini(learned / l.words.length))),
  );
}

function barMini(f) {
  const el = h('span', { class: 'bar thin', style: { display: 'block' } }, h('span', { class: 'bar-fill', style: { width: `${f * 100}%` } }));
  return el;
}

/** Bài nên học tiếp: bài đầu tiên còn từ chưa thuộc trong các cấp đã chọn. */
export function nextLesson(store, data) {
  const levels = store.state.settings.levels;
  const lessons = data.lessons.filter((l) => levels.includes(l.level));
  return lessons.find((l) => startedCount(store, l.words) > 0 && learnedCount(store, l.words) < l.words.length) || lessons.find((l) => learnedCount(store, l.words) < l.words.length) || lessons[0];
}

export function lessonLabel(id) {
  const l = lesson(id);
  return l ? `HSK ${l.level} · ${lessonTitle(l)}` : '';
}

/** Hiệu ứng pháo giấy nhỏ khi hoàn thành. */
export function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#9b1b1b', '#c2413a', '#d9a441', '#2f6b45', '#f0c9b8'];
  const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 36; i++) {
    const piece = h('i', {
      style: {
        left: `${Math.random() * 100}%`,
        background: colors[i % colors.length],
        animationDelay: `${Math.random() * 0.4}s`,
        animationDuration: `${1.2 + Math.random() * 0.9}s`,
        transform: `rotate(${Math.random() * 180}deg)`,
      },
    });
    box.append(piece);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 2600);
}

/** Con dấu tròn của một tài khoản lớp học: chữ đầu của tên, màu riêng. */
export function accountSeal(acc, cls = '') {
  return h('span', { class: `acc-seal ${cls}`.trim(), style: { background: acc?.color || 'var(--seal)' }, 'aria-hidden': 'true' }, initials(acc?.name || acc?.user || '?'));
}

/** Bảng trượt lên từ dưới (trên máy tính hiện giữa màn hình). Trả về hàm đóng. */
export function openSheet(children, { label, cls = '' } = {}) {
  document.querySelector('.sheet-wrap')?.remove();
  const close = () => {
    wrap.classList.add('closing');
    setTimeout(() => wrap.remove(), 220);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && close();
  const sheet = h('div', { class: `sheet ${cls}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, h('span', { class: 'sheet-grip', 'aria-hidden': 'true' }), typeof children === 'function' ? children(() => close()) : children);
  const wrap = h('div', { class: 'sheet-wrap' }, h('div', { class: 'sheet-backdrop', onclick: () => close() }), sheet);
  document.body.append(wrap);
  document.addEventListener('keydown', onKey);
  return { close, sheet };
}

/**
 * Bảng nhỏ trượt lên từ dưới để tra nhanh một từ.
 * info: {hanzi, py (mảng âm tiết hoặc chuỗi), vi?, en?, id?}
 */
export function wordPeek(info, store) {
  const py = Array.isArray(info.py) ? pinyinWord(info.py) : info.py ? pinyinSentence(info.py) : null;
  const { sheet } = openSheet(
    (close) => [
      h('div', { class: 'sheet-head' }, h('div', null, zh(info.hanzi, 'sheet-hz'), h('div', { class: 'sheet-py' }, py, info.level ? h('span', { class: 'badge-soft badge-gray' }, `HSK ${info.level}`) : null)), speakButton(info.hanzi, store)),
      h('div', { class: 'mrows' }, info.vi ? meaningRow('VI', info.vi, { class: 'vi', end: miniSay(info.vi, store, 'vi') }) : null, info.en ? meaningRow('EN', info.en, { lang: 'en', end: miniSay(info.en, store, 'en') }) : null, !info.vi && !info.en ? h('p', { class: 'small muted' }, 'Chưa có nghĩa của từ này trong từ điển của app.') : null),
      h('div', { class: 'sheet-actions' }, info.id ? h('a', { class: 'btn btn-secondary btn-sm', href: `#/word/${info.id}`, onclick: close }, 'Xem chi tiết từ') : null, h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: close }, 'Đóng')),
    ],
    { label: `Nghĩa của ${info.hanzi}` },
  );
  sheet.querySelector('.btn-primary').focus({ preventScroll: true });
}

/** Các kiểu hiển thị có sẵn cho bài khóa và hội thoại. */
export const DISPLAY_PRESETS = [
  ['full', 'Đầy đủ (Trung · Pinyin · Việt · Anh)', { zh: true, py: true, vi: true, en: true }],
  ['zh-vi', 'Song ngữ Trung – Việt', { zh: true, py: true, vi: true, en: false }],
  ['zh-en', 'Song ngữ Trung – Anh', { zh: true, py: true, vi: false, en: true }],
  ['zh-py', 'Chỉ tiếng Trung + Pinyin', { zh: true, py: true, vi: false, en: false }],
  ['zh', 'Chỉ tiếng Trung', { zh: true, py: false, vi: false, en: false }],
  ['vi', 'Chỉ tiếng Việt', { zh: false, py: false, vi: true, en: false }],
  ['en', 'Chỉ tiếng Anh', { zh: false, py: false, vi: false, en: true }],
];

const LAYERS = [
  ['zh', '汉', 'Tiếng Trung', '汉字'],
  ['py', 'pīn', 'Pinyin', '拼音'],
  ['vi', 'VI', 'Tiếng Việt', null],
  ['en', 'EN', 'Tiếng Anh', 'English'],
];

export const PLAY_LANGS = [
  ['zh', 'Tiếng Trung'],
  ['en', 'Tiếng Anh'],
  ['zh-en', 'Trung + Anh'],
];

/** Chữ tóm tắt các lớp đang hiện: "Trung · Pinyin · Việt". */
export function displaySummary(dlg) {
  const names = { zh: 'Trung', py: 'Pinyin', vi: 'Việt', en: 'Anh' };
  return Object.keys(names).filter((k) => dlg[k]).map((k) => names[k]).join(' · ') || 'Chưa chọn';
}

/** Bảng "Tùy chọn hiển thị": bật/tắt từng thứ tiếng, chọn kiểu có sẵn, chọn cách nghe cả bài. */
export function displaySheet(store, onApply, { play = true } = {}) {
  const cur = { zh: true, py: true, vi: true, en: false, ...store.state.settings.dlg };
  let playLang = store.state.settings.playLang || 'zh';
  const inputs = {};
  const radios = [];
  const syncRadios = () => {
    for (const r of radios) r.input.checked = LAYERS.every(([k]) => Boolean(r.layers[k]) === Boolean(cur[k]));
  };
  const switches = LAYERS.map(([key, badge, label, sub]) => {
    const input = h('input', { type: 'checkbox', class: 'switch-input', role: 'switch' });
    input.checked = Boolean(cur[key]);
    input.addEventListener('change', () => {
      cur[key] = input.checked;
      syncRadios();
    });
    inputs[key] = input;
    return h('label', { class: 'opt-row' }, h('span', { class: `opt-badge lang-${key}`, lang: key === 'zh' ? 'zh-CN' : null, 'aria-hidden': 'true' }, badge), h('span', { class: 'opt-label' }, label, sub ? h('small', { lang: key === 'zh' ? 'zh-CN' : null }, ` (${sub})`) : null), input, h('span', { class: 'switch', 'aria-hidden': 'true' }));
  });
  const presetList = h(
    'div',
    { class: 'opt-radios', role: 'radiogroup', 'aria-label': 'Cách hiển thị' },
    DISPLAY_PRESETS.map(([id, label, layers]) => {
      const input = h('input', { type: 'radio', name: 'dlg-preset', value: id, class: 'radio-input' });
      input.addEventListener('change', () => {
        Object.assign(cur, layers);
        for (const [k] of LAYERS) inputs[k].checked = Boolean(cur[k]);
      });
      radios.push({ input, layers });
      return h('label', { class: 'radio-row' }, input, h('span', { class: 'radio', 'aria-hidden': 'true' }), h('span', null, label));
    }),
  );
  syncRadios();
  const playSeg = play ? segmented(PLAY_LANGS, playLang, (v) => (playLang = v), 'Khi nghe cả bài, đọc') : null;
  const { close, sheet } = openSheet(
    (closeFn) => [
      h('div', { class: 'sheet-title' }, h('div', null, h('h2', null, 'Tùy chọn hiển thị'), h('p', { class: 'small muted' }, 'Chọn ngôn ngữ muốn hiện trong bài học')), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Đóng', onclick: closeFn }, icon('close', 22))),
      h('div', { class: 'opt-list' }, switches),
      h('h3', { class: 'opt-head' }, 'Cách hiển thị'),
      presetList,
      play ? [h('h3', { class: 'opt-head' }, 'Khi nghe cả bài, đọc'), playSeg] : null,
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary btn-block opt-apply',
          onclick: () => {
            if (!LAYERS.some(([k]) => cur[k])) {
              toast('Hãy bật ít nhất một thứ tiếng');
              return;
            }
            store.setSettings({ dlg: { ...cur }, playLang });
            closeFn();
            onApply?.();
          },
        },
        'Áp dụng',
      ),
    ],
    { label: 'Tùy chọn hiển thị', cls: 'opt-sheet' },
  );
  sheet.querySelector('.opt-apply').focus({ preventScroll: true });
  return close;
}
