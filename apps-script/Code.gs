/**
 * Hán Lộ 汉路 — máy chủ tài khoản cho lớp học, chạy trên Google Apps Script.
 *
 * Gắn vào một Google Sheet (Tiện ích mở rộng → Apps Script), triển khai thành ứng dụng web.
 * Cách cài đặt từng bước: xem HUONG-DAN.md cùng thư mục.
 *
 * Trong Sheet:
 *   - "Học viên": mỗi dòng một tài khoản. Giáo viên gõ tên đăng nhập và mật khẩu ban đầu,
 *     mật khẩu được mã hóa ngay và ô chỉ còn hiện ••••••.
 *   - "Tiến độ": tự cập nhật mỗi lần học viên đồng bộ.
 *   - "Cài đặt lớp": tên lớp, có cho học viên tự tạo tài khoản không.
 * Tiến độ chi tiết của mỗi học viên là một tệp JSON trong thư mục Drive "Hán Lộ – Dữ liệu".
 */

const SHEET_STUDENTS = 'Học viên';
const SHEET_PROGRESS = 'Tiến độ';
const SHEET_SETTINGS = 'Cài đặt lớp';
const FOLDER_NAME = 'Hán Lộ – Dữ liệu';
const HIDDEN = '••••••';

// cột của trang Học viên (đếm từ 1)
const COL = { user: 1, name: 2, pw: 3, level: 4, locked: 5, created: 6, last: 7, hash: 8, sessions: 9, file: 10 };
const NCOL = 10;
const STUDENT_HEADERS = ['Tên đăng nhập', 'Họ tên', 'Mật khẩu', 'Cấp HSK', 'Khóa', 'Ngày tạo', 'Lần học gần nhất', 'mã mật khẩu (đừng sửa)', 'phiên đăng nhập (đừng sửa)', 'tệp tiến độ (đừng sửa)'];
const PROGRESS_HEADERS = ['Tên đăng nhập', 'Họ tên', 'Thuộc HSK 3', 'Thuộc HSK 4', 'Thuộc HSK 5', 'Tổng từ đã thuộc', 'Chuỗi ngày', 'Phút học 7 ngày', 'Thẻ đã ôn', 'Trả lời đúng (30 ngày)', 'Bài khóa đã đọc', 'Chữ đã luyện viết', 'Lần học gần nhất'];

const MAX_SESSIONS = 8; // số máy đăng nhập cùng lúc cho mỗi tài khoản
const HASH_ROUNDS = 1000;
const MAX_FAILS = 5; // sai mật khẩu quá số lần này thì chờ 10 phút
const FAIL_WINDOW = 600;
const MAX_STATE = 3000000; // ký tự

// ---------------- menu trong Sheet ----------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Hán Lộ')
    .addItem('Cài đặt lần đầu', 'setup')
    .addItem('Đặt lại mật khẩu cho học viên đang chọn', 'resetPasswordMenu')
    .addItem('Cập nhật bảng tiến độ ngay', 'rebuildProgress')
    .addItem('Sao lưu tất cả tiến độ', 'backupAll')
    .addToUi();
}

/** Tạo các trang, tiêu đề, thư mục dữ liệu. Chạy lại bao nhiêu lần cũng được. */
function setup() {
  ensureSheets_();
  dataFolder_();
  try {
    SpreadsheetApp.getUi().alert('Hán Lộ đã sẵn sàng. Thêm học viên ở trang "Học viên": gõ tên đăng nhập, họ tên và mật khẩu ban đầu.');
  } catch (e) {
    // chạy từ trình soạn thảo, không có giao diện Sheet
  }
}

function resetPasswordMenu() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const r = sheet.getActiveRange().getRow();
  if (sheet.getName() !== SHEET_STUDENTS || r < 2) {
    ui.alert('Hãy chọn một ô trên dòng của học viên ở trang "Học viên" trước.');
    return;
  }
  const user = normUser_(sheet.getRange(r, COL.user).getValue());
  if (!user) {
    ui.alert('Dòng này chưa có tên đăng nhập.');
    return;
  }
  const res = ui.prompt('Đặt lại mật khẩu', `Mật khẩu mới cho "${user}" (ít nhất ${readSettings_().minPw} ký tự):`, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const pw = String(res.getResponseText() || '');
  if (pw.length < readSettings_().minPw) {
    ui.alert('Mật khẩu quá ngắn, chưa đổi.');
    return;
  }
  setPassword_(sheet, r, pw);
  ui.alert(`Đã đặt lại mật khẩu cho "${user}". Các máy đang đăng nhập tài khoản này sẽ phải đăng nhập lại.`);
}

