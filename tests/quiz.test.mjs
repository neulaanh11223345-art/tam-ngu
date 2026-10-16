import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { TYPES, blankSentence, makeQuestion, makeQuiz, makeRng } from '../js/quiz.js';

const raw = JSON.parse(await readFile(new URL('../data/words.json', import.meta.url), 'utf8'));
const pool = raw.words;

test('mọi từ đều tạo được đủ 5 dạng câu hỏi với 4 phương án khác nhau', () => {
  const rng = makeRng(42);
  const failures = [];
  for (const w of pool) {
    for (const type of TYPES) {
      const q = makeQuestion(type, w, pool, rng);
      if (!q) {
        failures.push(`${w.hanzi}:${type}`);
        continue;
      }
      assert.equal(q.options.length, 4, `${w.hanzi} ${type}`);
      const mains = q.options.map((o) => o.main);
      assert.equal(new Set(mains).size, 4, `${w.hanzi} ${type} trùng phương án: ${mains}`);
      assert.ok(q.answer >= 0 && q.answer < 4);
      if (type === 'meaning') assert.equal(q.options[q.answer].main, w.vi);
      if (type === 'hanzi' || type === 'listen' || type === 'fill') assert.equal(q.options[q.answer].main, w.hanzi);
      if (type === 'pinyin') assert.equal(q.options[q.answer].main, w.py.join(''));
    }
  }
  assert.deepEqual(failures, []);
});

test('câu điền từ: các phương án nhiễu không có sẵn trong câu', () => {
  const rng = makeRng(1);
  for (const w of pool.slice(0, 200)) {
    const q = makeQuestion('fill', w, pool, rng);
    const b = blankSentence(w);
    assert.equal(b.before + w.hanzi + b.after, w.ex.zh);
    q.options.forEach((o, i) => {
      if (i !== q.answer) assert.ok(!w.ex.zh.includes(o.main), `${w.hanzi}: ${o.main} có trong câu`);
    });
  }
});

test('bài kiểm tra 10 câu, mỗi từ một câu, dạng câu đa dạng', () => {
  const targets = pool.filter((w) => w.lesson === '3-food-1');
  const qs = makeQuiz({ targets, pool, count: 10, rng: makeRng(3) });
  assert.equal(qs.length, Math.min(10, targets.length));
  assert.equal(new Set(qs.map((q) => q.word.id)).size, qs.length);
  assert.ok(new Set(qs.map((q) => q.type)).size >= 4);
});
