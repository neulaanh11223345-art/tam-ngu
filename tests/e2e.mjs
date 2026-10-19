// Chạy thử app trong Chromium: mở từng màn hình, bấm thử, viết thử một chữ, chụp ảnh.
// Chạy: npm run e2e   (ảnh lưu ở tests/screens/ nếu đặt SCREENS=1)
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from '../tools/serve.mjs';
import { createBackend } from './gas-fake.mjs';

const ROOT = new URL('../', import.meta.url);
const SHOTS = process.env.SCREENS ? new URL('tests/screens/', ROOT) : null;
const raw = JSON.parse(await readFile(new URL('data/words.json', ROOT), 'utf8'));

const server = await startServer(0);
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
if (SHOTS) await mkdir(SHOTS, { recursive: true });

let failed = 0;
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    console.log(`✓ ${name} (${Date.now() - t} ms)`);
  } catch (e) {
    failed += 1;
    console.log(`✗ ${name}\n  ${e.stack || e}`);
  }
}

async function open({ width = 390, height = 844, scheme = 'light', reducedMotion = 'no-preference', serviceWorkers = 'allow' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'vi-VN', colorScheme: scheme, reducedMotion, hasTouch: width < 700, serviceWorkers });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // phông chữ Google có thể không tải được khi chạy thử không có mạng
    if (/fonts\.(googleapis|gstatic)\.com|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL|ERR_CONNECTION|ERR_INTERNET_DISCONNECTED/.test(text + (m.location()?.url || ''))) return;
    errors.push(`console: ${text}`);
  });
  return { context, page, errors };
}

async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: new URL(`${name}.png`, SHOTS).pathname });
}

async function go(page, hash) {
  await page.evaluate((hsh) => {
    location.hash = hsh;
  }, hash);
  await page.waitForTimeout(350);
}

async function noSideScroll(page, where) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `${where}: trang bị cuộn ngang (${sw} > ${iw})`);
}

// ---------------- điện thoại, giao diện sáng ----------------
const phone = await open();
const { page } = phone;

await step('trang chủ mở được, có thanh điều hướng và thẻ ôn hôm nay', async () => {
  await page.goto(BASE);
  await page.waitForSelector('.nav a[aria-current="page"]');
  await page.waitForSelector('.hero');
  assert.match(await page.title(), /^Hán Lộ/);
  const navText = await page.locator('.nav').innerText();
  for (const label of ['Hôm nay', 'Lộ trình', 'Luyện tập', 'Thư viện', 'Tôi']) assert.ok(navText.includes(label), label);
  await noSideScroll(page, 'trang chủ');
  await shot(page, '01-home-light');
});

await step('lộ trình: đổi cấp, tìm theo pinyin không dấu', async () => {
  await page.click('.nav a[href="#/lessons"]');
  await page.waitForSelector('.topbar h1:text("Lộ trình")');
  await page.waitForTimeout(300);
  const hsk3 = await page.locator('.row-link').count();
  assert.ok(hsk3 >= 20, `HSK 3 có ${hsk3} bài`);
  await page.getByRole('radio', { name: 'HSK 4' }).click();
  await page.waitForTimeout(300);
  const hsk4 = await page.locator('.row-link').count();
  assert.ok(hsk4 >= 50, `HSK 4 có ${hsk4} bài`);
  await page.getByRole('radio', { name: 'HSK 5' }).click();
  await page.waitForTimeout(300);
  assert.ok((await page.locator('.row-link').count()) >= 100, 'HSK 5 thiếu bài');
  await noSideScroll(page, 'bài học');
  await shot(page, '02-lessons');
  const target = raw.words.find((w) => w.hanzi.length === 2 && /[ǖǘǚǜü]/.test(w.py.join('')));
  const q = target.py.join('').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ü/g, 'v');
  await page.fill('input[type="search"]', q);
  await page.waitForTimeout(400);
  const results = await page.locator('.word-row, .row-link').allInnerTexts();
  assert.ok(results.some((t) => t.includes(target.hanzi)), `tìm "${q}" không thấy ${target.hanzi}`);
  await page.fill('input[type="search"]', '');
});

const firstLesson = raw.lessons[0];
const firstWord = raw.words.find((w) => w.id === firstLesson.words[0]);

await step('trang bài học và chi tiết từ: pinyin, Hán Việt, câu ví dụ, thứ tự nét', async () => {
  await go(page, `#/lesson/${firstLesson.id}`);
  await page.waitForSelector(`a[href="#/word/${firstWord.id}"]`);
  await shot(page, '03-lesson');
  await page.click(`a[href="#/word/${firstWord.id}"]`);
  await page.waitForSelector('.word-hero, .hero, h1');
  const text = await page.locator('main').innerText();
  assert.ok(text.includes(firstWord.vi.split(';')[0]), 'thiếu nghĩa Việt');
  assert.ok(text.toLowerCase().includes(firstWord.hv.split(' ')[0]), 'thiếu Hán Việt');
  assert.ok(text.includes(firstWord.en.split(';')[0]), 'thiếu nghĩa Anh');
  // thẻ chữ: bấm để xem thứ tự nét
  const card = page.locator('.char-card').first();
  await card.click();
  await page.waitForTimeout(800);
  assert.ok((await page.locator('.char-card svg path').count()) > 0, 'chưa vẽ nét chữ');
  // lưu từ
  const saveBtn = page.getByRole('button', { name: /Lưu|lưu/ }).first();
  await saveBtn.click();
  assert.equal(await saveBtn.getAttribute('aria-pressed'), 'true');
  await noSideScroll(page, 'chi tiết từ');
  await shot(page, '04-word');
});

