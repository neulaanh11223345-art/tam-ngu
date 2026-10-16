import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSentence, plainSentence, stripTone, toneOf, toneVariants, withTone } from '../js/pinyin.js';
import { makeRng } from '../js/quiz.js';

test('nhận thanh điệu và bỏ dấu', () => {
  assert.equal(toneOf('mā'), 1);
  assert.equal(toneOf('lǚ'), 3);
  assert.equal(toneOf('Zhōng'), 1);
  assert.equal(toneOf('de'), 0);
  assert.equal(stripTone('lǚ'), 'lü');
  assert.equal(stripTone('Ài'), 'Ai');
});

test('đặt dấu thanh đúng nguyên âm', () => {
  assert.equal(withTone('hao', 3), 'hǎo');
  assert.equal(withTone('dou', 1), 'dōu');
  assert.equal(withTone('liu', 2), 'liú');
  assert.equal(withTone('gui', 4), 'guì');
  assert.equal(withTone('lü', 4), 'lǜ');
  assert.equal(withTone('Ai', 4), 'Ài');
  assert.equal(withTone('ma', 0), 'ma');
});

test('tách câu đã chú âm thành từ, khoảng trắng, dấu câu', () => {
  const parts = parseSentence('Wǒ xǐ|huan qù Zhōng|guó.');
  assert.deepEqual(parts.filter((p) => p.type === 'word').map((p) => p.syllables), [['Wǒ'], ['xǐ', 'huan'], ['qù'], ['Zhōng', 'guó']]);
  assert.equal(parts.at(-1).text, '.');
  assert.equal(plainSentence('xǐ|huan'), 'xǐhuan');
});

test('phương án sai chỉ đổi thanh và không trùng đáp án', () => {
  const rng = makeRng(7);
  const out = toneVariants(['huán', 'jìng'], 3, rng);
  assert.equal(out.length, 3);
  assert.equal(new Set(out).size, 3);
  for (const s of out) {
    assert.notEqual(s, 'huánjìng');
    assert.equal(stripTone(s), 'huanjing');
  }
});
