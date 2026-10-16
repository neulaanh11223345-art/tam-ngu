// Phát âm tiếng Trung bằng giọng đọc có sẵn của trình duyệt (Web Speech API).

let voice = null;
let ready = false;

function pickVoice() {
  const synth = window.speechSynthesis;
  if (!synth) return null;
  const voices = synth.getVoices();
  const zh = voices.filter((v) => /^zh[-_](CN|Hans)/i.test(v.lang) || /^cmn/i.test(v.lang));
  const any = zh.length ? zh : voices.filter((v) => /^zh/i.test(v.lang) && !/HK|TW/i.test(v.lang));
  // ưu tiên giọng chất lượng cao nếu có
  return any.find((v) => /natural|enhanced|premium|neural/i.test(v.name)) || any.find((v) => v.localService) || any[0] || null;
}

export function initSpeech() {
  if (!('speechSynthesis' in window)) return;
  voice = pickVoice();
  ready = true;
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    voice = pickVoice();
  });
}

export function canSpeak() {
  return 'speechSynthesis' in window;
}

export function hasChineseVoice() {
  return Boolean(voice || (canSpeak() && pickVoice()));
}

/** Đọc một đoạn tiếng Trung. Trả về Promise kết thúc khi đọc xong (hoặc lỗi). */
export function speak(text, rate = 0.9) {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve(false);
    if (!ready) initSpeech();
    const synth = window.speechSynthesis;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      if (voice) u.voice = voice;
      u.rate = rate;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      synth.speak(u);
      // một số trình duyệt không gọi onend
      setTimeout(() => resolve(true), 6000);
    } catch {
      resolve(false);
    }
  });
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* bỏ qua */
  }
}