await step('bài học có bài khóa: tab Bài học, Từ vựng (lọc tiếng Anh), Luyện tập, loa tiếng Anh', async () => {
  const l = raw.lessons.find((x) => x.dlg && x.level === 4);
  const d = JSON.parse(await readFile(new URL('data/dialogues.json', ROOT), 'utf8')).dialogues.find((x) => x.id === l.id);
  await go(page, `#/lesson/${l.id}`);
  await page.waitForSelector('.text-line');
  assert.equal(await page.locator('.text-line').count(), d.lines.length);
  assert.equal(await page.locator('.lh-zh').innerText(), d.title.zh);
  assert.ok((await page.locator('.text-line .say-en').count()) === d.lines.length, 'thiếu loa tiếng Anh ở bài khóa');
  await page.locator('.text-line .say-en').first().click();
  await noSideScroll(page, 'bài học có bài khóa');
  await shot(page, '03b-lesson-text');
  await page.getByRole('radio', { name: 'Từ vựng' }).click();
  await page.waitForSelector('.vocab-card');
  assert.equal(await page.locator('.vocab-card').count(), l.words.length);
  await page.getByRole('radio', { name: 'Tiếng Anh' }).click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.vocab-card .vc-vi').count(), 0, 'lọc Tiếng Anh vẫn hiện nghĩa Việt');
  assert.equal(await page.locator('.vocab-card .say-en').count(), l.words.length);
  await page.locator('.vocab-card .star-btn').first().click();
  assert.equal(await page.locator('.vocab-card .star-btn').first().getAttribute('aria-pressed'), 'true');
  await page.locator('.vocab-card .star-btn').first().click();
  await shot(page, '03c-lesson-words');
  await page.getByRole('radio', { name: 'Tất cả' }).click();
  await page.getByRole('radio', { name: 'Luyện tập' }).click();
  await page.waitForSelector(`a[href="#/dialogue/${l.id}?mode=cloze"]`);
});

await step('luyện tập và thư viện mở được từ thanh điều hướng', async () => {
  await page.click('.nav a[href="#/practice"]');
  await page.waitForSelector('.topbar h1:text("Luyện tập")');
  await page.waitForSelector('a[href="#/quiz"]');
  await noSideScroll(page, 'luyện tập');
  await shot(page, '03d-practice');
  await page.click('.nav a[href="#/library"]');
  await page.waitForSelector('.topbar h1:text("Thư viện")');
  await page.waitForSelector('a[href^="#/dialogue/"]');
  await page.click('.nav a[href="#/me"]');
  await page.waitForSelector('.me-card');
});

await step('ôn tập: lật thẻ, chấm điểm, hoàn tác, xong buổi', async () => {
  await go(page, '#/review');
  await page.waitForSelector('.fc');
  await shot(page, '05-review-front');
  await page.click('.fc');
  await page.waitForSelector('.rate-btn');
  await page.waitForTimeout(500);
  await shot(page, '06-review-back');
  const before = await page.locator('.session-count').innerText();
  await page.click('.rate-btn.good');
  await page.waitForTimeout(400);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.session-count').innerText(), before, 'hoàn tác không trả lại thẻ');
  for (let i = 0; i < 40; i++) {
    if (await page.locator('.done-screen').count()) break;
    await page.click('.fc');
    await page.waitForSelector('.rate-btn');
    await page.keyboard.press(i % 5 === 0 ? '1' : '4');
    await page.waitForTimeout(330);
  }
  await page.waitForSelector('.done-screen', { timeout: 5000 });
  await shot(page, '07-review-done');
  const cards = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tamngu:v1')).cards).length);
  assert.ok(cards >= 10, `mới lưu ${cards} thẻ`);
});

await step('kiểm tra nhanh: 10 câu, có phản hồi và tổng kết', async () => {
  await go(page, '#/quiz');
  await page.waitForSelector('.opt');
  let n = 0;
  while (!(await page.locator('.done-screen').count()) && n < 12) {
    await page.locator('.opt').nth(n % 4).click();
    await page.waitForSelector('.feedback');
    if (n === 1) await shot(page, '08-quiz-feedback');
    await page.locator('.feedback .btn').click();
    await page.waitForTimeout(250);
    n += 1;
  }
  assert.equal(n, 10);
  await page.waitForSelector('.done-screen');
  await shot(page, '09-quiz-done');
});

