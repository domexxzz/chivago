import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createElement as h } from 'react';

import { LoginScreen } from '../src/screens/LoginScreen.tsx';
import { clearLoggedIn, hasLoggedIn } from '../src/state/auth.ts';
import { mountScreen, server, settle } from './interact.ts';
import { __setLocaleForTests } from '../src/i18n/locale.ts';

// These screens follow the app language; the assertions below are the Thai copy.
beforeEach(() => { __setLocaleForTests('th'); });
afterEach(() => { __setLocaleForTests('en'); });

describe('ChivarGo LoginScreen', () => {
  it('renders the complete Chinese authentication path', async () => {
    __setLocaleForTests('zh');
    const ui = await mountScreen(h(LoginScreen, {}));
    const out = ui.text();
    assert.match(out, /欢迎回来/);
    assert.match(out, /登录以继续旅程/);
    assert.match(out, /使用 Google 登录/);
    assert.match(out, /使用 LINE 登录/);
    assert.match(out, /创建账户/);
    assert.doesNotMatch(out, /ยินดีต้อนรับกลับ/);
    ui.unmount();
  });

  it('renders branding, headings, inputs, and OAuth buttons', async () => {
    const ui = await mountScreen(h(LoginScreen, {}));
    const text = ui.text();

    assert.match(text, /เดินทางไปด้วยกันให้ไกลกว่าเดิม/);
    assert.match(text, /ยินดีต้อนรับกลับ/);
    assert.match(text, /เข้าสู่ระบบเพื่อเดินทางต่อ/);
    assert.match(text, /ลืมรหัสผ่าน\?/);
    assert.match(text, /เข้าสู่ระบบ/);
    assert.match(text, /หรือ/);
    assert.match(text, /เข้าสู่ระบบด้วย Google/);
    assert.match(text, /เข้าสู่ระบบด้วย LINE/);
    assert.match(text, /ยังไม่มีบัญชี\?/);
    assert.match(text, /สมัครสมาชิก/);

    ui.unmount();
  });

  it('offers guest mode only when the app wires it, and calls it on press', async () => {
    const without = await mountScreen(h(LoginScreen, {}));
    assert.doesNotMatch(without.text(), /เข้าชมแบบผู้เยี่ยมชม/);
    without.unmount();

    let guests = 0;
    const ui = await mountScreen(h(LoginScreen, { onGuest: () => { guests += 1; } }));
    assert.match(ui.text(), /เข้าชมแบบผู้เยี่ยมชม/);
    await ui.press(/เข้าชมแบบผู้เยี่ยมชม/);
    assert.equal(guests, 1);
    ui.unmount();
  });

  it('validates empty inputs and displays Thai error messages', async () => {
    const ui = await mountScreen(h(LoginScreen, {}));

    // Press login with empty inputs
    await ui.press(/เข้าสู่ระบบ/);
    assert.match(ui.text(), /กรุณากรอกชื่อผู้ใช้ อีเมล หรือเบอร์โทรศัพท์/);

    // Type invalid email/phone format
    await ui.type('invalid-id', /อีเมลหรือเบอร์โทรศัพท์/);
    await ui.press(/เข้าสู่ระบบ/);
    assert.match(ui.text(), /กรุณากรอกรหัสผ่าน/);

    // Type valid email with empty password
    await ui.type('user@example.com', /อีเมลหรือเบอร์โทรศัพท์/);
    await ui.press(/เข้าสู่ระบบ/);
    assert.match(ui.text(), /กรุณากรอกรหัสผ่าน/);

    // Type short password (< 6 chars)
    await ui.type('123', /รหัสผ่าน/);
    await ui.press(/เข้าสู่ระบบ/);
    assert.match(ui.text(), /รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร/);

    ui.unmount();
  });

  it('opens account recovery modal when forgot password is pressed', async () => {
    const ui = await mountScreen(h(LoginScreen, {}));

    await ui.press(/ลืมรหัสผ่าน\?/);
    const text = ui.text();
    assert.match(text, /การกู้คืนบัญชี/);
    assert.match(text, /ยังไม่มีระบบรีเซ็ตรหัสผ่านอัตโนมัติ/);
    assert.match(text, /กรุณาติดต่อทีม ChivarGo/);

    // Dismiss modal
    await ui.pressText(/เข้าใจแล้ว/);
    ui.unmount();
  });

  it('opens OAuth notice modal when Google or LINE is pressed', async () => {
    const ui = await mountScreen(h(LoginScreen, {}));

    // Press Google button
    await ui.press(/เข้าสู่ระบบด้วย Google/);
    assert.match(ui.text(), /เข้าสู่ระบบด้วย Google/);
    // Off the web build Google sign-in cannot run, and the notice says where it does.
    assert.match(ui.text(), /การเข้าสู่ระบบด้วย Google ใช้งานได้บนเว็บที่ chivargo\.com/);
    await ui.pressText(/ตกลง/);

    // Press LINE button
    await ui.press(/เข้าสู่ระบบด้วย LINE/);
    assert.match(ui.text(), /เข้าสู่ระบบด้วย LINE/);
    await ui.pressText(/ตกลง/);

    ui.unmount();
  });

  it('calls onRegister when registration link is pressed', async () => {
    let registered = false;
    const ui = await mountScreen(
      h(LoginScreen, {
        onRegister: () => {
          registered = true;
        },
      }),
    );

    await ui.press(/สมัครสมาชิก/);
    assert.equal(registered, true);

    ui.unmount();
  });

  it('calls onLoginSuccess on valid submission and marks logged in', async () => {
    await clearLoggedIn();
    assert.equal(await hasLoggedIn(), false);

    const s = server({
      'POST /auth/login': {
        userId: 'u_test',
        deviceKey: 'test_dev_key_123',
        name: 'Test User',
        email: 'test@example.com',
        phone: '0812345678',
      },
    });
    try {
      let success = false;
      const ui = await mountScreen(
        h(LoginScreen, {
          onLoginSuccess: () => {
            success = true;
          },
        }),
      );

      await ui.type('milk4taa', /อีเมลหรือเบอร์โทรศัพท์/);
      await ui.type('password123', /รหัสผ่าน/);
      await ui.press(/เข้าสู่ระบบ/);
      await settle();

      assert.equal(success, true);
      assert.equal(await hasLoggedIn(), true);
      ui.unmount();
    } finally {
      s.restore();
    }
  });

  it('displays server error message when login fails', async () => {
    const s = server({
      'POST /auth/login': {
        __refuses: {
          code: 'INVALID_CREDENTIALS',
          error: 'อีเมล เบอร์โทรศัพท์ หรือรหัสผ่านไม่ถูกต้อง',
        },
      },
    });
    try {
      let success = false;
      const ui = await mountScreen(
        h(LoginScreen, {
          onLoginSuccess: () => {
            success = true;
          },
        }),
      );

      await ui.type('0812345678', /อีเมลหรือเบอร์โทรศัพท์/);
      await ui.type('wrongpassword', /รหัสผ่าน/);
      await ui.press(/เข้าสู่ระบบ/);
      await settle();

      assert.equal(success, false);
      assert.match(ui.text(), /อีเมล เบอร์โทรศัพท์ หรือรหัสผ่านไม่ถูกต้อง/);
      ui.unmount();
    } finally {
      s.restore();
    }
  });

  it('does not expose the legacy device-transfer flow', async () => {
    const ui = await mountScreen(h(LoginScreen, {}));
    assert.doesNotMatch(ui.text(), /ย้ายบัญชีจากเครื่องเดิม|รหัสเชื่อมต่อ/);
    ui.unmount();
  });

  it('does not ask for an account role on login', async () => {
    const ui = await mountScreen(
      h(LoginScreen, {
        onRegister: () => {},
      }),
    );

    assert.doesNotMatch(ui.text(), /เข้าสู่ระบบในฐานะ|นักท่องเที่ยว|ผู้ประกอบการ/);
    assert.match(ui.text(), /เข้าสู่ระบบเพื่อเดินทางต่อ/);
    await ui.press(/สมัครสมาชิก/);

    ui.unmount();
  });
});
