// Giả lập các dịch vụ Google (Sheet, Drive, Utilities…) đủ để chạy apps-script/Code.gs trong Node,
// dùng cho kiểm thử máy chủ tài khoản và kiểm thử app trên trình duyệt (thay cho link Apps Script thật).
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.data = [];
    this.notes = {};
  }
  getName() {
    return this.name;
  }
  cell(r, c) {
    return this.data[r - 1]?.[c - 1] ?? '';
  }
  set(r, c, v) {
    while (this.data.length < r) this.data.push([]);
    const row = this.data[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v;
  }
  getLastRow() {
    for (let r = this.data.length; r > 0; r--) if (this.data[r - 1].some((v) => v !== '' && v !== null && v !== undefined)) return r;
    return 0;
  }
  getLastColumn() {
    return Math.max(0, ...this.data.map((row) => row.length));
  }
  getRange(r, c, nr = 1, nc = 1) {
    return new FakeRange(this, r, c, nr, nc);
  }
  getDataRange() {
    return new FakeRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
  appendRow(values) {
    const r = this.getLastRow() + 1;
    values.forEach((v, i) => this.set(r, i + 1, v));
  }
  setFrozenRows() {}
  hideColumns() {}
  setConditionalFormatRules(rules) {
    this.rules = rules;
  }
  getActiveRange() {
    return this.active || this.getRange(1, 1);
  }
}

class FakeRange {
  constructor(sheet, r, c, nr, nc) {
    Object.assign(this, { sheet, r, c, nr, nc });
  }
  getSheet() {
    return this.sheet;
  }
  getRow() {
    return this.r;
  }
  getColumn() {
    return this.c;
  }
  getNumRows() {
    return this.nr;
  }
  getValues() {
    return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.sheet.cell(this.r + i, this.c + j)));
  }
  getValue() {
    return this.sheet.cell(this.r, this.c);
  }
  setValues(rows) {
    rows.forEach((row, i) => row.forEach((v, j) => this.sheet.set(this.r + i, this.c + j, v === undefined ? '' : v)));
    return this;
  }
  setValue(v) {
    this.sheet.set(this.r, this.c, v);
    return this;
  }
  setNote(note) {
    this.sheet.notes[`${this.r},${this.c}`] = note;
    return this;
  }
  insertCheckboxes() {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (this.sheet.cell(this.r + i, this.c + j) === '') this.sheet.set(this.r + i, this.c + j, false);
    return this;
  }
  setFontWeight() {
    return this;
  }
  setNumberFormat() {
    return this;
  }
}

class FakeFile {
  constructor(id, name, content) {
    Object.assign(this, { id, name, content });
  }
  getId() {
    return this.id;
  }
  getName() {
    return this.name;
  }
  getBlob() {
    return { getDataAsString: () => this.content };
  }
  setContent(s) {
    this.content = s;
    return this;
  }
}

/** Một "Sheet + Drive" giả. Mỗi lần gọi là một lớp học mới, dữ liệu trống. */
export function createBackend({ tz = 'Asia/Ho_Chi_Minh' } = {}) {
  const sheets = new Map();
  const files = new Map();
  const folders = new Map();
  const props = new Map();
  const cache = new Map();
  const alerts = [];
  let nextId = 1;
  let promptAnswer = null;
  let activeSheet = null;

  function makeFolder(name) {
    const id = `folder${nextId++}`;
    const folder = {
      id,
      name,
      getId: () => id,
      getName: () => name,
      createFile(fname, content) {
        const f = new FakeFile(`file${nextId++}`, fname, content);
        f.folder = id;
        files.set(f.id, f);
        return f;
      },
      createFolder: (n) => makeFolder(n),
    };
    folders.set(id, folder);
    return folder;
  }

  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet(n) {
      const s = new FakeSheet(n);
      sheets.set(n, s);
      return s;
    },
  };
  const ruleBuilder = () => {
    const b = { whenFormulaSatisfied: () => b, setBackground: () => b, setRanges: () => b, build: () => ({}) };
    return b;
  };
  const ui = {
    ButtonSet: { OK_CANCEL: 'OK_CANCEL' },
    Button: { OK: 'OK', CANCEL: 'CANCEL' },
    alert: (m) => alerts.push(m),
    prompt: () => ({ getSelectedButton: () => (promptAnswer === null ? 'CANCEL' : 'OK'), getResponseText: () => promptAnswer }),
    createMenu() {
      const m = { addItem: () => m, addToUi: () => m };
      return m;
    },
  };

  const g = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      getActiveSheet: () => activeSheet,
      getUi: () => ui,
      newConditionalFormatRule: ruleBuilder,
    },
    DriveApp: {
      createFolder: makeFolder,
      getFolderById(id) {
        if (!folders.has(id)) throw new Error('No item with the given ID could be found');
        return folders.get(id);
      },
      getFileById(id) {
        if (!files.has(id)) throw new Error('No item with the given ID could be found');
        const f = files.get(id);
        f.makeCopy = (name, dest) => dest.createFile(name, f.content);
        return f;
      },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => [...createHash('sha256').update(String(text), 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      getUuid: () => randomUUID(),
      formatDate: (d) => d.toISOString().slice(0, 16).replace('T', ' ').replace(':', '.'),
    },
    Session: { getScriptTimeZone: () => tz },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cache.has(k) ? cache.get(k) : null),
        put: (k, v) => cache.set(k, v),
        remove: (k) => cache.delete(k),
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, v) }),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => ({ setMimeType() { return this; }, getContent: () => text }),
    },
    MimeType: { PLAIN_TEXT: 'text/plain' },
  };
  vm.createContext(g);
  vm.runInContext(CODE, g, { filename: 'Code.gs' });

  return {
    sheets,
    files,
    alerts,
    /** Gọi ứng dụng web như app gọi: trả về đối tượng JSON. */
    post(body) {
      return JSON.parse(g.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
    },
    get() {
      return JSON.parse(g.doGet({}).getContent());
    },
    run(name) {
      return g[name]();
    },
    /** Giáo viên gõ vào một ô của Sheet (kích hoạt onEdit như thật). */
    edit(sheetName, r, c, value) {
      const sheet = sheets.get(sheetName);
      sheet.set(r, c, value);
      g.onEdit({ range: sheet.getRange(r, c), value, source: ss });
    },
    /** Giáo viên thêm một học viên: gõ tên, họ tên, mật khẩu, cấp. */
    addStudent(user, name, password, level = '') {
      const sheet = sheets.get('Học viên');
      let r = 2;
      while (sheet.cell(r, 1) || sheet.cell(r, 8)) r += 1;
      this.edit('Học viên', r, 1, user);
      this.edit('Học viên', r, 2, name);
      if (level !== '') this.edit('Học viên', r, 4, level);
      this.edit('Học viên', r, 3, password);
      return r;
    },
    setCell(sheetName, r, c, value) {
      sheets.get(sheetName).set(r, c, value);
    },
    cell(sheetName, r, c) {
      return sheets.get(sheetName).cell(r, c);
    },
    rowOf(sheetName, user) {
      const s = sheets.get(sheetName);
      for (let r = 2; r <= s.getLastRow(); r++) if (s.cell(r, 1) === user) return r;
      return 0;
    },
    /** Chọn một ô rồi bấm menu (ví dụ Đặt lại mật khẩu), trả lời hộp hỏi bằng answer. */
    menu(name, { sheet = 'Học viên', row = 2, answer = null } = {}) {
      activeSheet = sheets.get(sheet);
      activeSheet.active = activeSheet.getRange(row, 1);
      promptAnswer = answer;
      return g[name]();
    },
  };
}
