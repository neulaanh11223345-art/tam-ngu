// Lịch ôn tập lặp lại ngắt quãng (kiểu SM-2 có bước học), không phụ thuộc DOM.

export const AGAIN = 1;
export const HARD = 2;
export const GOOD = 3;
export const EASY = 4;

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
export const LEARN_STEPS = [1 * MIN, 10 * MIN];
export const RELEARN_STEPS = [10 * MIN];
const GRADUATE_DAYS = 1;
const EASY_DAYS = 4;
const MIN_EASE = 1.3;
const MAX_DAYS = 365;

export function newCard(id) {
  return { id, state: 'new', due: 0, ivl: 0, ease: 2.5, reps: 0, lapses: 0, step: 0, last: 0 };
}

function clampDays(d) {
  return Math.max(1, Math.min(MAX_DAYS, Math.round(d)));
}

/**
 * Trả về thẻ mới sau khi chấm điểm. Không sửa thẻ cũ.
 * rating: AGAIN | HARD | GOOD | EASY
 */
export function schedule(card, rating, now) {
  const c = { ...card, reps: card.reps + 1, last: now };
  if (c.state === 'new') c.state = 'learn';

  if (c.state === 'learn' || c.state === 'relearn') {
    const steps = c.state === 'learn' ? LEARN_STEPS : RELEARN_STEPS;
    if (rating === AGAIN) {
      c.step = 0;
      c.due = now + steps[0];
    } else if (rating === HARD) {
      const cur = steps[c.step] ?? steps[steps.length - 1];
      const nxt = steps[c.step + 1] ?? cur * 1.5;
      c.due = now + Math.round(c.step === 0 ? (cur + nxt) / 2 : cur);
    } else if (rating === EASY) {
      c.state = 'review';
      c.ivl = c.ivl > 0 ? clampDays(c.ivl + 1) : EASY_DAYS;
      c.step = 0;
      c.due = now + c.ivl * DAY;
    } else {
      c.step += 1;
      if (c.step >= steps.length) {
        c.state = 'review';
        c.ivl = c.ivl > 0 ? c.ivl : GRADUATE_DAYS;
        c.step = 0;
        c.due = now + c.ivl * DAY;
      } else {
        c.due = now + steps[c.step];
      }
    }
    return c;
  }

  // thẻ đang ôn dài hạn
  if (rating === AGAIN) {
    c.lapses += 1;
    c.ease = Math.max(MIN_EASE, c.ease - 0.2);
    c.ivl = clampDays(c.ivl * 0.5);
    c.state = 'relearn';
    c.step = 0;
    c.due = now + RELEARN_STEPS[0];
  } else if (rating === HARD) {
    c.ease = Math.max(MIN_EASE, c.ease - 0.15);
    c.ivl = clampDays(Math.max(c.ivl + 1, c.ivl * 1.2));
    c.due = now + c.ivl * DAY;
  } else if (rating === EASY) {
    c.ease += 0.15;
    c.ivl = clampDays(Math.max(c.ivl + 1, c.ivl * c.ease * 1.3));
    c.due = now + c.ivl * DAY;
  } else {
    c.ivl = clampDays(Math.max(c.ivl + 1, c.ivl * c.ease));
    c.due = now + c.ivl * DAY;
  }
  return c;
}

/** Nhãn khoảng cách cho từng nút chấm điểm, ví dụ {1:'1 phút', 3:'1 ngày'}. */
export function previewLabels(card, now) {
  const out = {};
  for (const r of [AGAIN, HARD, GOOD, EASY]) out[r] = formatGap(schedule(card, r, now).due - now);
  return out;
}

export function formatGap(ms) {
  if (ms < 60 * MIN) {
    const m = Math.max(1, Math.round(ms / MIN));
    return m <= 1 ? '< 1 phút' : `${m} phút`;
  }
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))} giờ`;
  const d = Math.round(ms / DAY);
  if (d < 30) return `${d} ngày`;
  if (d < 365) return `${Math.round(d / 30)} tháng`;
  return `${Math.round(d / 365)} năm`;
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Thẻ đến hạn trong ngày hôm nay (thẻ học ngắn hạn tính cả khi chưa tới phút). */
export function isDueToday(card, now) {
  if (!card || card.state === 'new') return false;
  if (card.state === 'learn' || card.state === 'relearn') return true;
  return card.due < startOfDay(now) + DAY;
}

/**
 * Dựng hàng đợi ôn tập: thẻ đến hạn trước (thẻ đang học trước, rồi theo hạn),
 * sau đó là từ mới theo thứ tự bài học, giới hạn bởi số từ mới còn lại trong ngày.
 */
export function buildQueue({ wordIds, cards, now, newLimit }) {
  const due = [];
  const fresh = [];
  for (const id of wordIds) {
    const c = cards[id];
    if (!c || c.state === 'new') {
      if (fresh.length < newLimit) fresh.push(id);
    } else if (isDueToday(c, now)) {
      due.push(id);
    }
  }
  const rank = (c) => (c.state === 'review' ? 1 : 0);
  due.sort((a, b) => rank(cards[a]) - rank(cards[b]) || cards[a].due - cards[b].due);
  return { due, fresh };
}

export const DAY_MS = DAY;
