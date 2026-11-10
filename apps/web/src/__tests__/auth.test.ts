// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkPassword, createSessionToken, safeNextPath, verifySessionToken } from '@/lib/auth';

describe('session auth', () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = 'test-password';
    process.env.SESSION_SECRET = 'test-secret';
  });
  afterEach(() => {
    delete process.env.SITE_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.SESSION_SECRET;
  });

  it('accepts a freshly signed site token', async () => {
    expect(await verifySessionToken(await createSessionToken('site'))).toBe('site');
  });

  it('accepts a freshly signed admin token', async () => {
    expect(await verifySessionToken(await createSessionToken('admin'))).toBe('admin');
  });

  it('rejects tampered, expired, foreign-secret and missing tokens', async () => {
    const token = await createSessionToken('site');
    // Tamper exp
    const firstDot = token.indexOf('.');
    const expStr = token.slice(0, firstDot);
    const rest = token.slice(firstDot);
    expect(await verifySessionToken(`${Number(expStr) + 1}${rest}`)).toBeNull();
    // Tamper sig (append a char)
    expect(await verifySessionToken(`${token}x`)).toBeNull();
    // Expired token
    expect(
      await verifySessionToken(await createSessionToken('site', Date.now() - 31 * 86400_000)),
    ).toBeNull();
    // Foreign secret
    process.env.SESSION_SECRET = 'other-secret';
    expect(await verifySessionToken(token)).toBeNull();
    // Missing token
    expect(await verifySessionToken(undefined)).toBeNull();
  });

  it('rejects a token with tampered role', async () => {
    // Build a valid admin token then swap the role to 'site' — sig no longer matches
    const token = await createSessionToken('admin');
    const tampered = token.replace('.admin.', '.site.');
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it('rejects v1-format tokens (two-segment)', async () => {
    // A v1 token has the form <exp>.<sig> (two dot segments); v2 parser must reject it.
    const secret = process.env.SESSION_SECRET!;
    const exp = Date.now() + 86400_000;
    // Reconstruct manually using the old v1 HMAC pattern
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v1.${exp}`));
    const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const v1token = `${exp}.${sig}`;
    expect(await verifySessionToken(v1token)).toBeNull();
  });

  it('checks passwords and returns the correct role', async () => {
    expect(await checkPassword('test-password')).toBe('site');
    expect(await checkPassword('wrong')).toBeNull();
    delete process.env.SITE_PASSWORD;
    expect(await checkPassword('test-password')).toBeNull();
  });

  it('checkPassword returns admin when ADMIN_PASSWORD matches', async () => {
    process.env.ADMIN_PASSWORD = 'admin-secret';
    expect(await checkPassword('admin-secret')).toBe('admin');
    expect(await checkPassword('test-password')).toBe('site');
    expect(await checkPassword('wrong')).toBeNull();
  });

  it('checkPassword returns null when SESSION_SECRET is unset', async () => {
    delete process.env.SESSION_SECRET;
    expect(await checkPassword('test-password')).toBeNull();
  });

  it('only allows same-site relative redirect targets', () => {
    expect(safeNextPath('/intel?tab=news')).toBe('/intel?tab=news');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
  });
});