async function writeCurrentChar(pg, input = 'mouse') {
  const ch = await pg.evaluate(() => document.querySelector('.ww-hz .on').textContent);
  const bucket = JSON.parse(await readFile(new URL(`data/strokes/${(ch.codePointAt(0) % 128).toString(16).padStart(2, '0')}.json`, ROOT), 'utf8'));
  const { medians } = bucket[ch];
  const svg = pg.locator('.hw svg').first();
  const box = await svg.boundingBox();
  const size = Number(await svg.getAttribute('width'));
  const pad = Math.round(size * 0.06);
  const scale = (size - 2 * pad) / 1024;
  const k = box.width / size;
  const at = ([x, y]) => [box.x + (x * scale + pad) * k, box.y + (size - (124 * scale + pad) - y * scale) * k];
  const cdp = input === 'touch' ? await pg.context().newCDPSession(pg) : null;
  const touch = (type, [x, y] = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  for (const median of medians) {
    const pts = median.map(at);
    const path = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      for (let s = 1; s <= 4; s++) path.push([x0 + ((x1 - x0) * s) / 4, y0 + ((y1 - y0) * s) / 4]);
    }
    if (cdp) {
      await touch('touchStart', path[0]);
      for (const p of path.slice(1)) await touch('touchMove', p);
      await touch('touchEnd');
    } else {
      await pg.mouse.move(...path[0]);
      await pg.mouse.down();
      for (const p of path.slice(1)) await pg.mouse.move(...p);
      await pg.mouse.up();
    }
    await pg.waitForTimeout(380);
  }
  await cdp?.detach();
  return ch;
}

