// Vẽ biểu tượng app: con dấu đỏ 汉路 (chữ Noto Serif SC) trên nền giấy kem.
// Chạy: npm run icons   (cần Chromium cho Playwright và mạng để tải phông Google; đặt CHROMIUM_PATH nếu cần)
import { chromium } from 'playwright';

const ROOT = new URL('../', import.meta.url);
const FONT = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700&text=%E6%B1%89%E8%B7%AF&display=block';

/** size: cạnh ảnh; seal: tỉ lệ con dấu; round: bo góc nền (0 cho ảnh maskable / iOS tự bo). */
function html({ size = 512, seal = 0.7, round = 0.22 } = {}) {
  const S = size * seal;
  const W = S * 0.86;
  const border = Math.max(2, size * 0.014);
  return `<!doctype html><html><head><link rel="stylesheet" href="${FONT}"><style>
html,body{margin:0;background:transparent}
.icon{width:${size}px;height:${size}px;border-radius:${size * round}px;display:grid;place-items:center;
  background:radial-gradient(circle at 30% 20%,#fffaf1,#f3e7d4 70%,#ead9bf)}
.seal{width:${W}px;height:${S}px;border-radius:${S * 0.12}px;background:#a51d1d;display:flex;flex-direction:column;align-items:center;justify-content:center;
  box-shadow:inset 0 0 0 ${border * 2}px #a51d1d, inset 0 0 0 ${border * 3}px #fff;transform:rotate(-3deg)}
.seal span{font:700 ${S * 0.38}px/1.02 'Noto Serif SC',serif;color:#fff}
</style></head><body><div class="icon"><div class="seal"><span>汉</span><span>路</span></div></div></body></html>`;
}

const targets = [
  ['icons/icon-192.png', { size: 192 }],
  ['icons/icon-512.png', { size: 512 }],
  ['icons/icon-maskable-512.png', { size: 512, seal: 0.56, round: 0 }],
  ['icons/apple-touch-icon.png', { size: 180, seal: 0.66, round: 0 }],
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, opts] of targets) {
  await page.setViewportSize({ width: opts.size, height: opts.size });
  await page.setContent(html(opts), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (!(await page.evaluate(() => document.fonts.check("700 40px 'Noto Serif SC'", '汉路')))) throw new Error('Chưa tải được phông Noto Serif SC');
  await page.locator('.icon').screenshot({ path: new URL(file, ROOT).pathname, omitBackground: true });
  console.log('đã vẽ', file);
}
await browser.close();
