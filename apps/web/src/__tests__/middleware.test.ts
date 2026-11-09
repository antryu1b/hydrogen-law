// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

const req = (path: string) => new NextRequest(new URL(path, 'https://example.test'));

describe('middleware with SITE_PASSWORD unset (login off)', () => {
  beforeEach(() => {
    delete process.env.SITE_PASSWORD;
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  });
  afterEach(() => {
    delete process.env.SESSION_SECRET;
  });

  it('lets public pages and APIs through', async () => {
    expect((await middleware(req('/intel'))).headers.get('x-middleware-next')).toBe('1');
    expect((await middleware(req('/api/search'))).headers.get('x-middleware-next')).toBe('1');
  });

  it('still gates intel admin and upload', async () => {
    expect((await middleware(req('/intel/admin'))).status).toBe(307);
    expect((await middleware(req('/api/intel/upload'))).status).toBe(401);
  });

  it('still requires CRON_SECRET for cron', async () => {
    expect((await middleware(req('/api/cron/intel-news'))).status).toBe(401);
  });
});

describe('middleware with SITE_PASSWORD set (login on)', () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = 'test-password';
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  });
  afterEach(() => {
    delete process.env.SITE_PASSWORD;
    delete process.env.SESSION_SECRET;
  });

  it('redirects pages and rejects APIs without a session', async () => {
    expect((await middleware(req('/intel'))).status).toBe(307);
    expect((await middleware(req('/api/search'))).status).toBe(401);
  });
});
