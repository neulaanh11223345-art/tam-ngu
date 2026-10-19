// Kiểm thử máy chủ tài khoản (apps-script/Code.gs) trên Sheet và Drive giả lập.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBackend } from './gas-fake.mjs';

function classroom() {
  const b = createBackend();
  b.run('setup');
  return b;
}

// ngày tạo trong máy chủ giả (vm) không cùng lớp Date với Node
const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]';
const summary = { learned: { 3: 10, 4: 2 }, streak: 3, min7: 42, reviews: 120, acc: 87, dialogues: 2, chars: 15, last: Date.UTC(2026, 9, 18, 3) };

test('cài đặt lần đầu tạo đủ ba trang và thư mục dữ liệu', () => {
  const b = classroom();
  assert.deepEqual([...b.sheets.keys()], ['Học viên', 'Tiến độ', 'Cài đặt lớp']);
  assert.equal(b.cell('Học viên', 1, 1), 'Tên đăng nhập');
  assert.equal(b.cell('Học viên', 2, 5), false, 'cột Khóa có sẵn ô đánh dấu');
  const info = b.get();
  assert.deepEqual(info, { ok: true, className: 'Lớp tiếng Trung', allowSignup: false, minPw: 6 });
});

test('giáo viên gõ mật khẩu: được mã hóa ngay, tên đăng nhập viết thường, có ngày tạo', () => {
  const b = classroom();
  const r = b.addStudent('  An.Nguyen ', 'Nguyễn An', 'matkhau1', 4);
  assert.equal(b.cell('Học viên', r, 1), 'an.nguyen');
  assert.equal(b.cell('Học viên', r, 3), '••••••');
  assert.match(b.cell('Học viên', r, 8), /^v1\$1000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.ok(isDate(b.cell('Học viên', r, 6)));
  assert.ok(!JSON.stringify([...b.sheets.get('Học viên').data]).includes('matkhau1'), 'mật khẩu gốc còn trong Sheet');
});

test('đăng nhập đúng nhận mã phiên và cấp HSK; sai thì bị từ chối, sai 5 lần phải chờ', () => {
  const b = classroom();
  b.addStudent('lan', 'Trần Lan', 'hoctiengtrung', '4, 5');
  const ok = b.post({ action: 'login', username: 'LAN', password: 'hoctiengtrung', device: 'iPhone' });
  assert.equal(ok.ok, true);
  assert.equal(ok.user, 'lan');
  assert.equal(ok.name, 'Trần Lan');
  assert.deepEqual(ok.levels, [4, 5]);
  assert.match(ok.token, /^[0-9a-f]{64}$/);
  assert.ok(!b.cell('Học viên', 2, 9).includes(ok.token), 'mã phiên lưu nguyên văn trong Sheet');
  assert.equal(b.post({ action: 'login', username: 'lan', password: 'sai' }).error, 'bad_login');
  assert.equal(b.post({ action: 'login', username: 'khongco', password: 'x' }).error, 'bad_login');
  for (let i = 0; i < 4; i++) b.post({ action: 'login', username: 'lan', password: 'sai' });
  assert.equal(b.post({ action: 'login', username: 'lan', password: 'hoctiengtrung' }).error, 'throttled');
});

test('lưu và lấy tiến độ; máy khác vừa lưu thì báo conflict kèm bản mới nhất', () => {
  const b = classroom();
  b.addStudent('minh', 'Lê Minh', 'abcdef12');
  const a = b.post({ action: 'login', username: 'minh', password: 'abcdef12', device: 'A' });
  const c = b.post({ action: 'login', username: 'minh', password: 'abcdef12', device: 'B' });
  const auth = (s) => ({ user: 'minh', token: s.token });
  const empty = b.post({ action: 'pull', ...auth(a) });
  assert.equal(empty.ok, true);
  assert.equal(empty.state, null);
  assert.equal(empty.updated, 0);
  const p1 = b.post({ action: 'push', ...auth(a), base: 0, state: { cards: { x: 1 } }, summary });
  assert.equal(p1.ok, true);
  assert.ok(p1.updated > 0);
  // máy B chưa thấy bản của A: bị báo conflict, nhận bản của A
  const p2 = b.post({ action: 'push', ...auth(c), base: 0, state: { cards: { y: 1 } } });
  assert.equal(p2.error, 'conflict');
  assert.deepEqual(p2.state, { cards: { x: 1 } });
  assert.equal(p2.updated, p1.updated);
  const p3 = b.post({ action: 'push', ...auth(c), base: p2.updated, state: { cards: { x: 1, y: 1 } } });
  assert.equal(p3.ok, true);
  const pulled = b.post({ action: 'pull', ...auth(a) });
  assert.deepEqual(pulled.state, { cards: { x: 1, y: 1 } });
  assert.equal(pulled.updated, p3.updated);
  // bảng tiến độ có dòng của học viên
  const r = b.rowOf('Tiến độ', 'minh');
  assert.ok(r > 1);
  assert.deepEqual(b.sheets.get('Tiến độ').data[r - 1].slice(0, 12), ['minh', 'Lê Minh', 10, 2, 0, 12, 3, 42, 120, 0.87, 2, 15]);
  assert.ok(isDate(b.cell('Học viên', 2, 7)), 'chưa ghi lần học gần nhất');
});

test('mã phiên sai, tài khoản bị khóa, đặt lại mật khẩu đều chặn máy đang đăng nhập', () => {
  const b = classroom();
  const r = b.addStudent('hoa', 'Phạm Hoa', 'hoa12345');
  const s = b.post({ action: 'login', username: 'hoa', password: 'hoa12345' });
  assert.equal(b.post({ action: 'pull', user: 'hoa', token: 'x'.repeat(64) }).error, 'bad_token');
  b.setCell('Học viên', r, 5, true);
  assert.equal(b.post({ action: 'pull', user: 'hoa', token: s.token }).error, 'locked');
  assert.equal(b.post({ action: 'login', username: 'hoa', password: 'hoa12345' }).error, 'locked');
  b.setCell('Học viên', r, 5, false);
  assert.equal(b.post({ action: 'pull', user: 'hoa', token: s.token }).ok, true);
  b.menu('resetPasswordMenu', { row: r, answer: 'moi123456' });
  assert.match(b.alerts.at(-1), /Đã đặt lại mật khẩu/);
  assert.equal(b.post({ action: 'pull', user: 'hoa', token: s.token }).error, 'bad_token');
  assert.equal(b.post({ action: 'login', username: 'hoa', password: 'moi123456' }).ok, true);
});

test('học viên đổi mật khẩu: máy khác phải đăng nhập lại, máy đang dùng thì không', () => {
  const b = classroom();
  b.addStudent('tuan', 'Đỗ Tuấn', 'tuan1234');
  const a = b.post({ action: 'login', username: 'tuan', password: 'tuan1234' });
  const c = b.post({ action: 'login', username: 'tuan', password: 'tuan1234' });
  assert.equal(b.post({ action: 'password', user: 'tuan', token: a.token, old: 'sai', password: 'moimoimoi' }).error, 'bad_login');
  assert.equal(b.post({ action: 'password', user: 'tuan', token: a.token, old: 'tuan1234', password: '123' }).error, 'weak_password');
  assert.equal(b.post({ action: 'password', user: 'tuan', token: a.token, old: 'tuan1234', password: 'moimoimoi' }).ok, true);
  assert.equal(b.post({ action: 'pull', user: 'tuan', token: a.token }).ok, true);
  assert.equal(b.post({ action: 'pull', user: 'tuan', token: c.token }).error, 'bad_token');
  assert.equal(b.post({ action: 'logout', user: 'tuan', token: a.token }).ok, true);
  assert.equal(b.post({ action: 'pull', user: 'tuan', token: a.token }).error, 'bad_token');
});

test('tự tạo tài khoản chỉ khi giáo viên cho phép; tên trùng hoặc sai dạng bị từ chối', () => {
  const b = classroom();
  assert.equal(b.post({ action: 'signup', username: 'mai', password: 'mai12345', name: 'Mai' }).error, 'no_signup');
  b.setCell('Cài đặt lớp', 3, 2, true);
  assert.equal(b.get().allowSignup, true);
  const s = b.post({ action: 'signup', username: 'Mai', password: 'mai12345', name: 'Vũ Mai' });
  assert.equal(s.ok, true);
  assert.equal(s.user, 'mai');
  assert.equal(b.rowOf('Học viên', 'mai'), 2, 'tài khoản tự tạo phải nằm ở dòng trống đầu tiên');
  assert.equal(b.cell('Học viên', 2, 3), '••••••');
  assert.equal(b.post({ action: 'signup', username: 'mai', password: 'mai12345' }).error, 'taken');
  assert.equal(b.post({ action: 'signup', username: 'a b', password: 'mai12345' }).error, 'invalid_username');
  assert.equal(b.post({ action: 'signup', username: 'binh', password: '123' }).error, 'weak_password');
  assert.equal(b.post({ action: 'login', username: 'mai', password: 'mai12345' }).ok, true);
});

test('menu: cập nhật bảng tiến độ và sao lưu tất cả', () => {
  const b = classroom();
  b.addStudent('an', 'An', 'an123456');
  const s = b.post({ action: 'login', username: 'an', password: 'an123456' });
  b.post({ action: 'push', user: 'an', token: s.token, base: 0, state: { a: 1 }, summary });
  b.sheets.get('Tiến độ').data.length = 1;
  b.run('rebuildProgress');
  assert.equal(b.rowOf('Tiến độ', 'an'), 2);
  const before = b.files.size;
  assert.equal(b.run('backupAll'), 1);
  assert.equal(b.files.size, before + 1);
});

test('yêu cầu lạ hoặc hỏng không làm máy chủ lỗi', () => {
  const b = classroom();
  assert.equal(b.post({ action: 'xoa_het' }).error, 'bad_request');
  assert.equal(b.post({ action: 'push', user: 'ai', token: 'x', state: 'abc' }).error, 'bad_request');
  assert.equal(b.post({ action: 'pull' }).error, 'bad_token');
});
