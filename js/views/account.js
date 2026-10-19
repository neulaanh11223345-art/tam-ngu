// Tài khoản lớp học: trạng thái đồng bộ, mã PIN, đổi mật khẩu, đổi tài khoản, đăng xuất khỏi máy.
import { accountsEnabled, accountStatus, cachedClassInfo, changePassword, continueAsGuest, errorText, loadRegistry, onAccountStatus, pinHash, restartApp, signOut, switchTo, syncNow, updateAccount } from '../accounts.js';
import { button, h, icon, toast } from '../dom.js';
import { accountSeal, openSheet } from './common.js';
import { pinPad } from './login.js';

function syncText(st) {
  const at = st.last ? new Date(st.last).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : null;
  if (st.state === 'syncing') return 'Đang đồng bộ…';
  if (st.state === 'ok') return `Đã đồng bộ lúc ${at}`;
  if (st.state === 'error') return `Chưa đồng bộ được (${errorText({ code: st.error }).replace(/\.$/, '')}). App sẽ tự thử lại.${at ? ` Lần gần nhất: ${at}.` : ''}`;
  if (st.state === 'signedout') return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';
  return at ? `Đồng bộ gần nhất: ${at}` : 'Chưa đồng bộ';
}

export function render(ctx) {
  const acc = ctx.account;
  const info = cachedClassInfo() || {};
  const head = h('header', { class: 'topbar' }, h('a', { class: 'icon-btn', href: '#/me', 'aria-label': 'Quay lại' }, icon('back', 24)), h('h1', { class: 'grow' }, 'Tài khoản'));

  if (!acc) {
    const el = h(
      'div',
      { class: 'view' },
      head,
      h(
        'section',
        { class: 'card acc-card' },
        h('div', { class: 'acc-top' }, accountSeal({ name: 'Khách', color: 'var(--ink-3)' }, 'seal-lg'), h('div', { class: 'row-main' }, h('strong', { class: 'me-name' }, 'Bạn đang học như khách'), h('span', { class: 'small muted' }, 'Tiến độ chỉ lưu trên máy này.'))),
        accountsEnabled() ? button('Đăng nhập tài khoản lớp', { href: '#/login?add=1', icon: 'user', cls: 'btn-block' }) : h('p', { class: 'small muted' }, 'App này chưa gắn máy chủ tài khoản của lớp.'),
      ),
    );
    return { el, title: 'Tài khoản' };
  }

  // ---------- thẻ tài khoản + đồng bộ ----------
  const status = h('p', { class: 'acc-sync small', role: 'status' });
  const syncBtn = button('Đồng bộ ngay', { icon: 'rotate', variant: 'secondary', size: 'sm' });
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    const ok = await syncNow();
    syncBtn.disabled = false;
    toast(ok ? 'Đã đồng bộ tiến độ' : 'Chưa đồng bộ được, app sẽ tự thử lại');
  });
  const drawStatus = (st) => {
    status.textContent = syncText(st);
    status.dataset.state = st.state;
  };
  drawStatus(accountStatus());
  const off = onAccountStatus(drawStatus);

  const card = h(
    'section',
    { class: 'card acc-card' },
    h('div', { class: 'acc-top' }, accountSeal(acc, 'seal-lg'), h('div', { class: 'row-main' }, h('strong', { class: 'me-name' }, acc.name), h('span', { class: 'small muted' }, `@${acc.user}${info.className ? ` · ${info.className}` : ''}`))),
    h('div', { class: 'acc-sync-row' }, icon('rotate', 16), status, syncBtn),
    h('p', { class: 'small muted' }, 'Tiến độ được lưu vào máy chủ của lớp: đăng nhập trên máy khác vẫn học tiếp được, giáo viên xem được bảng tiến độ của bạn.'),
  );

  // ---------- mã PIN ----------
  const pinRow = h('div', { class: 'set-row' });
  function drawPinRow() {
    const a = loadRegistry().list.find((x) => x.user === acc.user) || acc;
    pinRow.replaceChildren(
      h('span', { class: 'set-label' }, h('span', null, 'Mã PIN trên máy này'), h('small', null, a.pin ? 'Đã bật: hỏi PIN khi mở app và khi đổi sang tài khoản này' : 'Chưa bật. Nên bật nếu máy dùng chung với người khác.')),
      h('div', { class: 'row-actions' }, button(a.pin ? 'Đổi PIN' : 'Đặt PIN', { variant: 'secondary', size: 'sm', onclick: setPin }), a.pin ? button('Bỏ', { variant: 'ghost', size: 'sm', onclick: () => (updateAccount(acc.user, { pin: null }), toast('Đã bỏ mã PIN'), drawPinRow()) }) : null),
    );
  }
  function setPin() {
    let first = null;
    const { close, sheet } = openSheet(
      (closeFn) => {
        const host = h('div');
        const step1 = () =>
          host.replaceChildren(
            pinPad({
              title: 'Đặt mã PIN',
              sub: 'Nhập 4 số dễ nhớ với bạn',
              onComplete: (pin) => {
                first = pin;
                step2();
                return true;
              },
            }),
          );
        const step2 = () =>
          host.replaceChildren(
            pinPad({
              title: 'Nhập lại mã PIN',
              sub: 'Nhập lại 4 số vừa chọn',
              onComplete: async (pin) => {
                if (pin !== first) return 'Hai lần nhập chưa giống nhau. Thử lại.';
                updateAccount(acc.user, { pin: await pinHash(acc.user, pin) });
                closeFn();
                toast('Đã đặt mã PIN');
                drawPinRow();
                return true;
              },
            }),
          );
        step1();
        return [host];
      },
      { label: 'Đặt mã PIN', cls: 'pin-sheet' },
    );
    sheet.querySelector('.pin-pad')?.focus({ preventScroll: true });
    return close;
  }
  drawPinRow();

  // ---------- đổi mật khẩu ----------
  const pwSlot = h('div', { class: 'set-row' });
  function drawPw(open) {
    if (!open) {
      pwSlot.replaceChildren(h('span', { class: 'set-label' }, h('span', null, 'Mật khẩu'), h('small', null, 'Đổi xong thì các máy khác phải đăng nhập lại')), button('Đổi mật khẩu', { variant: 'secondary', size: 'sm', onclick: () => drawPw(true) }));
      return;
    }
    const inp = (id, label, ac) => {
      const input = h('input', { id, type: 'password', class: 'field', autocomplete: ac });
      return { input, el: h('label', { class: 'login-field', for: id }, h('span', null, label), input) };
    };
    const old = inp('pw-old', 'Mật khẩu hiện tại', 'current-password');
    const nw = inp('pw-new', `Mật khẩu mới (ít nhất ${info.minPw || 6} ký tự)`, 'new-password');
    const again = inp('pw-again', 'Nhập lại mật khẩu mới', 'new-password');
    const msg = h('p', { class: 'login-error', role: 'alert' });
    const save = button('Lưu mật khẩu mới', { icon: 'check', size: 'sm' });
    save.type = 'submit';
    const form = h('form', { class: 'login-form pw-form', novalidate: true }, old.el, nw.el, again.el, msg, h('div', { class: 'confirm-actions' }, button('Thôi', { variant: 'ghost', size: 'sm', onclick: () => drawPw(false) }), save));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (nw.input.value !== again.input.value) {
        msg.textContent = 'Hai lần nhập mật khẩu mới chưa giống nhau.';
        return;
      }
      save.disabled = true;
      try {
        await changePassword(acc, old.input.value, nw.input.value);
        toast('Đã đổi mật khẩu');
        drawPw(false);
      } catch (err) {
        msg.textContent = errorText(err);
        save.disabled = false;
      }
    });
    pwSlot.replaceChildren(form);
    old.input.focus();
  }
  drawPw(false);

  // ---------- tài khoản khác trên máy ----------
  const others = loadRegistry().list.filter((a) => a.user !== acc.user);
  const switchSec = h(
    'section',
    { class: 'card settings-group section' },
    h('div', { class: 'set-row' }, h('h2', { style: { fontSize: '16px' } }, 'Tài khoản trên máy này')),
    others.map((a) =>
      h(
        'button',
        { type: 'button', class: 'acc-pick', onclick: () => (a.pin || !a.token ? ctx.navigate('#/login') : (switchTo(a.user), restartApp())) },
        accountSeal(a),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, a.name), h('span', { class: 'row-sub' }, `@${a.user}`)),
        h('span', { class: 'small', style: { color: 'var(--accent)', fontWeight: '700' } }, 'Đổi sang'),
      ),
    ),
    h(
      'div',
      { class: 'set-row', style: { flexWrap: 'wrap', justifyContent: 'flex-start' } },
      button('Thêm tài khoản', { href: '#/login?add=1', icon: 'user', variant: 'secondary', size: 'sm' }),
      button('Học không cần tài khoản', { variant: 'ghost', size: 'sm', onclick: () => (continueAsGuest(), restartApp()) }),
    ),
  );

  // ---------- đăng xuất ----------
  const outSlot = h('div', { class: 'set-row' });
  function drawOut(asking, unsynced = false) {
    if (!asking) {
      outSlot.replaceChildren(h('span', { class: 'set-label' }, h('span', null, 'Đăng xuất khỏi máy này'), h('small', null, 'Tiến độ vẫn giữ trên máy chủ của lớp')), button('Đăng xuất', { icon: 'close', variant: 'ghost', size: 'sm', onclick: () => drawOut(true) }));
      return;
    }
    const cancel = button('Ở lại', { variant: 'secondary', size: 'sm', onclick: () => drawOut(false) });
    const go = button(unsynced ? 'Vẫn đăng xuất' : 'Đăng xuất', {
      icon: 'close',
      variant: 'danger',
      size: 'sm',
      onclick: async () => {
        go.disabled = true;
        if (!unsynced && !(await syncNow())) {
          drawOut(true, true);
          return;
        }
        await signOut(acc.user);
        restartApp();
      },
    });
    outSlot.replaceChildren(
      h(
        'div',
        { class: 'confirm-box', role: 'alertdialog', 'aria-label': 'Xác nhận đăng xuất' },
        h('p', null, h('b', null, unsynced ? 'Chưa gửi được phần học mới lên máy chủ.' : `Đăng xuất ${acc.name} khỏi máy này?`), h('br'), h('small', null, unsynced ? 'Nếu đăng xuất bây giờ, phần học chưa gửi sẽ mất. Hãy kiểm tra mạng rồi thử lại.' : 'App sẽ gửi phần học mới nhất lên máy chủ trước khi đăng xuất.')),
        h('div', { class: 'confirm-actions' }, cancel, go),
      ),
    );
    cancel.focus();
  }
  drawOut(false);

  const security = h('section', { class: 'card settings-group section' }, h('div', { class: 'set-row' }, h('h2', { style: { fontSize: '16px' } }, 'Bảo vệ')), pinRow, pwSlot, outSlot);

  const el = h('div', { class: 'view' }, head, h('div', { class: 'grid-2' }, h('div', { class: 'col' }, card, security), h('div', { class: 'col' }, switchSec)));
  return { el, title: 'Tài khoản', destroy: off };
}
