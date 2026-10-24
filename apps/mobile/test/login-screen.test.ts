import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';

import { LoginScreen } from '../src/screens/LoginScreen.tsx';
import { clearLoggedIn, hasLoggedIn } from '../src/state/auth.ts';
import { mountScreen, server, settle } from './interact.ts';

describe('Chivargo LoginScreen', () => {
  it('renders branding, headings, inputs, and OAuth buttons', async () => {
    const ui = await mountScreen(h(LoginScreen, {}));
    const text = ui.text();

    assert.match(text, /GO FURTHER TOGETHER/);
    assert.match(text, /Welcome Back/);
    assert.match(text, /เข้าสู่ระบบเพื่อไปยัง Chivargo/);
    assert.match(text, /จดจำฉันไว้/);
    assert.match(text, /ลืมรหัสผ่าน\?/);
    assert.match(text, /เข้าสู่ระบบ/);
    assert.match(text, /หรือ/);
    assert.match(text, /เข้าสู่ระบบด้วย Google/);
    assert.match(text, /เข้าสู่ระบบด้วย LINE/);
    assert.match(text, /ยังไม่มีบัญชี\?/);
    assert.match(text, /สมัครสมาชิก/);

    ui.unmount();
  });

  it('validates empty inputs and displays Thai error messages', async () => {
    const ui = await mountScreen(h(LoginScreen, {}));

    // Press login with empty inputs
    await ui.press(/เข้าสู่ระบบ/);
    assert.match(ui.text(), /กรุณากรอกอีเมลหรือเบอร์โทรศัพท์/);

    // Type invalid email/phone format
    await ui.type('invalid-id', /อีเมลหรือเบอร์โทรศัพท์/);
    await ui.press(/เข้าสู่ระบบ/);
    assert.match(ui.text(), /รูปแบบอีเมลหรือเบอร์โทรศัพท์ไม่ถูกต้อง/);

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
    assert.match(text, /Device Key/);
    assert.match(text, /รหัสเชื่อมต่อ 8 หลัก/);

    // Dismiss modal
    await ui.pressText(/เข้าใจแล้ว/);
    ui.unmount();
  });

  it('opens OAuth notice modal when Google or LINE is pressed', async () => {
    const ui = await mountScreen(h(LoginScreen, {}));

    // Press Google button
    await ui.press(/เข้าสู่ระบบด้วย Google/);
    assert.match(ui.text(), /เข้าสู่ระบบด้วย Google/);
    assert.match(ui.text(), /กำลังอยู่ในช่วงเตรียมความพร้อมสำหรับการอัปเดตเวอร์ชันถัดไป/);
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
      'POST /devices': { userId: 'u_test', deviceKey: 'test_dev_key_123' },
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

  it('supports logging in via 8-character device link code', async () => {
    await clearLoggedIn();
    assert.equal(await hasLoggedIn(), false);

    const s = server({
      'POST /account/claim': { userId: 'u_linked', deviceKey: 'test_linked_key' },
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

      await ui.type('RHW6 FXT7', /อีเมลหรือเบอร์โทรศัพท์/);
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
});
