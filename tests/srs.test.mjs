import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AGAIN, DAY_MS, EASY, GOOD, HARD, buildQueue, formatGap, isDueToday, newCard, previewLabels, schedule } from '../js/srs.js';

const MIN = 60 * 1000;
const T0 = new Date(2026, 9, 16, 9, 0, 0).getTime();

test('từ mới đi qua các bước học rồi mới vào ôn dài hạn', () => {
  let c = newCard('3-001');
  c = schedule(c, GOOD, T0);
  assert.equal(c.state, 'learn');
  assert.equal(c.due - T0, 10 * MIN);
  c = schedule(c, GOOD, T0 + 10 * MIN);
  assert.equal(c.state, 'review');
  assert.equal(c.ivl, 1);
  assert.equal(c.due - (T0 + 10 * MIN), DAY_MS);
  assert.equal(c.reps, 2);
});

test('Quên khi đang học thì quay về bước đầu', () => {
  let c = schedule(newCard('x'), GOOD, T0);
  c = schedule(c, AGAIN, T0 + MIN);
  assert.equal(c.state, 'learn');
  assert.equal(c.step, 0);
  assert.equal(c.due - (T0 + MIN), MIN);
});

test('Dễ với từ mới thì nhảy thẳng 4 ngày', () => {
  const c = schedule(newCard('x'), EASY, T0);
  assert.equal(c.state, 'review');
  assert.equal(c.ivl, 4);
});

test('Quên thẻ đang ôn: tăng số lần quên, giảm độ dễ, học lại', () => {
  const card = { ...newCard('x'), state: 'review', ivl: 10, ease: 2.5, reps: 5, due: T0 };
  const c = schedule(card, AGAIN, T0);
  assert.equal(c.state, 'relearn');
  assert.equal(c.lapses, 1);
  assert.equal(c.ease, 2.3);
  assert.equal(c.ivl, 5);
  const back = schedule(c, GOOD, T0 + 10 * MIN);
  assert.equal(back.state, 'review');
  assert.equal(back.ivl, 5);
});

test('khoảng cách tăng dần và không vượt quá 365 ngày, độ dễ không dưới 1.3', () => {
  let c = { ...newCard('x'), state: 'review', ivl: 200, ease: 2.5, due: T0 };
  c = schedule(c, EASY, T0);
  assert.equal(c.ivl, 365);
  let h = { ...newCard('x'), state: 'review', ivl: 3, ease: 1.35, due: T0 };
  h = schedule(h, HARD, T0);
  assert.equal(h.ease, 1.3);
  assert.ok(h.ivl >= 4);
});

test('Khó trong bước học: giữa hai bước', () => {
  const c = schedule(newCard('x'), HARD, T0);
  assert.equal(c.due - T0, Math.round((MIN + 10 * MIN) / 2));
});

test('nhãn thời gian dễ đọc', () => {
  assert.equal(formatGap(30 * 1000), '< 1 phút');
  assert.equal(formatGap(10 * MIN), '10 phút');
  assert.equal(formatGap(3 * 60 * MIN), '3 giờ');
  assert.equal(formatGap(4 * DAY_MS), '4 ngày');
  assert.equal(formatGap(60 * DAY_MS), '2 tháng');
  assert.equal(formatGap(365 * DAY_MS), '1 năm');
  const labels = previewLabels(newCard('x'), T0);
  assert.deepEqual(Object.keys(labels), ['1', '2', '3', '4']);
  assert.equal(labels[EASY], '4 ngày');
});

test('hàng đợi: thẻ đang học trước, rồi thẻ đến hạn, rồi từ mới có giới hạn', () => {
  const cards = {
    a: { ...newCard('a'), state: 'review', due: T0 - DAY_MS, ivl: 3 },
    b: { ...newCard('b'), state: 'learn', due: T0 + 5 * MIN },
    c: { ...newCard('c'), state: 'review', due: T0 + 30 * DAY_MS, ivl: 30 },
  };
  const { due, fresh } = buildQueue({ wordIds: ['a', 'b', 'c', 'd', 'e', 'f'], cards, now: T0, newLimit: 2 });
  assert.deepEqual(due, ['b', 'a']);
  assert.deepEqual(fresh, ['d', 'e']);
  assert.equal(isDueToday(cards.c, T0), false);
});
