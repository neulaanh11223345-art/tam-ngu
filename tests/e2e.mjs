// Chạy thử app trong Chromium: mở từng màn hình, bấm thử, viết thử một chữ, chụp ảnh.
// Chạy: npm run e2e   (ảnh lưu ở tests/screens/ nếu đặt SCREENS=1)
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startServer } from '../tools/serve.mjs';

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

async function open({ width = 390, height = 844, scheme = 'light', reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'vi-VN', colorScheme: scheme, reducedMotion, hasTouch: width < 700 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // phông chữ Google có thể không tải được khi chạy thử không có mạng
    if (/fonts\.(googleapis|gstatic)\.com|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL|ERR_CONNECTION/.test(text + (m.location()?.url || ''))) return;
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
  assert.equal(await page.title(), 'Tam Ngữ');
  const navText = await page.locator('.nav').innerText();
  for (const label of ['Trang chủ', 'Bài học', 'Ôn tập', 'Luyện viết', 'Thống kê']) assert.ok(navText.includes(label), label);
  await noSideScroll(page, 'trang chủ');
  await shot(page, '01-home-light');
});

await step('bài học: đổi cấp, tìm theo pinyin không dấu', async () => {
  await page.click('.nav a[href="#/lessons"]');
  await page.waitForSelector('.topbar h1:text("Bài học")');
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
  assert.equal(bg, 'rgb(15, 20, 28)');
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

// ---------------- màn hẹp 360px, giảm chuyển động ----------------
const narrow = await open({ width: 360, height: 740, reducedMotion: 'reduce' });
await step('màn 360px không bị tràn ngang ở mọi trang', async () => {
  await narrow.page.goto(BASE);
  await narrow.page.waitForSelector('.hero');
  for (const hash of ['#/', '#/lessons', '#/dialogues', `#/dialogue/${dialogues[0].id}`, '#/mine/new', `#/lesson/${firstLesson.id}`, `#/word/${firstWord.id}`, '#/review', '#/quiz', '#/write', `#/write/word/${firstWord.id}`, '#/stats', '#/settings']) {
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
