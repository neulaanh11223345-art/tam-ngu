// Màn đăng nhập tài khoản lớp học: chọn tài khoản đã lưu trên máy, nhập PIN, đăng nhập, tạo tài khoản, học như khách.
import { cachedClassInfo, continueAsGuest, currentAccount, errorText, fetchClassInfo, gateState, guestProgress, loadRegistry, markUnlocked, pinHash, restartApp, signIn, switchTo } from '../accounts.js';
import { brandSeal, button, h, icon, motto } from '../dom.js';
import { accountSeal } from './common.js';

/**
 * Bàn phím PIN 4 số. onComplete(pin) trả về true nếu đúng; sai thì rung, xóa và hiện lỗi.
 */
export function pinPad({ title, sub, onComplete, wrongText = 'Mã PIN chưa đúng.' }) {
  let pin = '';
  let busy = false;
  const dots = h('div', { class: 'pin-dots', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i')));
  const live = h('p', { class: 'pin-msg', role: 'status', 'aria-live': 'polite' }, sub || '');
  const draw = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < pin.length));
  async function press(k) {
    if (busy) return;
    if (k === 'del') pin = pin.slice(0, -1);
    else if (pin.length < 4) pin += k;
    draw();
    if (pin.length < 4) return;
    busy = true;
    const ok = await onComplete(pin);
    busy = false;
    if (ok) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    live.textContent = typeof ok === 'string' ? ok : wrongText;
    pin = '';
    draw();
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  const el = h(
    'div',
    { class: 'pin-pad' },
    title ? h('h2', { class: 'pin-title' }, title) : null,
    dots,
    live,
    h(
      'div',
      { class: 'pin-keys' },
      keys.map((k) =>
        k === ''
          ? h('span')
          : h('button', { type: 'button', class: `pin-key ${k === 'del' ? 'del' : ''}`.trim(), 'aria-label': k === 'del' ? 'Xóa số vừa nhập' : k, onclick: () => press(k) }, k === 'del' ? icon('back', 22) : k),
      ),
    ),
  );
  el.addEventListener('keydown', (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
  });
  el.tabIndex = -1;
  return el;
}

export function render(ctx) {
  const { query } = ctx;
  const reg = loadRegistry();
  const gate = gateState();
  const info = cachedClassInfo() || {};
  const className = h('p', { class: 'login-class' }, info.className || '');
  const panel = h('div', { class: 'login-panel' });

  const head = h('header', { class: 'login-head' }, brandSeal('seal-lg'), h('h1', null, 'Hán Lộ'), className, motto());

  fetchClassInfo()
    .then((x) => {
      className.textContent = x.className;
      Object.assign(info, x);
      if (mode === 'login') drawLogin(lastUser);
    })
    .catch(() => {});

  let mode = 'list';
  let lastUser = '';

  // ---------- tài khoản đã lưu trên máy ----------
  function drawList() {
    mode = 'list';
    const r = loadRegistry();
    panel.replaceChildren(
      h('h2', { class: 'login-sub' }, 'Chọn tài khoản'),
      h(
        'div',
        { class: 'acc-list' },
        r.list.map((a) =>
          h(
            'button',
            { type: 'button', class: 'acc-pick', onclick: () => pick(a) },
            accountSeal(a),
            h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, a.name), h('span', { class: 'row-sub' }, `@${a.user}${a.token ? '' : ' · cần đăng nhập lại'}${a.pin ? ' · có PIN' : ''}`)),
            icon('chevron', 18),
          ),
        ),
      ),
      button('Thêm tài khoản', { icon: 'user', variant: 'secondary', cls: 'btn-block', onclick: () => drawLogin() }),
    );
  }

  function pick(a) {
    if (!a.token) {
      drawLogin(a.user, 'Phiên đăng nhập đã hết hạn. Hãy nhập lại mật khẩu.');
      return;
    }
    if (a.pin) {
      drawPin(a);
      return;
    }
    enter(a.user);
  }

  function enter(user) {
    markUnlocked(user);
    const cur = currentAccount();
    if (cur && cur.user === user && ctx.account && ctx.account.user === user && !gate) {
      ctx.navigate('#/');
      return;
    }
    switchTo(user);
    restartApp();
  }

  // ---------- PIN ----------
  function drawPin(a) {
    mode = 'pin';
    const pad = pinPad({
      title: `Xin chào, ${a.name}`,
      sub: 'Nhập mã PIN 4 số',
      onComplete: async (pin) => {
        if ((await pinHash(a.user, pin)) !== a.pin) return false;
        enter(a.user);
        return true;
      },
    });
    panel.replaceChildren(
      h('div', { class: 'pin-who' }, accountSeal(a, 'seal-lg')),
      pad,
      h('div', { class: 'login-links' }, h('button', { type: 'button', class: 'link-btn', onclick: () => drawLogin(a.user, 'Đăng nhập bằng mật khẩu để vào lại tài khoản.') }, 'Quên PIN? Đăng nhập bằng mật khẩu'), loadRegistry().list.length > 1 ? h('button', { type: 'button', class: 'link-btn', onclick: drawList }, 'Tài khoản khác') : null),
    );
    pad.focus({ preventScroll: true });
  }

  // ---------- đăng nhập / tạo tài khoản ----------
  function field(id, label, attrs = {}) {
    const input = h('input', { id, class: 'field', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', ...attrs });
    return { input, el: h('label', { class: 'login-field', for: id }, h('span', null, label), input) };
  }

  function passwordField(id, label, autocomplete) {
    const f = field(id, label, { type: 'password', autocomplete });
    const eye = h('button', { type: 'button', class: 'icon-btn eye-btn', 'aria-label': 'Hiện mật khẩu', 'aria-pressed': 'false' }, icon('eye', 20));
    eye.addEventListener('click', () => {
      const show = f.input.type === 'password';
      f.input.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      eye.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    });
    f.el.classList.add('has-eye');
    f.el.append(eye);
    return f;
  }

  function adoptBox() {
    const n = guestProgress();
    if (!n || loadRegistry().guestAdopted) return null;
    const input = h('input', { type: 'checkbox', id: 'login-adopt', class: 'check-input' });
    input.checked = !loadRegistry().list.length;
    return { input, el: h('label', { class: 'check-row', for: 'login-adopt' }, input, h('span', { class: 'check', 'aria-hidden': 'true' }, icon('check', 14)), h('span', null, 'Chuyển tiến độ đang học trên máy này vào tài khoản')) };
  }

  function drawLogin(prefill = '', note = '') {
    mode = 'login';
    lastUser = prefill;
    const user = field('login-user', 'Tên đăng nhập', { type: 'text', autocomplete: 'username', value: prefill, enterkeyhint: 'next' });
    const pass = passwordField('login-pass', 'Mật khẩu', 'current-password');
    const adopt = adoptBox();
    const msg = h('p', { class: 'login-error', role: 'alert' }, note ? h('span', { class: 'muted' }, note) : null);
    const submit = button('Đăng nhập', { icon: 'steps', cls: 'btn-block' });
    submit.type = 'submit';
    const form = h(
      'form',
      { class: 'login-form', novalidate: true },
      h('h2', { class: 'login-sub' }, 'Đăng nhập tài khoản lớp'),
      user.el,
      pass.el,
      adopt?.el,
      msg,
      submit,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!user.input.value.trim() || !pass.input.value) {
        msg.textContent = 'Hãy nhập tên đăng nhập và mật khẩu.';
        return;
      }
      submit.disabled = true;
      submit.querySelector('span:last-child').textContent = 'Đang đăng nhập…';
      try {
        await signIn({ username: user.input.value, password: pass.input.value, adoptGuest: Boolean(adopt?.input.checked) });
        restartApp();
      } catch (err) {
        msg.textContent = errorText(err);
        submit.disabled = false;
        submit.querySelector('span:last-child').textContent = 'Đăng nhập';
        pass.input.select();
      }
    });
    panel.replaceChildren(
      form,
      h(
        'div',
        { class: 'login-links' },
        info.allowSignup ? h('button', { type: 'button', class: 'link-btn', onclick: drawSignup }, 'Chưa có tài khoản? Tạo tài khoản mới') : h('p', { class: 'small muted' }, 'Chưa có tài khoản? Hãy nhờ giáo viên của lớp tạo cho bạn.'),
        loadRegistry().list.length ? h('button', { type: 'button', class: 'link-btn', onclick: drawList }, 'Chọn tài khoản đã lưu trên máy') : null,
      ),
    );
    (prefill ? pass.input : user.input).focus({ preventScroll: true });
  }

  function drawSignup() {
    mode = 'signup';
    const name = field('signup-name', 'Họ tên', { type: 'text', autocomplete: 'name', autocapitalize: 'words' });
    const user = field('signup-user', 'Tên đăng nhập', { type: 'text', autocomplete: 'username', placeholder: 'ví dụ: lan.tran' });
    const pass = passwordField('signup-pass', `Mật khẩu (ít nhất ${info.minPw || 6} ký tự)`, 'new-password');
    const again = field('signup-again', 'Nhập lại mật khẩu', { type: 'password', autocomplete: 'new-password' });
    const adopt = adoptBox();
    const msg = h('p', { class: 'login-error', role: 'alert' });
    const submit = button('Tạo tài khoản', { icon: 'check', cls: 'btn-block' });
    submit.type = 'submit';
    const form = h('form', { class: 'login-form', novalidate: true }, h('h2', { class: 'login-sub' }, 'Tạo tài khoản mới'), name.el, user.el, pass.el, again.el, adopt?.el, msg, submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (pass.input.value !== again.input.value) {
        msg.textContent = 'Hai lần nhập mật khẩu chưa giống nhau.';
        return;
      }
      submit.disabled = true;
      try {
        await signIn({ username: user.input.value, password: pass.input.value, name: name.input.value, signup: true, adoptGuest: Boolean(adopt?.input.checked) });
        restartApp();
      } catch (err) {
        msg.textContent = errorText(err);
        submit.disabled = false;
      }
    });
    panel.replaceChildren(form, h('div', { class: 'login-links' }, h('button', { type: 'button', class: 'link-btn', onclick: () => drawLogin() }, 'Đã có tài khoản? Đăng nhập')));
    name.input.focus({ preventScroll: true });
  }

  const guestBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-ghost btn-sm login-guest',
      onclick: () => {
        continueAsGuest();
        restartApp();
      },
    },
    'Học không cần tài khoản',
  );
  const backBtn = !gate ? h('a', { class: 'icon-btn login-back', href: '#/account', 'aria-label': 'Quay lại' }, icon('back', 24)) : null;

  const cur = currentAccount(reg);
  if (gate === 'pin' && cur) drawPin(cur);
  else if (query.get('add') || !reg.list.length) drawLogin();
  else drawList();

  const el = h(
    'div',
    { class: 'view full login-view' },
    backBtn,
    head,
    panel,
    h('footer', { class: 'login-foot' }, guestBtn, h('p', { class: 'small muted' }, 'Học như khách: tiến độ chỉ lưu trên máy này, giáo viên không xem được.')),
  );
  return { el, title: 'Đăng nhập', immersive: true };
}