/** Viết lại trang Tiến độ từ tệp tiến độ của từng học viên. */
function rebuildProgress() {
  const sheet = ensureSheets_().students;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const user = normUser_(rows[i][COL.user - 1]);
    const fileId = rows[i][COL.file - 1];
    if (!user || !fileId) continue;
    const doc = readDoc_(fileId);
    if (doc && doc.summary) writeProgress_(user, rows[i][COL.name - 1], doc.summary);
  }
}

/** Chép tệp tiến độ của mọi học viên sang thư mục "Sao lưu <ngày>". */
function backupAll() {
  const folder = dataFolder_();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm');
  const dest = folder.createFolder(`Sao lưu ${stamp}`);
  const rows = ensureSheets_().students.getDataRange().getValues();
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    const fileId = rows[i][COL.file - 1];
    if (!fileId) continue;
    DriveApp.getFileById(fileId).makeCopy(`${normUser_(rows[i][COL.user - 1])}.json`, dest);
    n += 1;
  }
  try {
    SpreadsheetApp.getUi().alert(`Đã sao lưu ${n} tệp vào thư mục "${dest.getName()}".`);
  } catch (e) {
    // chạy từ trình soạn thảo
  }
  return n;
}

/** Giáo viên gõ vào trang Học viên: mã hóa mật khẩu, chuẩn hóa tên đăng nhập, ghi ngày tạo. */
function onEdit(e) {
  const range = e && e.range;
  if (!range) return;
  const sheet = range.getSheet();
  if (sheet.getName() !== SHEET_STUDENTS) return;
  const first = range.getRow();
  for (let r = Math.max(2, first); r < first + range.getNumRows(); r++) processStudentRow_(sheet, r);
}

function processStudentRow_(sheet, r) {
  const row = sheet.getRange(r, 1, 1, NCOL).getValues()[0];
  const raw = String(row[COL.user - 1] || '');
  const pw = String(row[COL.pw - 1] || '');
  if (!raw && !pw) return;
  const userCell = sheet.getRange(r, COL.user);
  const user = normUser_(raw);
  if (raw && raw !== user) userCell.setValue(user);
  userCell.setNote(user && !validUser_(user) ? 'Tên đăng nhập cần 3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.' : '');
  if (user && !row[COL.created - 1]) sheet.getRange(r, COL.created).setValue(new Date());
  if (pw && pw !== HIDDEN) setPassword_(sheet, r, pw);
}

function setPassword_(sheet, r, pw) {
  sheet.getRange(r, COL.hash).setValue(makeHash_(pw));
  sheet.getRange(r, COL.pw).setValue(HIDDEN);
  // đổi mật khẩu thì mọi máy đang đăng nhập phải đăng nhập lại
  sheet.getRange(r, COL.sessions).setValue('[]');
}

// ---------------- ứng dụng web ----------------

