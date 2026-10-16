// Vẽ biểu tượng app: chữ 语 (lấy nét từ data/strokes) trên nền xanh, có ô 田字格 mờ.
// Chạy: npm run icons   (cần Chromium cho Playwright; đặt CHROMIUM_PATH nếu cần)
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const ROOT = new URL('../', import.meta.url);
const CHAR = '语';
const bucket = (CHAR.codePointAt(0) % 128).toString(16).padStart(2, '0');
const strokes = JSON.parse(await readFile(new URL(`data/strokes/${bucket}.json`, ROOT), 'utf8'))[CHAR].strokes;

/** size: cạnh ảnh; glyph: tỉ lệ ô chữ; round: bo góc (0 cho ảnh maskable / iOS tự bo). */
function svg({ size = 512, glyph = 0.62, round = 0.22 } = {}) {
  const S = size * glyph;
  const x0 = (size - S) / 2;
  const y0 = (size - S) / 2 + size * 0.01;
  const k = S / 1024;
  const r = size * round;
  const g = (size - S) / 2 - size * 0.04;
  const G = S + size * 0.08;
  const line = 'stroke="#fff" stroke-opacity=".26" stroke-width="' + (size / 170).toFixed(2) + '" stroke-dasharray="' + (size / 64).toFixed(1) + ' ' + (size / 85).toFixed(1) + '"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b6cf0"/><stop offset="1" stop-color="#1747a8"/></linearGradient></defs>
<rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
<rect x="${g}" y="${g}" width="${G}" height="${G}" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width="${(size / 128).toFixed(2)}" rx="${size * 0.02}"/>
<path d="M${size / 2} ${g}V${g + G}M${g} ${size / 2}H${g + G}" fill="none" ${line}/>
<g transform="translate(${x0.toFixed(2)} ${(y0 + 900 * k).toFixed(2)}) scale(${k.toFixed(5)} ${(-k).toFixed(5)})" fill="#fff">${strokes.map((d) => `<path d="${d}"/>`).join('')}</g>
</svg>`;
}

await writeFile(new URL('icons/icon.svg', ROOT), svg());

const targets = [
  ['icons/icon-192.png', 192, { size: 192 }],
  ['icons/icon-512.png', 512, { size: 512 }],
  ['icons/icon-maskable-512.png', 512, { size: 512, glyph: 0.5, round: 0 }],
  ['icons/apple-touch-icon.png', 180, { size: 180, glyph: 0.58, round: 0 }],
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, px, opts] of targets) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg(opts)}`);
  await page.locator('svg').screenshot({ path: new URL(file, ROOT).pathname, omitBackground: true });
  console.log('đã vẽ', file);
}
await browser.close();
