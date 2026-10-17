import assert from 'node:assert/strict';
import test from 'node:test';
import { speakableEnglish } from '../js/speech.js';

test('nghĩa tiếng Anh dạng từ điển được đọc thành câu tự nhiên', () => {
  assert.equal(speakableEnglish('to hand in; to make (friends)'), 'to hand in, to make friends');
  assert.equal(speakableEnglish('to visit sb; to call on sth.'), 'to visit somebody, to call on something');
  assert.equal(speakableEnglish('aunt / nanny'), 'aunt, nanny');
  assert.equal(speakableEnglish(''), '');
});
