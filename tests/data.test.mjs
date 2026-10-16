import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { buildIndex } from '../js/data.js';
import { parseSentence } from '../js/pinyin.js';

const ROOT = new URL('../', import.meta.url);
const raw = JSON.parse(await readFile(new URL('data/words.json', ROOT), 'utf8'));
const HAN = /\p{Script=Han}/u;

test('đủ 298 từ HSK 3 và 598 từ HSK 4, không trùng', () => {
  assert.equal(raw.words.filter((w) => w.level === 3).length, 298);
  assert.equal(raw.words.filter((w) => w.level === 4).length, 598);
  assert.equal(new Set(raw.words.map((w) => w.id)).size, 896);
  assert.equal(new Set(raw.words.map((w) => `${w.hanzi}|${w.py.join('')}`)).size, 896);
});

test('mỗi từ có đủ pinyin, Hán Việt, nghĩa và câu ví dụ chứa chính từ đó', () => {
  for (const w of raw.words) {
    const n = [...w.hanzi].length;
    assert.ok(w.vi && w.en && w.pos && w.topic, w.hanzi);
    // 儿 cuối từ (er hóa) gộp vào âm tiết trước
    const pyLen = w.py.length + (w.hanzi.endsWith('儿') && w.py.length === n - 1 ? 1 : 0);
    assert.equal(pyLen, n, `${w.hanzi} pinyin ${w.py}`);
    assert.equal(w.hv.split(' ').length, n, `${w.hanzi} Hán Việt ${w.hv}`);
    assert.ok(w.ex.zh.includes(w.hanzi), `${w.hanzi}: câu ví dụ không chứa từ`);
    assert.ok(w.ex.vi && w.ex.en && w.ex.py, w.hanzi);
  }
});

test('pinyin câu ví dụ có số âm tiết khớp số chữ Hán', () => {
  const bad = [];
  for (const w of raw.words) {
    const syl = parseSentence(w.ex.py).filter((p) => p.type === 'word').flatMap((p) => p.syllables);
    const hanCount = [...w.ex.zh].filter((c) => HAN.test(c)).length;
    const erhua = syl.filter((s) => /r$/.test(s) && s !== 'ér' && s !== 'èr' && s !== 'ěr' && s !== 'er').length;
    if (syl.length !== hanCount && syl.length + erhua !== hanCount) bad.push(`${w.ex.zh} → ${w.ex.py}`);
  }
  assert.deepEqual(bad, []);
});

test('bài học chứa mọi từ đúng một lần, mỗi bài tối đa 12 từ', () => {
  const seen = new Map();
  for (const l of raw.lessons) {
    assert.ok(l.words.length >= 1 && l.words.length <= 12, l.id);
    for (const id of l.words) seen.set(id, (seen.get(id) || 0) + 1);
  }
  assert.equal(seen.size, 896);
  assert.ok([...seen.values()].every((n) => n === 1));
  const db = buildIndex(raw);
  assert.equal(db.order.length, 896);
});

test('mọi chữ đều có nét viết, bộ thủ và tên bộ tiếng Việt', async () => {
  const files = await readdir(new URL('data/strokes/', ROOT));
  const buckets = {};
  for (const f of files) buckets[f] = JSON.parse(await readFile(new URL(`data/strokes/${f}`, ROOT), 'utf8'));
  for (const w of raw.words) {
    for (const ch of w.hanzi) {
      const info = raw.chars[ch];
      assert.ok(info, ch);
      assert.ok(info.radical && info.radVi, `${ch} thiếu bộ thủ`);
      const file = `${(ch.codePointAt(0) % 64).toString(16).padStart(2, '0')}.json`;
      const d = buckets[file]?.[ch];
      assert.ok(d, `${ch} thiếu nét trong ${file}`);
      assert.equal(d.strokes.length, info.strokes);
      assert.equal(d.medians.length, info.strokes);
    }
  }
});

test('service worker lưu sẵn mọi mô-đun của app', async () => {
  const sw = await readFile(new URL('sw.js', ROOT), 'utf8');
  const mods = [
    ...(await readdir(new URL('js/', ROOT))).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
    ...(await readdir(new URL('js/views/', ROOT))).map((f) => `js/views/${f}`),
    'vendor/hanzi-writer.esm.js',
    'data/words.json',
    'css/app.css',
  ];
  for (const m of mods) assert.ok(sw.includes(`'${m}'`), `sw.js thiếu ${m}`);
});
