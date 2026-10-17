import { data, levelsAvailable } from '../data.js';
import { button, h, icon, segmented, toast, toggle } from '../dom.js';
import { onSyncStatus, saveTextFile, syncStatus } from '../host.js';
import { hasChineseVoice, hasVoice, setEnglishAccent, speak } from '../speech.js';
import { sayAs } from './common.js';

const SYNC_TEXT = {
  on: 'Tiến độ được lưu vào tài khoản Claude của bạn, mở trên máy khác vẫn học tiếp được.',
  connecting: 'Đang kết nối để lưu tiến độ vào tài khoản…',
  error: 'Chưa lưu được lên tài khoản, sẽ thử lại sau. Tiến độ vẫn được giữ trên máy này.',
};

export function render(ctx) {
  const { store } = ctx;
  const s = () => store.state.settings;

  const row = (label, desc, control) => h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, h('span', null, label), desc ? h('small', null, desc) : null), control);

  const levelToggles = levelsAvailable().map((lv) =>
    toggle(`HSK ${lv}`, s().levels.includes(lv), (on) => {
      let levels = s().levels.filter((x) => x !== lv);
      if (on) levels = [...levels, lv].sort((a, b) => a - b);
      if (!levels.length) {
        toast('Cần chọn ít nhất một cấp');
        levels = [lv];
      }
      store.setSettings({ levels });
    }, `${data().lessonsByLevel[lv].reduce((n, l) => n + l.words.length, 0)} từ · ${data().lessonsByLevel[lv].length} bài`),
  );

  const study = h(
    'section',
    { class: 'card settings-group' },
    h('div', { class: 'set-row' }, h('h2', { style: { fontSize: '16px' } }, 'Học tập')),
    ...levelToggles,
    row(
      'Từ mới mỗi ngày',
      'Số từ mới đưa vào ôn tập mỗi ngày',
      segmented(
        [5, 10, 15, 20].map((n) => [n, String(n)]),
        s().newPerDay,
        (v) => store.setSettings({ newPerDay: v }),
        'Từ mới mỗi ngày',
      ),
    ),
    row(
      'Mục tiêu mỗi ngày',
      'Số phút học',
      segmented(
        [10, 15, 20, 30].map((n) => [n, `${n}'`]),
        s().dailyGoal,
        (v) => store.setSettings({ dailyGoal: v }),
        'Mục tiêu phút mỗi ngày',
      ),
    ),
  );

  const front = s().front;
  const display = h(
    'section',
    { class: 'card settings-group section' },
    h('div', { class: 'set-row' }, h('h2', { style: { fontSize: '16px' } }, 'Hiển thị')),
    row(
      'Giao diện',
      null,
      segmented(
        [
          ['system', 'Tự động'],
          ['light', 'Sáng'],
          ['dark', 'Tối'],
        ],
        s().theme,
        (v) => store.setSettings({ theme: v }),
        'Giao diện sáng tối',
      ),
    ),
    toggle('Tô màu thanh điệu', s().toneColors, (on) => store.setSettings({ toneColors: on }), 'Đỏ thanh 1 · cam thanh 2 · xanh lá thanh 3 · tím thanh 4'),
    h('div', { class: 'set-row', style: { flexDirection: 'column', alignItems: 'stretch', gap: '8px' } }, h('span', { class: 'set-label' }, h('span', null, 'Mặt trước thẻ ôn tập'), h('small', null, 'Các lớp hiện sẵn khi chưa lật thẻ'))),
    toggle('Pinyin', front.py, (on) => store.setSettings({ front: { ...s().front, py: on } })),
    toggle('Hán Việt', front.hv, (on) => store.setSettings({ front: { ...s().front, hv: on } })),
    toggle('English', front.en, (on) => store.setSettings({ front: { ...s().front, en: on } })),
    toggle('Tiếng Việt', front.vi, (on) => store.setSettings({ front: { ...s().front, vi: on } })),
  );

  const voice = hasChineseVoice();
  const enVoice = hasVoice('en');
  const audio = h(
    'section',
    { class: 'card settings-group section' },
    h('div', { class: 'set-row' }, h('h2', { style: { fontSize: '16px' } }, 'Âm thanh')),
    toggle('Tự đọc chữ Hán khi lật thẻ', s().autoSpeak, (on) => store.setSettings({ autoSpeak: on })),
    toggle('Đọc thêm nghĩa tiếng Anh khi lật thẻ', s().autoSpeakEn, (on) => store.setSettings({ autoSpeakEn: on }), 'Nghe chữ Hán rồi nghe luôn nghĩa tiếng Anh'),
    row(
      'Tốc độ đọc tiếng Trung',
      voice ? null : 'Máy chưa có giọng tiếng Trung. Hãy cài giọng đọc tiếng Trung (Trung Quốc) trong cài đặt máy.',
      segmented(
        [
          [0.7, 'Chậm'],
          [0.9, 'Vừa'],
          [1.05, 'Nhanh'],
        ],
        s().rate,
        (v) => {
          store.setSettings({ rate: v });
          speak('你好，我们一起学习中文吧。', v);
        },
        'Tốc độ đọc tiếng Trung',
      ),
    ),
    row(
      'Giọng tiếng Anh',
      enVoice ? null : 'Máy chưa có giọng tiếng Anh. Hãy thêm giọng tiếng Anh trong cài đặt máy.',
      segmented(
        [
          ['en-US', 'Anh-Mỹ'],
          ['en-GB', 'Anh-Anh'],
        ],
        s().enAccent,
        (v) => {
          store.setSettings({ enAccent: v });
          setEnglishAccent(v);
          sayAs(store, "Hello! Let's learn Chinese together.", 'en');
        },
        'Giọng tiếng Anh',
      ),
    ),
    row(
      'Tốc độ đọc tiếng Anh',
      null,
      segmented(
        [
          [0.75, 'Chậm'],
          [0.95, 'Vừa'],
          [1.1, 'Nhanh'],
        ],
        s().enRate,
        (v) => {
          store.setSettings({ enRate: v });
          sayAs(store, 'Practice makes perfect.', 'en', { rate: v });
        },
        'Tốc độ đọc tiếng Anh',
      ),
    ),
  );

  const fileInput = h('input', { type: 'file', id: 'backup-file', accept: 'application/json,.json', class: 'sr-only', 'aria-hidden': 'true', tabindex: '-1' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      store.importJSON(await f.text());
      toast('Đã khôi phục tiến độ học');
      ctx.navigate('#/', { replace: true });
    } catch (e) {
      toast(e instanceof SyntaxError ? 'Tệp này không đọc được. Hãy chọn tệp .json đã xuất từ Hán Lộ.' : e.message);
    }
    fileInput.value = '';
  });

  const syncNote = h('small');
  const drawSync = (st) => {
    syncNote.textContent = SYNC_TEXT[st] || 'Tiến độ chỉ lưu trên trình duyệt này. Hãy xuất tệp để chuyển sang máy khác hoặc phòng khi xóa dữ liệu trình duyệt.';
  };
  drawSync(syncStatus());
  const offSync = onSyncStatus(drawSync);

  // xóa tiến độ: bấm lần đầu hiện ô xác nhận ngay trong trang
  const resetSlot = h('div', { class: 'set-row' });
  function drawReset(asking) {
    if (!asking) {
      resetSlot.replaceChildren(
        h('span', { class: 'set-label' }, h('span', null, 'Xóa tiến độ học'), h('small', null, 'Đưa tất cả thẻ về chưa học, giữ nguyên cài đặt và hội thoại bạn tự nhập')),
        button('Xóa', { icon: 'trash', variant: 'ghost', size: 'sm', onclick: () => drawReset(true) }),
      );
      return;
    }
    const cancel = button('Giữ lại', { variant: 'secondary', size: 'sm', onclick: () => drawReset(false) });
    resetSlot.replaceChildren(
      h('div', { class: 'confirm-box', role: 'alertdialog', 'aria-label': 'Xác nhận xóa tiến độ' },
        h('p', null, h('b', null, 'Xóa toàn bộ tiến độ học?'), h('br'), h('small', null, 'Không hoàn tác được, trừ khi bạn đã xuất tệp sao lưu.')),
        h('div', { class: 'confirm-actions' },
          cancel,
          button('Xóa hết', {
            icon: 'trash',
            variant: 'danger',
            size: 'sm',
            onclick: () => {
              store.reset();
              toast('Đã xóa tiến độ học');
              drawReset(false);
            },
          }),
        ),
      ),
    );
    cancel.focus();
  }
  drawReset(false);

  const backup = h(
    'section',
    { class: 'card settings-group section' },
    h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, h('h2', { style: { fontSize: '16px' } }, 'Sao lưu tiến độ'), syncNote)),
    h(
      'div',
      { class: 'set-row', style: { flexWrap: 'wrap', justifyContent: 'flex-start' } },
      button('Xuất tệp sao lưu', {
        icon: 'download',
        variant: 'secondary',
        size: 'sm',
        onclick: async () => {
          const result = await saveTextFile(`han-lo-sao-luu-${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON());
          if (result === 'failed') toast('Chưa lưu được tệp. Hãy thử lại.');
        },
      }),
      button('Nhập tệp sao lưu', { icon: 'upload', variant: 'secondary', size: 'sm', onclick: () => fileInput.click() }),
      fileInput,
    ),
    resetSlot,
  );

  const about = h(
    'section',
    { class: 'card section about' },
    h('h2', { style: { fontSize: '16px', marginBottom: '8px', color: 'var(--ink)' } }, 'Giới thiệu'),
    h('p', null, `Hán Lộ (汉路, trước đây là Tam Ngữ) giúp học tiếng Trung và tiếng Anh song ngữ: ${data().words.length} từ HSK ${levelsAvailable()[0]}–${levelsAvailable().at(-1)} (chuẩn HSK 2.0) với pinyin, âm Hán Việt, nghĩa tiếng Anh và tiếng Việt, câu ví dụ và bài khóa nghe được cả tiếng Trung lẫn tiếng Anh.`),
    h('p', null, 'Nguồn dữ liệu: danh sách từ HSK từ dự án complete-hsk-vocabulary (MIT); âm Hán Việt từ hanviet-pinyin-words (MIT) có hiệu đính; bộ thủ từ Make Me a Hanzi (LGPL); nét chữ từ hanzi-writer-data (Arphic Public License); bảng viết dùng thư viện Hanzi Writer (MIT). Nghĩa Việt, nghĩa Anh, câu ví dụ và hội thoại được biên soạn riêng cho app; hội thoại không lấy từ giáo trình nào.'),
  );

  const el = h(
    'div',
    { class: 'view' },
    h('header', { class: 'topbar' }, h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Về trang chủ' }, icon('back', 24)), h('h1', { class: 'grow' }, 'Cài đặt')),
    h('div', { class: 'grid-2' }, h('div', { class: 'col' }, study, display), h('div', { class: 'col' }, audio, backup, about)),
  );
  return { el, title: 'Cài đặt', destroy: offSync };
}
