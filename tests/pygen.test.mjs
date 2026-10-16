import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { annotate, parseDialogueText } from '../js/pygen.js';

const ROOT = new URL('../', import.meta.url);
const lex = JSON.parse(await readFile(new URL('data/lexicon.json', ROOT), 'utf8'));
const raw = JSON.parse(await readFile(new URL('data/words.json', ROOT), 'utf8'));

test('thêm pinyin cho câu tự nhập: tách từ, thanh nhẹ, biến điệu 一/不', () => {
  assert.equal(annotate('我喜欢去中国。', lex).py, 'Wǒ xǐ|huan qù Zhōng|guó.');
  assert.equal(annotate('不要太累了。', lex).py, 'Bú yào tài lèi le.');
  assert.equal(annotate('我们一起去吧！', lex).py, 'Wǒ|men yì|qǐ qù ba!');
  assert.equal(annotate('小王，你好！', lex).py, 'Xiǎo Wáng, nǐ hǎo!');
});

test('khớp phần lớn pinyin câu ví dụ do công cụ dựng dữ liệu tạo ra', () => {
  let same = 0;
  const diff = [];
  for (const w of raw.words) {
    const mine = annotate(w.ex.zh, lex).py.toLowerCase().replaceAll('|', '');
    const ref = w.ex.py.toLowerCase().replaceAll('|', '');
    if (mine === ref) same += 1;
    else diff.push(`${w.ex.zh}\n  app: ${mine}\n  gốc: ${ref}`);
  }
  const rate = same / raw.words.length;
  if (process.env.SHOW_DIFF) console.log(diff.slice(0, 60).join('\n'));
  assert.ok(rate > 0.8, `chỉ khớp ${(rate * 100).toFixed(1)}%`);
});

test('đọc hội thoại dán vào: tên người nói, bản dịch, dòng không tên', () => {
  const { cast, lines } = parseDialogueText('A：你好！ | Chào bạn!\nB: 你好。\n\n最近怎么样？');
  assert.deepEqual(cast, ['A', 'B']);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].vi, 'Chào bạn!');
  assert.equal(lines[1].zh, '你好。');
  assert.equal(lines[2].s, 0, 'dòng không tên lấy người nói luân phiên');
});
