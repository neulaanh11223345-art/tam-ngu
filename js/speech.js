// Phát âm bằng giọng đọc có sẵn của trình duyệt (Web Speech API): tiếng Trung, tiếng Anh, tiếng Việt.

const LANGS = {
  zh: { tag: 'zh-CN', test: (l) => /^zh[-_](CN|Hans)/i.test(l) || /^cmn/i.test(l), loose: (l) => /^zh/i.test(l) && !/HK|TW/i.test(l) },
  en: { tag: 'en-US', test: (l) => /^en[-_]/i.test(l) || /^en$/i.test(l), loose: (l) => /^en/i.test(l) },
  vi: { tag: 'vi-VN', test: (l) => /^vi/i.test(l), loose: (l) => /^vi/i.test(l) },
};

const voices = { zh: null, en: null, vi: null };
let enAccent = 'en-US';
let ready = false;
let listed = false;

function pickVoice(lang) {
  const synth = window.speechSynthesis;
  if (!synth) return null;
  const all = synth.getVoices();
  if (all.length) listed = true;
  const spec = LANGS[lang];
  let pool = all.filter((v) => spec.test(v.lang));
  if (!pool.length) pool = all.filter((v) => spec.loose(v.lang));
  if (lang === 'en') {
    // đúng giọng Anh-Mỹ hoặc Anh-Anh đã chọn trước, rồi mới tới giọng Anh khác
    const want = enAccent.toLowerCase().replace('_', '-');
    const exact = pool.filter((v) => v.lang.toLowerCase().replace('_', '-') === want);
    if (exact.length) pool = exact;
  }
  // ưu tiên giọng chất lượng cao nếu có
  return pool.find((v) => /natural|enhanced|premium|neural/i.test(v.name)) || pool.find((v) => v.localService) || pool[0] || null;
}

function pickAll() {
  for (const lang of Object.keys(voices)) voices[lang] = pickVoice(lang);
}

export function initSpeech() {
  if (!('speechSynthesis' in window)) return;
  pickAll();
  ready = true;
  window.speechSynthesis.addEventListener?.('voiceschanged', pickAll);
}

/** Giọng tiếng Anh: 'en-US' (Anh-Mỹ) hoặc 'en-GB' (Anh-Anh). */
export function setEnglishAccent(accent) {
  if (accent === enAccent) return;
  enAccent = accent === 'en-GB' ? 'en-GB' : 'en-US';
  if (ready) voices.en = pickVoice('en');
}

export function canSpeak() {
  return 'speechSynthesis' in window;
}

/** Máy có giọng đọc cho ngôn ngữ này không. Khi trình duyệt chưa liệt kê giọng xong thì coi như có. */
export function hasVoice(lang = 'zh') {
  if (!canSpeak()) return false;
  if (!voices[lang]) voices[lang] = pickVoice(lang);
  return Boolean(voices[lang]) || !listed;
}

export function hasChineseVoice() {
  return Boolean(voices.zh || (canSpeak() && pickVoice('zh')));
}

/** Nghĩa tiếng Anh dạng từ điển → câu đọc tự nhiên: "to visit (sb); to call on sth" → "to visit somebody, to call on something". */
export function speakableEnglish(text) {
  return String(text || '')
    .replace(/\bsb\b\.?/g, 'somebody')
    .replace(/\bsth\b\.?/g, 'something')
    .replace(/\bCL:.*$/, '')
    .replace(/[()[\]]/g, '')
    .replace(/\s*[;/|]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function speakableVietnamese(text) {
  return String(text || '')
    .replace(/[()[\]]/g, '')
    .replace(/\s*[;/|]\s*/g, ', ')
    .trim();
}

/**
 * Đọc một đoạn. Trả về Promise kết thúc khi đọc xong (hoặc lỗi).
 * lang: 'zh' | 'en' | 'vi'; pitch: cao độ giọng (để phân biệt người nói trong hội thoại).
 */
export function say(text, { lang = 'zh', rate = 0.9, pitch = 1 } = {}) {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve(false);
    if (!ready) initSpeech();
    const synth = window.speechSynthesis;
    const spoken = lang === 'en' ? speakableEnglish(text) : lang === 'vi' ? speakableVietnamese(text) : text;
    if (!spoken) return resolve(false);
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(spoken);
      const voice = voices[lang] || pickVoice(lang);
      u.lang = lang === 'en' ? enAccent : LANGS[lang].tag;
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = pitch;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      synth.speak(u);
      // một số trình duyệt không gọi onend
      const perChar = lang === 'zh' ? 450 : 110;
      setTimeout(() => resolve(true), Math.max(6000, (spoken.length * perChar) / rate));
    } catch {
      resolve(false);
    }
  });
}

/** Đọc tiếng Trung (giữ cho các màn hình cũ). */
export function speak(text, rate = 0.9, pitch = 1) {
  return say(text, { lang: 'zh', rate, pitch });
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* bỏ qua */
  }
}
