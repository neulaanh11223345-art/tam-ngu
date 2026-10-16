// Dựng trang để xuất bản app thành Artifact trên Claude: dist/artifact/index.html
// Trang Artifact được Claude bọc sẵn <html>/<head>/<body> và tự chừa lề trên/dưới cho tai thỏ,
// nên ở đây chỉ giữ phần nội dung, bỏ các thẻ chỉ dùng cho bản cài lên máy (manifest, biểu tượng).
// Chạy: npm run build:artifact   (thêm --preview để có thêm bản xem thử chạy được trên máy)
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('dist/artifact/', ROOT);
const html = await readFile(new URL('index.html', ROOT), 'utf8');

const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];

const keepHead = head
  .split('\n')
  .filter((line) => !/<meta charset|name="viewport"|name="theme-color"|apple-mobile-web-app|mobile-web-app-capable|rel="manifest"|rel="icon"|rel="apple-touch-icon"/.test(line))
  .join('\n')
  .replace('<title>Tam Ngữ</title>', '<title>Tam Ngữ</title>\n<meta name="claude:viewport-fit-sides" content="cover">');

// khung Artifact đã chừa lề trên/dưới (:root), thanh điều hướng cố định vẫn tự chừa lề của nó
const insetFix = `<style>
body { min-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); }
.view { padding-top: 12px; }
.view.full { padding-bottom: 16px; min-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); }
.main { padding-bottom: calc(var(--nav-h) + 16px); }
@media (min-width: 960px) {
  .view { padding-top: 28px; }
  .main { padding-bottom: 32px; }
}
</style>`;

const page = `${keepHead.trim()}\n${insetFix}\n${body.trim()}\n`;
await mkdir(OUT, { recursive: true });
await writeFile(new URL('index.html', OUT), page);
console.log('đã tạo dist/artifact/index.html');

if (process.argv.includes('--preview')) {
  // bọc giống khung của Claude để xem thử trên máy (đặt ở thư mục gốc để đường dẫn tương đối chạy đúng)
  const reset =
    ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}';
  const wrapped = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${reset}</style></head><body>${page}</body></html>`;
  await writeFile(new URL('artifact-preview.html', ROOT), wrapped);
  console.log('đã tạo artifact-preview.html (xóa sau khi xem)');
}

/** Danh sách tệp cần xuất bản kèm trang. */
export async function artifactFiles() {
  const { readdir } = await import('node:fs/promises');
  const list = ['css/app.css', 'vendor/hanzi-writer.esm.js', 'data/words.json'];
  for (const dir of ['js', 'js/views', 'data/strokes']) {
    for (const f of await readdir(new URL(`${dir}/`, ROOT))) if (/\.(js|json)$/.test(f)) list.push(`${dir}/${f}`);
  }
  return list.sort();
}

if (process.argv.includes('--list')) console.log(JSON.stringify(await artifactFiles()));
