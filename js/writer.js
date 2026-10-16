// Kết nối thư viện Hanzi Writer (nét chữ từ data/strokes, chạy được khi không có mạng).

let HanziWriter = null;
const buckets = new Map();

// phải khớp STROKE_BUCKETS trong tools/build_data.py
const STROKE_BUCKETS = 64;

export async function loadHanziWriter() {
  if (!HanziWriter) HanziWriter = (await import('../vendor/hanzi-writer.esm.js')).default;
  return HanziWriter;
}

/** Tệp chứa nét của chữ: các chữ được gom theo mã Unicode % 64. */
export function strokeUrl(char) {
  return `data/strokes/${(char.codePointAt(0) % STROKE_BUCKETS).toString(16).padStart(2, '0')}.json`;
}

export async function loadCharData(char) {
  const url = strokeUrl(char);
  if (!buckets.has(url)) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
    buckets.set(url, p);
    p.catch(() => buckets.delete(url));
  }
  const group = await buckets.get(url);
  if (!group[char]) throw new Error(`Không có dữ liệu nét cho ${char}`);
  return group[char];
}

function charDataLoader(char, onLoad, onError) {
  loadCharData(char).then(onLoad, onError);
}

/** Màu lấy từ biến CSS để hợp chế độ sáng/tối. */
export function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  const dark = cs.getPropertyValue('color-scheme').trim() === 'dark';
  return {
    stroke: v('--ink', '#151b28'),
    accent: v('--accent', '#1f5bd6'),
    outline: dark ? '#2f3a4c' : '#dde3ec',
    highlight: v('--accent', '#1f5bd6'),
    drawing: v('--accent', '#1f5bd6'),
    good: v('--good', '#0e7a5f'),
  };
}

/**
 * Tạo bảng viết cho một chữ.
 * opts: các tùy chọn của Hanzi Writer, cộng thêm size.
 */
export async function createWriter(el, char, opts = {}) {
  const HW = await loadHanziWriter();
  const c = themeColors();
  const { size: wanted, radical, ...rest } = opts;
  const size = wanted || el.clientWidth || 300;
  el.replaceChildren();
  return HW.create(el, char, {
    width: size,
    height: size,
    padding: Math.round(size * 0.06),
    charDataLoader,
    strokeColor: c.stroke,
    radicalColor: radical ? c.accent : null,
    outlineColor: c.outline,
    highlightColor: c.highlight,
    drawingColor: c.drawing,
    drawingWidth: Math.max(4, Math.round(size / 28)),
    strokeAnimationSpeed: 1,
    delayBetweenStrokes: 220,
    delayBetweenLoops: 1600,
    showHintAfterMisses: 3,
    highlightOnComplete: true,
    ...rest,
  });
}