await step('luyện viết: xem nét, tự viết từng nét bằng chuột, được chấm sao', async () => {
  const w = raw.words.find((x) => x.hanzi.length === 2 && x.level === 3);
  await go(page, `#/write/word/${w.id}`);
  await page.waitForSelector('.hw svg');
  await page.waitForTimeout(600);
  await shot(page, '10-write-watch');
  // viết ngay sau khi chọn chế độ: nét đầu tiên cũng phải được chấm
  await page.getByRole('radio', { name: 'Tự viết' }).click();
  const ch = await writeCurrentChar(page);
  await page.waitForSelector('.write-result', { timeout: 8000 });
  const stars = await page.locator('.write-result .stars .on').count();
  assert.equal(stars, 3, `viết đúng nét mà chỉ được ${stars} sao`);
  await shot(page, '11-write-done');
  const rec = await page.evaluate((c) => JSON.parse(localStorage.getItem('tamngu:v1')).writing[c], ch);
  assert.equal(rec.n, 1);
  assert.equal(rec.mistakes, 0);
  // sang chữ thứ hai: viết bằng cảm ứng (ngón tay), trang không được cuộn theo
  await page.getByRole('button', { name: 'Chữ tiếp theo' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('radio', { name: 'Tự viết' }).click();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const ch2 = await writeCurrentChar(page, 'touch');
  await page.waitForSelector('.write-result', { timeout: 8000 });
  assert.equal(await page.locator('.write-result .stars .on').count(), 3, `viết ${ch2} bằng cảm ứng chưa được 3 sao`);
  assert.equal(await page.evaluate(() => window.scrollY), scrollBefore, 'trang bị cuộn khi viết');
  // tô theo mẫu, viết sai một nét
  await page.getByRole('radio', { name: 'Tô theo' }).click();
  await page.waitForTimeout(300);
  const svg = await page.locator('.hw svg').first().boundingBox();
  await page.mouse.move(svg.x + 10, svg.y + svg.height - 10);
  await page.mouse.down();
  await page.mouse.move(svg.x + 30, svg.y + svg.height - 40, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const status = await page.locator('.write-status').innerText();
  assert.match(status, /Sai:\s*1/);
  await shot(page, '12-write-trace');
});

const dialogues = JSON.parse(await readFile(new URL('data/dialogues.json', ROOT), 'utf8')).dialogues;

/** Đáp án điền từ theo đúng cách màn hình chọn chỗ trống (mỗi từ một lần, chỗ xuất hiện đầu tiên). */
function clozeAnswers(d) {
  const targets = d.words.map((id) => raw.words.find((w) => w.id === id)).sort((a, b) => b.hanzi.length - a.hanzi.length);
  const used = new Set();
  const out = [];
  for (const line of d.lines) {
    let rest = line.zh;
    while (rest) {
      let best = null;
      for (const w of targets) {
        if (used.has(w.id)) continue;
        const i = rest.indexOf(w.hanzi);
        if (i >= 0 && (!best || i < best.i)) best = { i, w };
      }
      if (!best) break;
      used.add(best.w.id);
      out.push(best.w.hanzi);
      rest = rest.slice(best.i + best.w.hanzi.length);
    }
  }
  return out;
}

await step('hội thoại theo bài: đọc, tra từ, nhập vai, điền từ đúng hết', async () => {
  const d = dialogues[0];
  await go(page, '#/dialogues');
  await page.getByRole('radio', { name: `HSK ${d.level}` }).click();
  await page.waitForSelector(`a[href="#/dialogue/${d.id}"]`);
  await noSideScroll(page, 'danh sách hội thoại');
  await shot(page, '18-dialogues');
  await page.click(`a[href="#/dialogue/${d.id}"]`);
  await page.waitForSelector('.bubble');
  assert.equal(await page.locator('.chat .bubble').count(), d.lines.length);
  await page.locator('.wtap.hl').first().click();
  await page.waitForSelector('.sheet');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await noSideScroll(page, 'hội thoại');
  await shot(page, '19-dialogue-read');
  // tùy chọn hiển thị: chỉ tiếng Anh thì ẩn chữ Hán, vẫn có loa tiếng Anh
  await page.getByRole('button', { name: 'Tùy chọn hiển thị' }).first().click();
  await page.waitForSelector('.opt-sheet');
  await shot(page, '19a-display-sheet');
  await page.locator('.radio-row', { hasText: 'Chỉ tiếng Anh' }).click();
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.chat .b-zh').count(), 0, 'chọn Chỉ tiếng Anh mà vẫn hiện chữ Hán');
  assert.equal(await page.locator('.chat .b-en .say-en').count(), d.lines.length);
  await page.getByRole('button', { name: 'Tùy chọn hiển thị' }).first().click();
  await page.locator('.radio-row', { hasText: 'Đầy đủ' }).click();
  await page.getByRole('button', { name: 'Áp dụng' }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.chat .b-zh').count(), d.lines.length);
  // từng câu: chuyển câu, có lớp tiếng Anh
  await page.getByRole('radio', { name: 'Từng câu' }).click();
  await page.waitForSelector('.line-card');
  assert.equal(await page.locator('.line-tab').count(), d.lines.length);
  await page.getByRole('button', { name: 'Câu tiếp theo' }).click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.line-tab[aria-selected="true"]').innerText(), 'Câu 2');
  assert.equal(await page.locator('.line-card .lang-en .layer-text').innerText(), d.lines[1].en);
  await noSideScroll(page, 'từng câu');
  await shot(page, '19e-dialogue-line');
  await page.getByRole('radio', { name: 'Nhập vai' }).click();
  for (let i = 0; i < 30; i++) {
    const b = page.locator('.role-controls .btn').first();
    if (/Xong/.test(await b.innerText())) {
      await b.click();
      break;
    }
    await b.click();
    await page.waitForTimeout(80);
  }
  await page.waitForSelector('.role-controls >> text=Đổi vai');
  await page.getByRole('radio', { name: 'Điền từ' }).click();
  await page.waitForSelector('.blank-slot');
  const answers = clozeAnswers(d);
  assert.equal(await page.locator('.blank-slot').count(), answers.length);
  for (let i = 0; i < answers.length; i++) {
    await page.locator('.blank-slot').nth(i).click();
    await page.locator('.bank-chip', { hasText: answers[i] }).first().click();
  }
  await shot(page, '19b-dialogue-cloze');
  await page.getByRole('button', { name: 'Chấm điểm' }).click();
  await page.waitForSelector('.feedback.ok');
  assert.match(await page.locator('.feedback').innerText(), new RegExp(`Đúng ${answers.length}/${answers.length}`));
  // tiến độ được lưu sau một nhịp ngắn
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem('tamngu:v1') || '{}').dialogues?.[id]?.best === 1, d.id, { timeout: 3000 });
});

await step('hội thoại tự nhập: dán từ sách, tự thêm pinyin, đọc, xóa', async () => {
  await go(page, '#/mine/new');
  await page.fill('#mine-title', 'Bài thử');
  await page.fill('#mine-text', '小林：你好，好久不见！最近忙什么呢？ | Chào bạn, lâu quá không gặp!\n大卫：我在准备考试，每天都要复习到很晚。\n小林：别太累了，一起去喝杯咖啡吧。');
  await page.waitForFunction(() => document.querySelectorAll('.preview .b-py').length === 3);
  await shot(page, '19c-mine-edit');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await page.waitForSelector('.chat .bubble');
  const py = (await page.locator('.b-py').allInnerTexts()).join(' ');
  assert.match(py, /Nǐ hǎo/);
  assert.match(py, /lèi/);
  assert.match(py, /fùxí/);
  await shot(page, '19d-mine-read');
  await page.click('a[aria-label="Sửa hội thoại"]');
  await page.getByRole('button', { name: 'Xóa hội thoại này' }).click();
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.waitForSelector('.mine-empty');
});

await step('luyện viết: màn chọn chữ có các tab', async () => {
  await go(page, '#/write');
  await page.waitForSelector('.pick-grid a');
  await page.getByRole('radio', { name: 'Hay viết sai' }).click();
  await page.waitForTimeout(250);
  await page.getByRole('radio', { name: 'Theo bài' }).click();
  await page.waitForSelector('a[href^="#/write/lesson/"]');
  await noSideScroll(page, 'luyện viết');
  await shot(page, '13-write-hub');
});

await step('thống kê: biểu đồ thời gian học, lộ trình HSK', async () => {
  await go(page, '#/stats');
  await page.waitForSelector('.chart .chart-col');
  assert.equal(await page.locator('.chart .chart-col').count(), 7);
  await page.getByRole('radio', { name: 'Tháng' }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.chart .chart-col').count(), 4);
  await page.getByRole('radio', { name: 'Tuần' }).click();
  await noSideScroll(page, 'thống kê');
  await shot(page, '14-stats');
});

await step('cài đặt: đổi giao diện tối, xác nhận xóa ngay trong trang', async () => {
  await go(page, '#/settings');
  await page.waitForSelector('.settings-group');
  await noSideScroll(page, 'cài đặt');
  await shot(page, '15-settings');
  await page.getByRole('radio', { name: 'Tối' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.getByRole('button', { name: 'Xóa', exact: true }).click();
  await page.waitForSelector('.confirm-box');
  await shot(page, '16-settings-dark-confirm');
  await page.getByRole('button', { name: 'Giữ lại' }).click();
  assert.equal(await page.locator('.confirm-box').count(), 0);
  const kept = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('tamngu:v1')).cards).length);
  assert.ok(kept > 0, 'bấm Giữ lại mà tiến độ bị xóa');
  await page.getByRole('radio', { name: 'Tự động' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-theme')), false);
});

await step('trang chủ sau khi học: chuỗi ngày, mục tiêu, huy hiệu ôn tập', async () => {
  await go(page, '#/');
  await page.waitForSelector('.hero');
  await shot(page, '17-home-after');
});

await step('không có lỗi JavaScript trên điện thoại', async () => {
  assert.deepEqual(phone.errors, []);
});

await step('chạy offline sau lần mở đầu', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('.hero');
  await page.waitForTimeout(500);
  await phone.context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.hero', { timeout: 8000 });
  await go(page, `#/write/word/${firstWord.id}`);
  await page.waitForSelector('.hw svg', { timeout: 8000 });
  await phone.context.setOffline(false);
});
await phone.context.close();

// ---------------- giao diện tối ----------------
const dark = await open({ scheme: 'dark' });
await step('giao diện tối theo hệ thống', async () => {
  await dark.page.goto(BASE);
  await dark.page.waitForSelector('.hero');
  const bg = await dark.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(21, 16, 13)');
  await shot(dark.page, '20-home-dark');
  await go(dark.page, '#/review');
  await dark.page.waitForSelector('.fc');
  await dark.page.click('.fc');
  await dark.page.waitForSelector('.rate-btn');
  await shot(dark.page, '21-review-dark');
  await go(dark.page, '#/quiz');
  await dark.page.locator('.opt').first().click();
  await dark.page.waitForSelector('.feedback');
  await shot(dark.page, '22-quiz-dark');
  assert.deepEqual(dark.errors, []);
});
await dark.context.close();

// ---------------- máy tính ----------------
const desk = await open({ width: 1280, height: 800 });
await step('màn hình rộng: thanh bên, lưới hai cột', async () => {
  await desk.page.goto(BASE);
  await desk.page.waitForSelector('.hero');
  const navBox = await desk.page.locator('.nav').boundingBox();
  assert.ok(navBox.width >= 200 && navBox.height > 500, 'thanh điều hướng chưa nằm bên trái');
  await noSideScroll(desk.page, 'màn hình rộng');
  await shot(desk.page, '30-home-desktop');
  await go(desk.page, `#/word/${firstWord.id}`);
  await desk.page.waitForTimeout(500);
  await shot(desk.page, '31-word-desktop');
  await go(desk.page, `#/write/word/${firstWord.id}`);
  await desk.page.waitForSelector('.hw svg');
  await shot(desk.page, '32-write-desktop');
  assert.deepEqual(desk.errors, []);
});
await desk.context.close();

// ---------------- đồng bộ khi mở qua Claude (giả lập window.claude) ----------------
const synced = await open();
await step('đồng bộ tiến độ: nhận tiến độ từ máy khác và lưu lại khi học', async () => {
  const p = synced.page;
  const remoteState = {
    version: 1,
    created: 1,
    resetAt: 0,
    settingsAt: 0,
    savedAt: 0,
    settings: {},
    cards: { [firstWord.id]: { id: firstWord.id, state: 'review', due: Date.now() + 5 * 86400000, ivl: 5, ease: 2.5, reps: 3, lapses: 0, step: 0, last: Date.now() - 86400000 } },
    log: {},
    writing: {},
    saved: {},
  };
  await p.addInitScript((remote) => {
    const docs = new Map([['data/users/u_test/progress', { v: 1, updated: 1, json: JSON.stringify(remote) }]]);
    window.__docs = docs;
    const db = Object.freeze({
      doc: (path) =>
        Object.freeze({
          get: async () => ({ exists: docs.has(path), data: () => docs.get(path), metadata: { fromCache: false, hasPendingWrites: false } }),
          set: async (body) => {
            docs.set(path, structuredClone(body));
          },
        }),
    });
    const user = Object.freeze({ id: async () => 'u_test' });
    const caps = { db, user, downloads: null };
    window.claude = Object.freeze({ use: (name) => new Promise((r) => setTimeout(() => r(caps[name] ?? null), 50)) });
  }, remoteState);
  await p.goto(BASE);
  await p.waitForSelector('.hero');
  // tiến độ từ máy khác về: từ đầu tiên đã ở trạng thái ôn dài hạn
  await p.waitForFunction((id) => JSON.parse(localStorage.getItem('tamngu:v1') || '{}').cards?.[id]?.state === 'review', firstWord.id, { timeout: 5000 });
  // học thêm một thẻ rồi rời trang: phải đẩy lên tài khoản
  await go(p, '#/review');
  await p.waitForSelector('.fc');
  await p.click('.fc');
  await p.waitForSelector('.rate-btn');
  await p.keyboard.press('3');
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForFunction(() => Object.keys(JSON.parse(window.__docs.get('data/users/u_test/progress').json).cards).length >= 2, null, { timeout: 5000 });
  const remote = await p.evaluate(() => JSON.parse(window.__docs.get('data/users/u_test/progress').json));
  assert.equal(remote.cards[firstWord.id].state, 'review', 'thẻ của máy khác bị mất khi đẩy lên');
  await go(p, '#/settings');
  assert.match(await p.locator('.settings-group').filter({ hasText: 'Sao lưu tiến độ' }).innerText(), /tài khoản Claude/);
  assert.deepEqual(synced.errors, []);
});
await synced.context.close();

// ---------------- phát âm (giả lập giọng đọc của máy) ----------------
const voiced = await open();
await step('phát âm: nghĩa tiếng Anh đọc bằng giọng Anh, nghe cả bài Trung + Anh, đổi Anh-Mỹ/Anh-Anh', async () => {
  const p = voiced.page;
  await p.addInitScript(() => {
    const voices = [{ lang: 'zh-CN', name: 'Tingting', localService: true }, { lang: 'en-US', name: 'Samantha', localService: true }, { lang: 'en-GB', name: 'Daniel', localService: true }];
    window.__said = [];
    const synth = { getVoices: () => voices, cancel() {}, addEventListener() {}, speak(u) { window.__said.push({ text: u.text, lang: u.lang, voice: u.voice?.name }); setTimeout(() => u.onend?.(), 20); } };
    Object.defineProperty(window, 'speechSynthesis', { value: synth });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
  const d = dialogues[0];
  const w = raw.words.find((x) => x.id === d.words[0]);
  await p.goto(`${BASE}#/word/${w.id}`);
  await p.waitForSelector('.meanings .say-en');
  await p.locator('.meanings .say-en').click();
  await p.waitForTimeout(100);
  let said = await p.evaluate(() => window.__said);
  assert.deepEqual(said.at(-1), { text: said.at(-1).text, lang: 'en-US', voice: 'Samantha' });
  await go(p, '#/settings');
  await p.getByRole('radio', { name: 'Anh-Anh' }).click();
  await go(p, `#/dialogue/${d.id}`);
  await p.waitForSelector('.bubble');
  await p.getByRole('button', { name: 'Tùy chọn hiển thị' }).first().click();
  await p.getByRole('radio', { name: 'Trung + Anh' }).click();
  await p.getByRole('button', { name: 'Áp dụng' }).click();
  await p.evaluate(() => (window.__said = []));
  await p.getByRole('button', { name: /Nghe cả bài/ }).click();
  await p.waitForFunction((n) => window.__said.length >= n, 4, { timeout: 8000 });
  said = await p.evaluate(() => window.__said.slice(0, 4));
  assert.deepEqual(said, [
    { text: d.lines[0].zh, lang: 'zh-CN', voice: 'Tingting' },
    { text: d.lines[0].en, lang: 'en-GB', voice: 'Daniel' },
    { text: d.lines[1].zh, lang: 'zh-CN', voice: 'Tingting' },
    { text: d.lines[1].en, lang: 'en-GB', voice: 'Daniel' },
  ]);
  assert.deepEqual(voiced.errors, []);
});
await voiced.context.close();

// ---------------- tài khoản lớp học (máy chủ Apps Script giả lập) ----------------
const CLASS_URL = 'https://script.google.com/macros/s/TEST/exec';
const school = createBackend();
school.run('setup');
school.setCell('Cài đặt lớp', 2, 2, 'Lớp HSK tối thứ Ba');
const lanRow = school.addStudent('lan', 'Trần Lan', 'lan12345', 4);
school.addStudent('minh', 'Lê Minh', 'minh1234');

/** Một "máy" của học viên: app trỏ tới máy chủ lớp giả; offline() để giả mất mạng. */
async function device(seedGuest = false) {
  const d = await open({ serviceWorkers: 'block' });
  let offline = false;
  await d.context.addInitScript(
    ({ url, seed }) => {
      window.HANLO_ACCOUNT_URL = url;
      if (seed && !localStorage.getItem('tamngu:v1')) localStorage.setItem('tamngu:v1', JSON.stringify(seed));
    },
    { url: CLASS_URL, seed: seedGuest ? { version: 3, cards: { [firstWord.id]: { id: firstWord.id, state: 'review', due: Date.now() + 9e8, ivl: 10, ease: 2.5, reps: 4, lapses: 0, step: 0, last: Date.now() - 864e5 } } } : null },
  );
  await d.context.route(`${CLASS_URL}**`, async (route) => {
    if (offline) return route.abort('internetdisconnected');
    const res = school.post(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(res) });
  });
  d.setOffline = (v) => (offline = v);
  return d;
}

async function loginAs(p, user, pass, { adopt } = {}) {
  await p.waitForSelector('#login-user');
  await p.fill('#login-user', user);
  await p.fill('#login-pass', pass);
  if (adopt !== undefined) await p.setChecked('#login-adopt', adopt);
  await Promise.all([p.waitForEvent('load'), p.getByRole('button', { name: 'Đăng nhập', exact: true }).click()]);
  await p.waitForSelector('.hero');
}

const stored = (p, user) => p.evaluate((u) => JSON.parse(localStorage.getItem(`tamngu:v1@${u}`) || 'null'), user);

async function syncButton(p) {
  await go(p, '#/account');
  await p.getByRole('button', { name: 'Đồng bộ ngay' }).click();
  await p.waitForFunction(() => /Đã đồng bộ|Chưa đồng bộ được|hết hạn/.test(document.querySelector('.acc-sync')?.textContent || ''), null, { timeout: 8000 });
  return p.locator('.acc-sync').innerText();
}

const devA = await device(true);
const devB = await device();
await step('tài khoản: màn đăng nhập, sai mật khẩu, đăng nhập và chuyển tiến độ khách vào tài khoản, cấp HSK do giáo viên đặt', async () => {
  const p = devA.page;
  await p.goto(BASE);
  await p.waitForSelector('.login-view');
  await p.waitForFunction(() => document.querySelector('.login-class')?.textContent === 'Lớp HSK tối thứ Ba');
  assert.ok(await p.locator('.login-view .motto').count(), 'màn đăng nhập thiếu câu đề tựa');
  assert.equal(await p.locator('.nav').isVisible().catch(() => false), false, 'màn đăng nhập không được hiện thanh điều hướng');
  await shot(p, '50-login');
  await p.fill('#login-user', 'lan');
  await p.fill('#login-pass', 'sai-mat-khau');
  await p.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await p.waitForFunction(() => /Sai tên đăng nhập/.test(document.querySelector('.login-error')?.textContent || ''));
  assert.equal(await p.isChecked('#login-adopt'), true, 'nên mặc định chuyển tiến độ khách vào tài khoản đầu tiên');
  await loginAs(p, 'lan', 'lan12345');
  assert.equal(await p.locator('.acc-chip').innerText(), 'TL');
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('tamngu:v1@lan') || '{}').settings?.levels?.join() === '4', null, { timeout: 8000 });
  const lan = await stored(p, 'lan');
  assert.equal(lan.cards[firstWord.id]?.state, 'review', 'tiến độ khách chưa được chuyển vào tài khoản');
  await shot(p, '51-home-account');
  assert.deepEqual(devA.errors, []);
});

await step('tài khoản: học trên máy A, đồng bộ; giáo viên thấy bảng tiến độ; máy B đăng nhập thấy đúng tiến độ', async () => {
  const p = devA.page;
  await go(p, '#/review');
  await p.waitForSelector('.fc');
  for (let i = 0; i < 3; i++) {
    await p.click('.fc');
    await p.waitForSelector('.rate-btn');
    await p.keyboard.press('3');
    await p.waitForTimeout(350);
  }
  assert.match(await syncButton(p), /Đã đồng bộ/);
  await shot(p, '52-account');
  const r = school.rowOf('Tiến độ', 'lan');
  assert.ok(r > 1, 'giáo viên chưa thấy dòng tiến độ của Lan');
  const row = school.sheets.get('Tiến độ').data[r - 1];
  assert.equal(row[1], 'Trần Lan');
  assert.ok(row[8] >= 3, `số thẻ đã ôn trên bảng là ${row[8]}`);
  assert.ok(row[2] >= 1, 'chưa tính từ HSK 3 đã thuộc');
  const cardsA = Object.keys((await stored(p, 'lan')).cards).sort();
  const q = devB.page;
  await q.goto(BASE);
  await loginAs(q, 'lan', 'lan12345');
  await q.waitForFunction((n) => Object.keys(JSON.parse(localStorage.getItem('tamngu:v1@lan') || '{}').cards || {}).length >= n, cardsA.length, { timeout: 8000 });
  assert.deepEqual(Object.keys((await stored(q, 'lan')).cards).sort(), cardsA);
});

await step('tài khoản: hai học viên trên một máy không lẫn tiến độ; mã PIN chặn người khác', async () => {
  const q = devB.page;
  await go(q, '#/account');
  await q.getByRole('link', { name: 'Thêm tài khoản' }).click();
  await loginAs(q, 'minh', 'minh1234');
  assert.equal(await q.locator('.acc-chip').innerText(), 'LM');
  assert.equal(Object.keys((await stored(q, 'minh'))?.cards || {}).length, 0, 'tài khoản Minh lại có thẻ của Lan');
  await go(q, '#/account');
  await q.getByRole('button', { name: 'Đặt PIN' }).click();
  for (const k of '24682468') {
    await q.locator('.sheet .pin-key', { hasText: k }).click();
    await q.waitForTimeout(60);
  }
  await q.waitForSelector('.sheet-wrap', { state: 'detached' });
  assert.match(await q.locator('.set-row', { hasText: 'Mã PIN' }).innerText(), /Đã bật/);
  // mở app ở thẻ mới (phiên mới): phải nhập PIN
  const q2 = await devB.context.newPage();
  await q2.goto(BASE);
  await q2.waitForSelector('.pin-pad');
  for (const k of '1111') await q2.locator('.pin-key', { hasText: k }).click();
  await q2.waitForFunction(() => /chưa đúng/.test(document.querySelector('.pin-msg')?.textContent || ''));
  await shot(q2, '53-pin');
  for (const k of '2468') await q2.locator('.pin-key', { hasText: k }).click();
  await q2.waitForSelector('.hero');
  assert.equal(await q2.locator('.acc-chip').innerText(), 'LM');
  await q2.close();
  // đổi sang Lan (không có PIN) ngay trong tab Tài khoản
  await go(q, '#/account');
  await Promise.all([q.waitForEvent('load'), q.locator('.acc-pick', { hasText: 'Trần Lan' }).click()]);
  await q.waitForSelector('.hero');
  assert.equal(await q.locator('.acc-chip').innerText(), 'TL');
  assert.deepEqual(devB.errors, []);
});

await step('tài khoản: mất mạng vẫn học, có mạng lại thì gửi lên; máy kia gộp được', async () => {
  const p = devA.page;
  devA.setOffline(true);
  await go(p, '#/review');
  await p.waitForSelector('.fc');
  await p.click('.fc');
  await p.waitForSelector('.rate-btn');
  await p.keyboard.press('4');
  await p.waitForTimeout(350);
  assert.match(await syncButton(p), /Chưa đồng bộ được/);
  devA.setOffline(false);
  assert.match(await syncButton(p), /Đã đồng bộ/);
  const cardsA = Object.keys((await stored(p, 'lan')).cards).sort();
  const q = devB.page;
  await syncButton(q);
  assert.deepEqual(Object.keys((await stored(q, 'lan')).cards).sort(), cardsA, 'máy B chưa nhận phần học lúc mất mạng của máy A');
});

await step('tài khoản: giáo viên khóa tài khoản thì máy đang dùng phải đăng nhập lại; đăng xuất xóa tài khoản khỏi máy', async () => {
  const p = devA.page;
  school.setCell('Học viên', lanRow, 5, true);
  await go(p, '#/account');
  await p.getByRole('button', { name: 'Đồng bộ ngay' }).click();
  await p.waitForSelector('.login-view', { timeout: 8000 });
  await p.locator('.acc-pick', { hasText: 'Trần Lan' }).click();
  await p.fill('#login-pass', 'lan12345');
  await p.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await p.waitForFunction(() => /bị khóa/.test(document.querySelector('.login-error')?.textContent || ''));
  school.setCell('Học viên', lanRow, 5, false);
  // máy B: đăng xuất Lan, chỉ còn Minh trong danh sách
  const q = devB.page;
  await go(q, '#/account');
  await q.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await Promise.all([q.waitForEvent('load'), q.locator('.confirm-box').getByRole('button', { name: 'Đăng xuất' }).click()]);
  await q.waitForSelector('.login-view');
  const names = await q.locator('.acc-pick').allInnerTexts();
  assert.equal(names.length, 1);
  assert.match(names[0], /Lê Minh/);
  assert.equal(await stored(q, 'lan'), null, 'đăng xuất mà tiến độ của Lan vẫn nằm trên máy');
  // học như khách vẫn được
  await Promise.all([q.waitForEvent('load'), q.getByRole('button', { name: 'Học không cần tài khoản' }).click()]);
  await q.waitForSelector('.hero');
  assert.equal(await q.locator('.acc-chip').count(), 0);
  assert.deepEqual(devA.errors, []);
  assert.deepEqual(devB.errors, []);
});
await devA.context.close();
await devB.context.close();

// ---------------- màn hẹp 360px, giảm chuyển động ----------------
const narrow = await open({ width: 360, height: 740, reducedMotion: 'reduce' });
await step('màn 360px không bị tràn ngang ở mọi trang', async () => {
  await narrow.page.goto(BASE);
  await narrow.page.waitForSelector('.hero');
  for (const hash of ['#/', '#/lessons', '#/practice', '#/library', '#/me', `#/lesson/${raw.lessons.find((x) => x.dlg).id}`, `#/dialogue/${dialogues[0].id}?mode=line`, '#/dialogues', `#/dialogue/${dialogues[0].id}`, '#/mine/new', `#/lesson/${firstLesson.id}`, `#/word/${firstWord.id}`, '#/review', '#/quiz', '#/write', `#/write/word/${firstWord.id}`, '#/stats', '#/settings']) {
    await go(narrow.page, hash);
    await narrow.page.waitForTimeout(250);
    await noSideScroll(narrow.page, hash);
  }
  await shot(narrow.page, '40-settings-360');
  assert.deepEqual(narrow.errors, []);
});
await narrow.context.close();

await browser.close();
server.close();
console.log(failed ? `\n${failed} bước lỗi` : '\nTất cả các bước đều qua');
process.exit(failed ? 1 : 0);