function doGet() {
  return json_(handle_({ action: 'info' }));
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  return json_(handle_(req));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

const ACTIONS = {
  info: apiInfo_,
  signup: apiSignup_,
  login: apiLogin_,
  pull: apiPull_,
  push: apiPush_,
  password: apiPassword_,
  logout: apiLogout_,
};

function handle_(req) {
  const fn = ACTIONS[req && req.action];
  if (!fn) return { ok: false, error: 'bad_request' };
  try {
    return fn(req);
  } catch (err) {
    if (err && err.code) return Object.assign({ ok: false, error: err.code }, err.data || {});
    console.error(err);
    return { ok: false, error: 'server', message: String((err && err.message) || err) };
  }
}

function fail_(code, data) {
  const e = new Error(code);
  e.code = code;
  e.data = data;
  throw e;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function apiInfo_() {
  ensureSheets_();
  const s = readSettings_();
  return { ok: true, className: s.className, allowSignup: s.allowSignup, minPw: s.minPw };
}

function apiSignup_(req) {
  const s = readSettings_();
  if (!s.allowSignup) fail_('no_signup');
  const user = normUser_(req.username);
  if (!validUser_(user)) fail_('invalid_username');
  const pw = String(req.password || '');
  if (pw.length < s.minPw) fail_('weak_password', { minPw: s.minPw });
  const name = String(req.name || '').trim().slice(0, 60) || user;
  return withLock_(() => {
    const sheet = ensureSheets_().students;
    if (findRow_(sheet, user)) fail_('taken');
    const row = [];
    row[COL.user - 1] = user;
    row[COL.name - 1] = name;
    row[COL.pw - 1] = HIDDEN;
    row[COL.level - 1] = '';
    row[COL.locked - 1] = false;
    row[COL.created - 1] = new Date();
    row[COL.last - 1] = '';
    row[COL.hash - 1] = makeHash_(pw);
    row[COL.sessions - 1] = '[]';
    row[COL.file - 1] = '';
    // cột Khóa có sẵn ô đánh dấu (giá trị FALSE) nên không dùng appendRow: tìm dòng trống đầu tiên
    sheet.getRange(firstEmptyRow_(sheet), 1, 1, NCOL).setValues([row]);
    const found = findRow_(sheet, user);
    return session_(sheet, found, req.device);
  });
}

function apiLogin_(req) {
  const user = normUser_(req.username);
  const cache = CacheService.getScriptCache();
  const failKey = `fail:${user}`;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS) fail_('throttled');
  return withLock_(() => {
    const sheet = ensureSheets_().students;
    const found = user ? findRow_(sheet, user) : null;
    const hash = found && found.values[COL.hash - 1];
    if (!found || !hash || !checkHash_(String(req.password || ''), hash)) {
      cache.put(failKey, String(fails + 1), FAIL_WINDOW);
      fail_('bad_login');
    }
    if (isLocked_(found.values)) fail_('locked');
    cache.remove(failKey);
    return session_(sheet, found, req.device);
  });
}

/** Tạo phiên đăng nhập mới cho một máy. */
function session_(sheet, found, device) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const list = readSessions_(found.values).filter((x) => x && x.h);
  list.push({ h: sha_(token), d: String(device || '').slice(0, 60), t: Date.now() });
  while (list.length > MAX_SESSIONS) list.shift();
  sheet.getRange(found.row, COL.sessions).setValue(JSON.stringify(list));
  return { ok: true, token, user: normUser_(found.values[COL.user - 1]), name: String(found.values[COL.name - 1] || ''), levels: parseLevels_(found.values[COL.level - 1]) };
}

/** Kiểm tra tên đăng nhập + mã phiên. Trả về dòng của học viên. */
function auth_(sheet, req) {
  const user = normUser_(req.user);
  const found = user ? findRow_(sheet, user) : null;
  if (!found || !req.token) fail_('bad_token');
  if (isLocked_(found.values)) fail_('locked');
  const h = sha_(String(req.token));
  if (!readSessions_(found.values).some((x) => x && safeEq_(x.h, h))) fail_('bad_token');
  return found;
}

function apiPull_(req) {
  const sheet = ensureSheets_().students;
  const found = auth_(sheet, req);
  const doc = readDoc_(found.values[COL.file - 1]);
  return {
    ok: true,
    updated: doc ? doc.updated : 0,
    state: doc ? doc.state : null,
    name: String(found.values[COL.name - 1] || ''),
    levels: parseLevels_(found.values[COL.level - 1]),
  };
}

/**
 * Lưu tiến độ. base là mốc "updated" máy học viên đã thấy lần trước:
 * nếu máy khác vừa lưu (mốc trên máy chủ khác base) thì trả về "conflict" kèm bản mới nhất để máy gộp rồi gửi lại.
 */
