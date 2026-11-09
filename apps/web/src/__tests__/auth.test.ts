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
    delete process.env.SESSION_SECRET;
  });

  it('accepts a freshly signed token', async () => {
    expect(await verifySessionToken(await createSessionToken())).toBe(true);
  });

  it('rejects tampered, expired, foreign-secret and missing tokens', async () => {
    const token = await createSessionToken();
    const [exp, sig] = token.split('.');
    expect(await verifySessionToken(`${Number(exp) + 1}.${sig}`)).toBe(false);
    expect(await verifySessionToken(`${token}x`)).toBe(false);
    expect(await verifySessionToken(await createSessionToken(Date.now() - 31 * 86400_000))).toBe(false);
    process.env.SESSION_SECRET = 'other-secret';
    expect(await verifySessionToken(token)).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
  });

  it('checks the shared password', async () => {
    expect(await checkPassword('test-password')).toBe(true);
    expect(await checkPassword('wrong')).toBe(false);
    delete process.env.SITE_PASSWORD;
    expect(await checkPassword('test-password')).toBe(false);
  });

  it('only allows same-site relative redirect targets', () => {
    expect(safeNextPath('/intel?tab=news')).toBe('/intel?tab=news');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
  });
});
