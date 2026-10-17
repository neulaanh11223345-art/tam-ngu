// Thêm hoặc sửa hội thoại tự nhập (dán từ sách đang học). App tự thêm pinyin để xem trước.
import { loadLexicon } from '../data.js';
import { button, h, icon, pinyinSentence, toast, zh } from '../dom.js';
import { annotate, parseDialogueText } from '../pygen.js';

const SAMPLE = `A：你好，好久不见！最近忙什么呢？ | Chào bạn, lâu quá không gặp! Dạo này bận gì thế?
B：我在准备考试，每天都要复习到很晚。 | Mình đang ôn thi, ngày nào cũng ôn đến khuya.`;

export function render(ctx) {
  const { store, params } = ctx;
  const id = params[0] === 'new' ? null : params[0];
  const entry = id ? store.state.mine[id] : null;
  if (id && (!entry || entry.deleted)) {
    ctx.navigate('#/library', { replace: true });
    return { el: h('div', { class: 'view' }) };
  }

  const title = h('input', { type: 'text', id: 'mine-title', class: 'field', maxlength: '80', placeholder: 'Ví dụ: Bài 5 – Ở bưu điện', value: entry?.title || '' });
  const text = h('textarea', { id: 'mine-text', class: 'field area', rows: '10', placeholder: SAMPLE, spellcheck: 'false' });
  text.value = entry?.text || '';
  const preview = h('div', { class: 'chat preview' });
  const count = h('span', { class: 'small muted' });
  let lex = null;

  function drawPreview() {
    const { cast, lines } = parseDialogueText(text.value);
    count.textContent = lines.length ? `${lines.length} câu · ${cast.length} người nói` : '';
    if (!lines.length) {
      preview.replaceChildren(h('p', { class: 'small muted' }, 'Phần xem trước có pinyin sẽ hiện ở đây.'));
      return;
    }
    if (!lex) {
      preview.replaceChildren(h('p', { class: 'small muted' }, 'Đang tải từ điển để thêm pinyin…'));
      return;
    }
    preview.replaceChildren(
      ...lines.slice(0, 30).map((l) =>
        h(
          'article',
          { class: `bubble s${l.s % 3} ${l.s % 2 ? 'right' : 'left'}` },
          h('header', { class: 'b-who' }, h('span', null, cast[l.s])),
          h('div', { class: 'b-main' }, h('div', { class: 'b-text' }, h('p', { class: 'b-zh', lang: 'zh-CN' }, zh(l.zh)), h('p', { class: 'b-py' }, pinyinSentence(annotate(l.zh, lex).py)), l.vi ? h('p', { class: 'b-vi' }, l.vi) : null)),
        ),
      ),
    );
  }

  loadLexicon()
    .then((x) => {
      lex = x;
      drawPreview();
    })
    .catch(() => preview.replaceChildren(h('p', { class: 'small muted' }, 'Chưa tải được từ điển nên chưa xem trước pinyin. Bạn vẫn lưu được hội thoại.')));

  let t = null;
  text.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(drawPreview, 250);
  });

  function save() {
    const { lines } = parseDialogueText(text.value);
    if (!lines.length) {
      toast('Hãy dán ít nhất một câu tiếng Trung');
      text.focus();
      return;
    }
    const key = store.saveMine(id, { title: title.value.trim(), text: text.value.trim() });
    toast('Đã lưu hội thoại');
    ctx.navigate(`#/mine/${key}`, { replace: true });
  }

  const delSlot = h('div');
  function drawDelete(asking) {
    if (!id) return;
    if (!asking) {
      delSlot.replaceChildren(button('Xóa hội thoại này', { icon: 'trash', variant: 'ghost', size: 'sm', onclick: () => drawDelete(true) }));
      return;
    }
    delSlot.replaceChildren(
      h(
        'div',
        { class: 'confirm-box', role: 'alertdialog', 'aria-label': 'Xác nhận xóa hội thoại' },
        h('p', null, h('b', null, 'Xóa hội thoại này?')),
        h('div', { class: 'confirm-actions' }, button('Giữ lại', { variant: 'secondary', size: 'sm', onclick: () => drawDelete(false) }), button('Xóa', { icon: 'trash', variant: 'danger', size: 'sm', onclick: () => {
          store.deleteMine(id);
          toast('Đã xóa hội thoại');
          ctx.navigate('#/library', { replace: true });
        } })),
      ),
    );
  }
  drawDelete(false);

  const el = h(
    'div',
    { class: 'view' },
    h('header', { class: 'topbar' }, h('a', { class: 'icon-btn', href: id ? `#/mine/${id}` : '#/library', 'aria-label': 'Quay lại' }, icon('back', 24)), h('h1', { class: 'grow' }, id ? 'Sửa hội thoại' : 'Thêm hội thoại')),
    h(
      'section',
      { class: 'card mine-form' },
      h('label', { for: 'mine-title' }, 'Tên hội thoại'),
      title,
      h('label', { for: 'mine-text' }, 'Nội dung'),
      h('p', { class: 'small muted' }, 'Mỗi câu một dòng. Có thể ghi tên người nói trước dấu hai chấm (A：…, 小王：…) và thêm bản dịch tiếng Việt sau dấu |. Hội thoại chỉ lưu cho riêng bạn.'),
      text,
      h('div', { class: 'form-actions' }, count, button('Lưu', { icon: 'check', onclick: save })),
    ),
    h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Xem trước')), preview),
    h('div', { style: { marginTop: '16px' } }, delSlot),
  );
  drawPreview();
  return { el, title: id ? 'Sửa hội thoại' : 'Thêm hội thoại' };
}