function apiPush_(req) {
  const state = req.state;
  if (!state || typeof state !== 'object') fail_('bad_request');
  const text = JSON.stringify(state);
  if (text.length > MAX_STATE) fail_('too_large');
  return withLock_(() => {
    const sheet = ensureSheets_().students;
    const found = auth_(sheet, req);
    const fileId = found.values[COL.file - 1];
    const cur = readDoc_(fileId);
    const base = Number(req.base) || 0;
    if (cur && cur.updated && cur.updated !== base) fail_('conflict', { updated: cur.updated, state: cur.state });
    const updated = Math.max(Date.now(), (cur && cur.updated + 1) || 0);
    const summary = cleanSummary_(req.summary);
    const body = JSON.stringify({ v: 1, user: normUser_(found.values[COL.user - 1]), updated, summary, state });
    if (fileId) {
      DriveApp.getFileById(fileId).setContent(body);
    } else {
      const file = dataFolder_().createFile(`${normUser_(found.values[COL.user - 1])}.json`, body, MimeType.PLAIN_TEXT);
      sheet.getRange(found.row, COL.file).setValue(file.getId());
    }
    if (summary) {
      if (summary.last) sheet.getRange(found.row, COL.last).setValue(new Date(summary.last));
      writeProgress_(normUser_(found.values[COL.user - 1]), found.values[COL.name - 1], summary);
    }
    return { ok: true, updated };
  });
}

function apiPassword_(req) {
  const s = readSettings_();
  const pw = String(req.password || '');
  if (pw.length < s.minPw) fail_('weak_password', { minPw: s.minPw });
  return withLock_(() => {
    const sheet = ensureSheets_().students;
    const found = auth_(sheet, req);
    if (!checkHash_(String(req.old || ''), found.values[COL.hash - 1])) fail_('bad_login');
    sheet.getRange(found.row, COL.hash).setValue(makeHash_(pw));
    // giữ máy đang đổi mật khẩu, các máy khác phải đăng nhập lại
    const h = sha_(String(req.token));
    sheet.getRange(found.row, COL.sessions).setValue(JSON.stringify(readSessions_(found.values).filter((x) => x && x.h === h)));
    return { ok: true };
  });
}

function apiLogout_(req) {
  return withLock_(() => {
    const sheet = ensureSheets_().students;
    const found = auth_(sheet, req);
    const h = sha_(String(req.token));
    sheet.getRange(found.row, COL.sessions).setValue(JSON.stringify(readSessions_(found.values).filter((x) => x && x.h !== h)));
    return { ok: true };
  });
}

// ---------------- dữ liệu ----------------

function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let students = ss.getSheetByName(SHEET_STUDENTS);
  if (!students) {
    students = ss.insertSheet(SHEET_STUDENTS);
    students.getRange(1, 1, 1, NCOL).setValues([STUDENT_HEADERS]).setFontWeight('bold');
    students.setFrozenRows(1);
    students.getRange(2, COL.locked, 499, 1).insertCheckboxes();
    students.getRange(2, COL.created, 499, 2).setNumberFormat('dd/mm/yyyy hh:mm');
    students.hideColumns(COL.hash, 3);
  }
  let progress = ss.getSheetByName(SHEET_PROGRESS);
  if (!progress) {
    progress = ss.insertSheet(SHEET_PROGRESS);
    progress.getRange(1, 1, 1, PROGRESS_HEADERS.length).setValues([PROGRESS_HEADERS]).setFontWeight('bold');
    progress.setFrozenRows(1);
    progress.getRange(2, 10, 499, 1).setNumberFormat('0%');
    progress.getRange(2, 13, 499, 1).setNumberFormat('dd/mm/yyyy hh:mm');
    // tô cam học viên quá 3 ngày chưa học (bỏ qua nếu Sheet không nhận công thức, bảng vẫn dùng được)
    try {
      const rule = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND($A2<>"", OR($M2="", NOW()-$M2>3))')
        .setBackground('#fde7c8')
        .setRanges([progress.getRange(2, 1, 499, PROGRESS_HEADERS.length)])
        .build();
      progress.setConditionalFormatRules([rule]);
    } catch (e) {
      console.warn('Không tạo được tô màu cho trang Tiến độ', e);
    }
  }
  let settings = ss.getSheetByName(SHEET_SETTINGS);
  if (!settings) {
    settings = ss.insertSheet(SHEET_SETTINGS);
    settings.getRange(1, 1, 4, 2).setValues([
      ['Cài đặt', 'Giá trị'],
      ['Tên lớp', 'Lớp tiếng Trung'],
      ['Cho phép học viên tự tạo tài khoản', false],
      ['Mật khẩu tối thiểu (ký tự)', 6],
    ]);
    settings.getRange(1, 1, 1, 2).setFontWeight('bold');
    settings.getRange(3, 2).insertCheckboxes();
  }
  return { students, progress, settings };
}

