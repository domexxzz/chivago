import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

process.env.CHIVAGO_DB = ':memory:';
const { app } = await import('./server.ts');

const json = async (res: Response) =>
  (await res.json()) as { ok: boolean; data?: any; code?: string; error?: string };

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('User Authentication Routes (Real Database)', () => {
  it('registers a user via POST /auth/register and allows access to authenticated endpoints', async () => {
    const regRes = await post('/auth/register', {
      fullName: 'ณภัทร สมบูรณ์',
      email: 'naphat@example.com',
      phone: '0823334444',
      password: 'mypassword123',
    });
    const regJson = await json(regRes);

    assert.equal(regRes.status, 200);
    assert.equal(regJson.ok, true);
    assert.ok(regJson.data.userId.startsWith('u_'));
    assert.ok(regJson.data.deviceKey.startsWith('chvg_dev_'));
    assert.equal(regJson.data.name, 'ณภัทร สมบูรณ์');
    assert.equal(regJson.data.email, 'naphat@example.com');
    assert.equal(regJson.data.phone, '0823334444');

    // Access an authenticated endpoint with the issued deviceKey
    const walletRes = await app.request('/wallet', {
      headers: { 'x-chivago-device-key': regJson.data.deviceKey },
    });
    const walletJson = await json(walletRes);
    assert.equal(walletRes.status, 200);
    assert.equal(walletJson.ok, true);
  });

  it('refuses duplicate registration with clear error', async () => {
    // Duplicate email
    const dupRes = await post('/auth/register', {
      fullName: 'คนอื่น',
      email: 'NAPHAT@EXAMPLE.COM',
      phone: '0895556666',
      password: 'mypassword123',
    });
    const dupJson = await json(dupRes);
    assert.equal(dupRes.status, 409);
    assert.equal(dupJson.ok, false);
    assert.equal(dupJson.code, 'EMAIL_EXISTS');
  });

  it('authenticates user via POST /auth/login with email or phone', async () => {
    // Login with email
    const loginEmailRes = await post('/auth/login', {
      identifier: 'naphat@example.com',
      password: 'mypassword123',
    });
    const loginEmailJson = await json(loginEmailRes);

    assert.equal(loginEmailRes.status, 200);
    assert.equal(loginEmailJson.ok, true);
    assert.equal(loginEmailJson.data.name, 'ณภัทร สมบูรณ์');
    assert.ok(loginEmailJson.data.deviceKey.startsWith('chvg_dev_'));

    // Login with phone
    const loginPhoneRes = await post('/auth/login', {
      identifier: '082-333-4444',
      password: 'mypassword123',
    });
    const loginPhoneJson = await json(loginPhoneRes);

    assert.equal(loginPhoneRes.status, 200);
    assert.equal(loginPhoneJson.ok, true);
    assert.equal(loginPhoneJson.data.userId, loginEmailJson.data.userId);
  });

  it('refuses login with invalid credentials', async () => {
    const wrongPwdRes = await post('/auth/login', {
      identifier: 'naphat@example.com',
      password: 'wrongPassword',
    });
    const wrongPwdJson = await json(wrongPwdRes);
    assert.equal(wrongPwdRes.status, 401);
    assert.equal(wrongPwdJson.ok, false);
    assert.equal(wrongPwdJson.code, 'INVALID_CREDENTIALS');
  });
});
