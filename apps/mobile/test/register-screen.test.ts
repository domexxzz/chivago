import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';

import { RegisterScreen } from '../src/screens/RegisterScreen.tsx';
import { clearLoggedIn, hasLoggedIn } from '../src/state/auth.ts';
import { mountScreen, server, settle } from './interact.ts';

describe('Chivargo RegisterScreen', () => {
  it('renders branding, headings, 5 form fields, and action buttons', async () => {
    const ui = await mountScreen(h(RegisterScreen, {}));
    const text = ui.text();

    assert.match(text, /GO FURTHER TOGETHER/);
    assert.match(text, /สมัครสมาชิก/);
    assert.match(text, /เริ่มต้นการเดินทางไปด้วยกันกับ Chivargo/);
    assert.match(text, /ลงทะเบียนในฐานะ/);
    assert.match(text, /นักท่องเที่ยว/);
    assert.match(text, /ผู้ประกอบการ/);
    assert.match(text, /ชื่อ-นามสกุล/);
    assert.match(text, /อีเมล/);
    assert.match(text, /เบอร์โทรศัพท์/);
    assert.match(text, /รหัสผ่าน/);
    assert.match(text, /ยืนยันรหัสผ่าน/);
    assert.match(text, /ฉันยอมรับ/);
    assert.match(text, /ข้อตกลงการให้บริการ/);
    assert.match(text, /นโยบายความเป็นส่วนตัว/);
    assert.match(text, /หรือสมัครด้วย/);
    assert.match(text, /สมัครด้วย Google/);
    assert.match(text, /สมัครด้วย LINE/);
    assert.match(text, /มีบัญชีอยู่แล้ว\?/);
    assert.match(text, /เข้าสู่ระบบ/);

    ui.unmount();
  });

  it('validates empty inputs and displays Thai error messages step-by-step', async () => {
    const ui = await mountScreen(h(RegisterScreen, {}));

    // 1. Submit empty -> Full name required
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /กรุณากรอกชื่อ-นามสกุล/);

    // 2. Short name -> At least 2 characters
    await ui.type('A', /ชื่อ-นามสกุล/);
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /ชื่อ-นามสกุลต้องมีความยาวอย่างน้อย 2 ตัวอักษร/);

    // 3. Valid name, empty email -> Email required
    await ui.type('สมชาย ใจดี', /ชื่อ-นามสกุล/);
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /กรุณากรอกอีเมล/);

    // 4. Invalid email format -> Format error
    await ui.type('invalid-email', /อีเมล/);
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /รูปแบบอีเมลไม่ถูกต้อง/);

    // 5. Valid email, empty phone -> Phone required
    await ui.type('somchai@example.com', /อีเมล/);
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /กรุณากรอกเบอร์โทรศัพท์/);

    // 6. Invalid phone format -> Format error
    await ui.type('123', /เบอร์โทรศัพท์/);
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง/);

    // 7. Valid phone, empty password -> Password required
    await ui.type('0812345678', /เบอร์โทรศัพท์/);
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /กรุณากรอกรหัสผ่าน/);

    // 8. Short password (< 8 chars) -> Minimum 8 chars error
    await ui.type('pass123', /รหัสผ่าน/);
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร/);

    // 9. Valid password, empty confirm password -> Confirm password required
    await ui.type('password123', /รหัสผ่าน/);
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /กรุณากรอกยืนยันรหัสผ่าน/);

    // 10. Mismatched confirm password -> Passwords do not match error
    await ui.type('password999', /ยืนยันรหัสผ่าน/);
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน/);

    // 11. Matching password, unchecked consent -> Consent required error
    await ui.type('password123', /ยืนยันรหัสผ่าน/);
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /กรุณายอมรับข้อตกลงการให้บริการและนโยบายความเป็นส่วนตัว/);

    ui.unmount();
  });

  it('validates business name when operator role is selected', async () => {
    const ui = await mountScreen(h(RegisterScreen, {}));

    // Switch to operator
    await ui.press(/ผู้ประกอบการ/);
    assert.match(ui.text(), /ชื่อธุรกิจ \/ สถานประกอบการ/);

    // Try submitting empty as operator -> requires business name
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /กรุณากรอกชื่อธุรกิจหรือสถานประกอบการ/);

    // Type short business name
    await ui.type('A', /ชื่อธุรกิจหรือสถานประกอบการ/);
    await ui.press(/สมัครสมาชิก/);
    assert.match(ui.text(), /ชื่อธุรกิจหรือสถานประกอบการต้องมีความยาวอย่างน้อย 2 ตัวอักษร/);

    ui.unmount();
  });

  it('submits valid operator registration with businessName', async () => {
    let capturedBody: any = null;
    const s = server({
      'POST /auth/register': (body) => {
        capturedBody = body;
        return {
          userId: 'u_operator_1',
          deviceKey: 'test_operator_dev_key',
          name: 'สมคิด เจ้าของรีสอร์ท',
          email: 'somkid@resort.com',
          phone: '0829998877',
          accountType: 'operator',
          businessName: 'สีชัง ซันเซ็ท วิลล่า',
        };
      },
      'PUT /profile': {
        purposes: [],
        activity: null,
        watch: [],
        completedAt: null,
      },
    });

    try {
      let registered = false;
      const ui = await mountScreen(
        h(RegisterScreen, {
          onRegisterSuccess: () => {
            registered = true;
          },
        }),
      );

      // Select operator role
      await ui.press(/ผู้ประกอบการ/);
      await ui.type('สีชัง ซันเซ็ท วิลล่า', /ชื่อธุรกิจหรือสถานประกอบการ/);
      await ui.type('สมคิด เจ้าของรีสอร์ท', /ชื่อ-นามสกุล/);
      await ui.type('somkid@resort.com', /อีเมล/);
      await ui.type('0829998877', /เบอร์โทรศัพท์/);
      await ui.type('securePass123', /รหัสผ่าน/);
      await ui.type('securePass123', /ยืนยันรหัสผ่าน/);
      await ui.press(/ฉันยอมรับ/);
      await ui.press(/สมัครสมาชิก/);
      await settle();

      assert.equal(registered, true);
      assert.equal(capturedBody?.accountType, 'operator');
      assert.equal(capturedBody?.businessName, 'สีชัง ซันเซ็ท วิลล่า');
      ui.unmount();
    } finally {
      s.restore();
    }
  });

  it('opens Terms of Service modal and Privacy Policy modal', async () => {
    const ui = await mountScreen(h(RegisterScreen, {}));

    // Terms modal
    await ui.pressText(/ข้อตกลงการให้บริการ/);
    assert.match(ui.text(), /การใช้งานบัญชีและระบบนำทาง/);
    await ui.pressText(/เข้าใจและยอมรับ/);

    // Privacy modal
    await ui.pressText(/นโยบายความเป็นส่วนตัว/);
    assert.match(ui.text(), /PDPA/);
    assert.match(ui.text(), /SecureStore/);
    await ui.pressText(/รับทราบ/);

    ui.unmount();
  });

  it('opens OAuth modals when Google or LINE is pressed', async () => {
    const ui = await mountScreen(h(RegisterScreen, {}));

    await ui.press(/สมัครด้วย Google/);
    assert.match(ui.text(), /สมัครด้วย Google/);
    assert.match(ui.text(), /กำลังอยู่ในช่วงเตรียมความพร้อมสำหรับการอัปเดตเวอร์ชันถัดไป/);
    await ui.pressText(/ตกลง/);

    await ui.press(/สมัครด้วย LINE/);
    assert.match(ui.text(), /สมัครด้วย LINE/);
    await ui.pressText(/ตกลง/);

    ui.unmount();
  });

  it('calls onLogin when login link is pressed', async () => {
    let loginTriggered = false;
    const ui = await mountScreen(
      h(RegisterScreen, {
        onLogin: () => {
          loginTriggered = true;
        },
      }),
    );

    await ui.press(/เข้าสู่ระบบ/);
    assert.equal(loginTriggered, true);

    ui.unmount();
  });

  it('submits valid registration, records consent, and marks logged in', async () => {
    await clearLoggedIn();
    assert.equal(await hasLoggedIn(), false);

    const s = server({
      'POST /auth/register': {
        userId: 'u_new_reg',
        deviceKey: 'test_reg_dev_key',
        name: 'สมศรี รักดี',
        email: 'somsri@example.com',
        phone: '0899998888',
      },
      'PUT /profile': {
        purposes: [],
        activity: null,
        watch: [],
        completedAt: null,
      },
    });

    try {
      let registered = false;
      const ui = await mountScreen(
        h(RegisterScreen, {
          onRegisterSuccess: () => {
            registered = true;
          },
        }),
      );

      await ui.type('สมศรี รักดี', /ชื่อ-นามสกุล/);
      await ui.type('somsri@example.com', /อีเมล/);
      await ui.type('0899998888', /เบอร์โทรศัพท์/);
      await ui.type('securePass123', /รหัสผ่าน/);
      await ui.type('securePass123', /ยืนยันรหัสผ่าน/);
      await ui.press(/ฉันยอมรับ/);
      await ui.press(/สมัครสมาชิก/);
      await settle();

      assert.equal(registered, true);
      assert.equal(await hasLoggedIn(), true);
      ui.unmount();
    } finally {
      s.restore();
    }
  });

  it('displays server error message when registration fails', async () => {
    const s = server({
      'POST /auth/register': {
        __refuses: {
          code: 'EMAIL_EXISTS',
          error: 'อีเมลนี้ถูกใช้งานแล้วในระบบ',
        },
      },
    });

    try {
      let registered = false;
      const ui = await mountScreen(
        h(RegisterScreen, {
          onRegisterSuccess: () => {
            registered = true;
          },
        }),
      );

      await ui.type('สมศรี รักดี', /ชื่อ-นามสกุล/);
      await ui.type('somsri@example.com', /อีเมล/);
      await ui.type('0899998888', /เบอร์โทรศัพท์/);
      await ui.type('securePass123', /รหัสผ่าน/);
      await ui.type('securePass123', /ยืนยันรหัสผ่าน/);
      await ui.press(/ฉันยอมรับ/);
      await ui.press(/สมัครสมาชิก/);
      await settle();

      assert.equal(registered, false);
      assert.match(ui.text(), /อีเมลนี้ถูกใช้งานแล้วในระบบ/);
      ui.unmount();
    } finally {
      s.restore();
    }
  });
});
