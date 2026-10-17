// Tiện ích dựng DOM, biểu tượng và các thành phần giao diện dùng chung.
import { parseSentence, toneOf } from './pinyin.js';

/**
 * h('button', {class: 'btn', onclick: fn}, 'Nhãn', child)
 * Thuộc tính bắt đầu bằng "on" được gắn làm sự kiện; null/false bị bỏ qua.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const ICONS = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  cards: '<rect x="3" y="7" width="13" height="14" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v12"/>',
  pen: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  sound: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  talk: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  list: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  steps: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  sparkle: '<path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m5.6 5.6 2.1 2.1"/><path d="m16.3 16.3 2.1 2.1"/><path d="m5.6 18.4 2.1-2.1"/><path d="m16.3 7.7 2.1-2.1"/>',
  sliders: '<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h4"/><path d="M12 12h8"/><circle cx="10" cy="12" r="2"/><path d="M4 18h12"/><path d="M20 18h0"/><circle cx="18" cy="18" r="2"/>',
  map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  practice: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
  library: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  slow: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

/** Con dấu đỏ 汉路 (tên app). */
export function brandSeal(cls = '') {
  return h('span', { class: `brand-seal ${cls}`.trim(), lang: 'zh-CN', 'aria-hidden': 'true' }, h('span', null, '汉'), h('span', null, '路'));
}

/** Biểu tượng nét mảnh (aria-hidden). */
export function icon(name, size = 22, extraClass = '') {
  const span = document.createElement('span');
  span.className = `ic ${extraClass}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
  return span;
}

/** Âm tiết pinyin có màu theo thanh. */
export function pinyinWord(syllables, cls = '') {
  return h(
    'span',
    { class: `py ${cls}`.trim() },
    syllables.map((s) => (s === 'r' ? h('span', { class: 't0' }, 'r') : h('span', { class: `t${toneOf(s)}` }, s))),
  );
}

/** Câu pinyin dạng "Wǒ xǐ|huan." → các span tô màu. */
export function pinyinSentence(py, cls = '') {
  const el = h('span', { class: `py py-sentence ${cls}`.trim() });
  for (const part of parseSentence(py)) {
    if (part.type === 'word') el.append(pinyinWord(part.syllables, 'py-w'));
    else if (part.type === 'space') el.append(' ');
    else el.append(h('span', { class: 'py-p' }, part.text));
  }
  return el;
}

/** Chữ Hán với lang và font chữ Hán. */
export function zh(text, cls = '') {
  return h('span', { class: `zh ${cls}`.trim(), lang: 'zh-CN' }, text);
}

/** Câu ví dụ, tô đậm từ đang học. */
export function sentenceWithWord(sentence, wordText) {
  const i = sentence.indexOf(wordText);
  if (i < 0) return zh(sentence);
  return h(
    'span',
    { class: 'zh', lang: 'zh-CN' },
    sentence.slice(0, i),
    h('mark', { class: 'hl' }, wordText),
    sentence.slice(i + wordText.length),
  );
}

export function tag(text) {
  return h('span', { class: 'tag', 'aria-hidden': 'true' }, text);
}

/** Dòng nghĩa: nhãn ngôn ngữ + nội dung. */
export function meaningRow(label, text, opts = {}) {
  return h(
    'div',
    { class: `mrow ${opts.class || ''} ${opts.end ? 'has-end' : ''}`.trim() },
    tag(label),
    h('span', { class: 'mrow-text', lang: opts.lang || null }, text),
    opts.end || null,
  );
}

/** Vòng tiến độ SVG (0–1). */
export function ring(fraction, size = 64, label = '') {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const el = h('div', { class: 'ring', role: 'img', 'aria-label': label, style: { width: `${size}px`, height: `${size}px` } });
  el.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" /><circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c}" /></svg><span class="ring-label">${Math.round(fraction * 100)}%</span>`;
  // để vòng chạy mượt từ 0 tới giá trị thật
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.querySelector('.ring-fg').style.strokeDashoffset = String(c * (1 - Math.max(0, Math.min(1, fraction))));
    }),
  );
  return el;
}

/** Thanh tiến độ ngang (0–1). */
export function bar(fraction, cls = '', label = '') {
  const fill = h('span', { class: 'bar-fill' });
  const el = h('div', { class: `bar ${cls}`.trim(), role: 'progressbar', 'aria-label': label || null, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(fraction * 100)) }, fill);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      fill.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
    }),
  );
  return el;
}

/** Nút hoặc liên kết có biểu tượng. */
export function button(label, { icon: iconName, onclick, href, variant = 'primary', size, ariaLabel, cls = '', disabled } = {}) {
  const props = {
    class: `btn btn-${variant} ${size ? `btn-${size}` : ''} ${cls}`.trim(),
    'aria-label': ariaLabel || null,
    disabled: disabled || null,
  };
  const kids = [iconName ? icon(iconName, size === 'sm' ? 18 : 20) : null, label ? h('span', null, label) : null];
  if (href) return h('a', { ...props, href }, kids);
  return h('button', { ...props, type: 'button', onclick }, kids);
}

export function iconButton(name, label, onclick, cls = '') {
  return h('button', { class: `icon-btn ${cls}`.trim(), type: 'button', 'aria-label': label, title: label, onclick }, icon(name, 22));
}

/** Nhóm nút chọn một (segmented control). */
export function segmented(options, value, onchange, label) {
  const el = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map(([val, text]) =>
    h('button', {
      type: 'button',
      class: 'seg-btn',
      role: 'radio',
      'aria-checked': String(val === value),
      onclick: () => {
        for (const b of buttons) b.setAttribute('aria-checked', String(b === btnOf(val)));
        onchange(val);
      },
    }, text),
  );
  const btnOf = (val) => buttons[options.findIndex(([v]) => v === val)];
  el.append(...buttons);
  return el;
}

/** Công tắc bật/tắt có nhãn. */
export function toggle(label, checked, onchange, desc) {
  const input = h('input', { type: 'checkbox', class: 'switch-input', role: 'switch' });
  input.checked = Boolean(checked);
  input.addEventListener('change', () => onchange(input.checked));
  return h(
    'label',
    { class: 'switch-row' },
    h('span', { class: 'switch-text' }, h('span', null, label), desc ? h('small', null, desc) : null),
    input,
    h('span', { class: 'switch', 'aria-hidden': 'true' }),
  );
}

let toastTimer = null;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

export function emptyState(title, text, action) {
  return h('div', { class: 'empty' }, icon('sparkle', 28), h('h3', null, title), text ? h('p', null, text) : null, action || null);
}

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* bỏ qua */
  }
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