function readSettings_() {
  const v = ensureSheets_().settings.getRange(1, 1, 4, 2).getValues();
  return {
    className: String(v[1][1] || '').trim(),
    allowSignup: v[2][1] === true || String(v[2][1]).toUpperCase() === 'TRUE',
    minPw: Math.max(4, Number(v[3][1]) || 6),
  };
}

function dataFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('folderId');
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      // thư mục đã bị xóa: tạo lại
    }
  }
  const folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('folderId', folder.getId());
  return folder;
}

function readDoc_(fileId) {
  if (!fileId) return null;
  try {
    return JSON.parse(DriveApp.getFileById(fileId).getBlob().getDataAsString());
  } catch (e) {
    return null;
  }
}

function findRow_(sheet, user) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (normUser_(values[i][COL.user - 1]) === user) {
      const row = values[i].slice(0, NCOL);
      while (row.length < NCOL) row.push('');
      return { row: i + 1, values: row };
    }
  }
  return null;
}

function firstEmptyRow_(sheet) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (!values[i][COL.user - 1] && !values[i][COL.hash - 1] && !values[i][COL.name - 1]) return i + 1;
  }
  return values.length + 1;
}

function writeProgress_(user, name, s) {
  const sheet = ensureSheets_().progress;
  const learned = s.learned || {};
  const total = Object.keys(learned).reduce((n, k) => n + (Number(learned[k]) || 0), 0);
  const row = [user, String(name || ''), learned[3] || 0, learned[4] || 0, learned[5] || 0, total, s.streak || 0, s.min7 || 0, s.reviews || 0, s.acc === null || s.acc === undefined ? '' : s.acc / 100, s.dialogues || 0, s.chars || 0, s.last ? new Date(s.last) : ''];
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === user) {
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return;
    }
  }
  sheet.appendRow(row);
}

function cleanSummary_(s) {
  if (!s || typeof s !== 'object') return null;
  const n = (x) => (Number.isFinite(Number(x)) ? Math.max(0, Math.round(Number(x))) : 0);
  const learned = {};
  for (const k of Object.keys(s.learned || {})) if (/^\d$/.test(k)) learned[k] = n(s.learned[k]);
  return {
    learned,
    streak: n(s.streak),
    min7: n(s.min7),
    reviews: n(s.reviews),
    acc: s.acc === null || s.acc === undefined ? null : Math.min(100, n(s.acc)),
    dialogues: n(s.dialogues),
    chars: n(s.chars),
    last: n(s.last) || null,
  };
}

function readSessions_(values) {
  try {
    const list = JSON.parse(values[COL.sessions - 1] || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function isLocked_(values) {
  const v = values[COL.locked - 1];
  return v === true || String(v).toUpperCase() === 'TRUE';
}

/** "4" → [4]; "4, 5" → [4, 5]; trống → null (học viên tự chọn). */
function parseLevels_(v) {
  const list = String(v === undefined || v === null ? '' : v)
    .split(/[^0-9]+/)
    .map(Number)
    .filter((x) => x >= 1 && x <= 9);
  return list.length ? list.filter((x, i) => list.indexOf(x) === i).sort() : null;
}

function normUser_(u) {
  return String(u === undefined || u === null ? '' : u).trim().toLowerCase();
}

function validUser_(u) {
  return /^[a-z0-9._-]{3,30}$/.test(u);
}

// ---------------- mật khẩu ----------------

function hex_(bytes) {
  return bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function sha_(text) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

function hash_(pw, salt, rounds) {
  let h = `${salt}:${pw}`;
  for (let i = 0; i < rounds; i++) h = sha_(h + salt);
  return h;
}

function makeHash_(pw) {
  const salt = Utilities.getUuid().replace(/-/g, '');
  return ['v1', HASH_ROUNDS, salt, hash_(pw, salt, HASH_ROUNDS)].join('$');
}

function checkHash_(pw, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  return safeEq_(hash_(pw, parts[2], Number(parts[1]) || HASH_ROUNDS), parts[3]);
}

function safeEq_(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
