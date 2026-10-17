import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GOOD, AGAIN, newCard } from '../js/srs.js';
import { createStore, mergeStates, normalize, stableJSON, streak } from '../js/store.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const T0 = new Date(2026, 9, 16, 9, 0, 0).getTime();

test('chấm thẻ ghi vào nhật ký ngày, hoàn tác trả lại như cũ', () => {
  let t = T0;
  const store = createStore(memory(), () => t);
  store.rate('3-001', GOOD);
  assert.equal(store.state.cards['3-001'].state, 'learn');
  assert.deepEqual({ ...store.todayLog() }, { reviews: 1, fresh: 1, good: 1, bad: 0, ms: 0, writes: 0 });
  store.restore('3-001', newCard('3-001'), true);
  assert.equal(store.state.cards['3-001'], undefined);
  store.rate('3-002', AGAIN);
  assert.equal(store.todayLog().bad, 1);
  t += 60_000;
  store.addStudyTime(500_000);
  assert.equal(store.todayLog().ms, 120_000, 'mỗi lần cộng tối đa 2 phút');
});

test('lưu lại sau khi flush và đọc lại được', () => {
  const storage = memory();
  const a = createStore(storage, () => T0);
  a.setSettings({ newPerDay: 15 });
  a.toggleSaved('4-010');
  a.recordWriting('爱', 2);
  a.flush();
  const b = createStore(storage, () => T0);
  assert.equal(b.state.settings.newPerDay, 15);
  assert.ok(b.state.saved['4-010']);
  assert.equal(b.state.writing['爱'].best, 2);
  assert.equal(b.state.settings.front.py, true, 'cài đặt mặc định vẫn còn');
});

test('xuất rồi nhập lại sao lưu', () => {
  const a = createStore(memory(), () => T0);
  a.rate('3-001', GOOD);
  const json = a.exportJSON();
  const b = createStore(memory(), () => T0 + 1000);
  b.importJSON(json);
  assert.equal(b.state.cards['3-001'].state, 'learn');
  assert.equal(b.state.resetAt, T0 + 1000);
  assert.throws(() => b.importJSON('{"hello":1}'), /không phải bản sao lưu/);
});

test('gộp tiến độ hai máy: thẻ mới hơn thắng, nhật ký lấy số lớn hơn', () => {
  const phone = normalize({
    cards: { a: { ...newCard('a'), state: 'review', last: 200, reps: 3 }, b: { ...newCard('b'), state: 'learn', last: 100, reps: 1 } },
    log: { '2026-10-16': { reviews: 5, fresh: 2, good: 4, bad: 1, ms: 60000, writes: 0 } },
    settings: { newPerDay: 20 },
    settingsAt: 50,
  });
  const laptop = normalize({
    cards: { a: { ...newCard('a'), state: 'learn', last: 100, reps: 2 }, c: { ...newCard('c'), state: 'review', last: 300, reps: 4 } },
    log: { '2026-10-16': { reviews: 3, fresh: 3, good: 3, bad: 0, ms: 90000, writes: 2 } },
    settings: { newPerDay: 5 },
    settingsAt: 80,
    writing: { 爱: { n: 1, mistakes: 0, best: 0, last: 10 } },
  });
  const m = mergeStates(phone, laptop);
  assert.equal(m.cards.a.state, 'review');
  assert.equal(m.cards.b.state, 'learn');
  assert.equal(m.cards.c.state, 'review');
  assert.deepEqual(m.log['2026-10-16'], { reviews: 5, fresh: 3, good: 4, bad: 1, ms: 90000, writes: 2 });
  assert.equal(m.settings.newPerDay, 5);
  assert.equal(m.writing['爱'].n, 1);
  assert.equal(stableJSON(mergeStates(laptop, phone)), stableJSON(m), 'gộp theo thứ tự nào cũng ra như nhau');
  assert.equal(stableJSON(mergeStates(m, m)), stableJSON(m));
});

test('xóa tiến độ trên một máy thì thắng hẳn bản cũ', () => {
  const old = normalize({ cards: { a: { ...newCard('a'), state: 'review', last: 500 } }, resetAt: 0 });
  const wiped = normalize({ cards: {}, resetAt: 400 });
  assert.deepEqual(mergeStates(old, wiped).cards, {});
  assert.deepEqual(mergeStates(wiped, old).cards, {});
});

test('chuỗi ngày học', () => {
  const log = {
    '2026-10-14': { reviews: 3, good: 3, bad: 0, writes: 0 },
    '2026-10-15': { reviews: 0, good: 0, bad: 0, writes: 2 },
  };
  assert.equal(streak(log, T0), 2, 'hôm nay chưa học vẫn giữ chuỗi hôm qua');
  log['2026-10-16'] = { reviews: 1, good: 1, bad: 0, writes: 0 };
  assert.equal(streak(log, T0), 3);
  assert.equal(streak({}, T0), 0);
});

test('bản lưu cũ chỉ có HSK 3–4 được thêm HSK 5; ai đã chọn riêng thì giữ nguyên', () => {
  assert.deepEqual(normalize({ version: 1, settings: { levels: [3, 4] } }).settings.levels, [3, 4, 5]);
  assert.deepEqual(normalize({ version: 1, settings: { levels: [4] } }).settings.levels, [4]);
  assert.deepEqual(normalize({ version: 2, settings: { levels: [3, 4] } }).settings.levels, [3, 4]);
});

test('hội thoại tự nhập: lưu, xóa, gộp giữa hai máy', () => {
  let t = 1000;
  const a = createStore(memory(), () => t);
  const id = a.saveMine(null, { title: 'Bài 1', text: 'A：你好！' });
  t = 2000;
  a.recordDialogue('4-ppl-1', 0.5);
  a.recordDialogue('4-ppl-1', 1);
  assert.equal(a.state.dialogues['4-ppl-1'].reads, 2);
  assert.equal(a.state.dialogues['4-ppl-1'].best, 1);
  const before = structuredClone(a.state);
  t = 3000;
  a.deleteMine(id);
  assert.equal(a.state.mine[id].deleted, true);
  const m = mergeStates(before, a.state);
  assert.equal(m.mine[id].deleted, true, 'xóa ở một máy thì máy kia cũng xóa');
  a.reset();
  assert.ok(a.state.mine[id], 'xóa tiến độ vẫn giữ hội thoại tự nhập');
  assert.deepEqual(a.state.dialogues, {});
});

test('bản lưu trước Hán Lộ được bật sẵn lớp tiếng Anh trong bài khóa', () => {
  assert.equal(normalize({ version: 2, settings: { dlg: { py: true, vi: true, en: false } } }).settings.dlg.en, true);
  assert.equal(normalize({ version: 3, settings: { dlg: { py: true, vi: true, en: false } } }).settings.dlg.en, false);
  const fresh = normalize({ version: 3, settings: {} }).settings;
  assert.deepEqual(fresh.dlg, { zh: true, py: true, vi: true, en: true });
  assert.equal(fresh.enAccent, 'en-US');
  assert.equal(fresh.playLang, 'zh');
});
