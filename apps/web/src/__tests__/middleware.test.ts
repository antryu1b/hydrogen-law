// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { MCP_PROXY_HEADER, SESSION_COOKIE, createSessionToken } from '@/lib/auth';

const req = (path: string, opts?: { cookie?: string; headers?: Record<string, string> }) => {
  const r = new NextRequest(new URL(path, 'https://example.test'));
  if (opts?.cookie) r.cookies.set(SESSION_COOKIE, opts.cookie);
  if (opts?.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      // NextRequest headers are immutable after construction; use the Headers override pattern
      Object.defineProperty(r, 'headers', {
        value: new Headers({ ...Object.fromEntries(r.headers), [k]: v }),
        configurable: true,
      });
    }
  }
  return r;
};

/** Build a request with an MCP proxy header attached. */
function reqWithProxy(path: string, token: string) {
  const r = new NextRequest(new URL(path, 'https://example.test'));
  // Override headers to inject the proxy header
  const h = new Headers(r.headers);
  h.set(MCP_PROXY_HEADER, token);
  Object.defineProperty(r, 'headers', { value: h, configurable: true });
  return r;
}

/** Build a request with a valid session cookie. */
async function reqWithSession(path: string, role: 'admin' | 'site') {
  const token = await createSessionToken(role);
  const r = new NextRequest(new URL(path, 'https://example.test'));
  r.cookies.set(SESSION_COOKIE, token);
  return r;
}

describe('middleware with SITE_PASSWORD unset (login off)', () => {
  beforeEach(() => {
    delete process.env.SITE_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  });
  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.MCP_PROXY_TOKEN;
  });

  it('lets public pages and APIs through', async () => {
    expect((await middleware(req('/intel'))).headers.get('x-middleware-next')).toBe('1');
    expect((await middleware(req('/api/search'))).headers.get('x-middleware-next')).toBe('1');
  });

  it('still gates intel admin and upload', async () => {
    expect((await middleware(req('/intel/admin'))).status).toBe(307);
    expect((await middleware(req('/api/intel/upload'))).status).toBe(401);
  });

  it('gates /upload and /api/upload as admin paths', async () => {
    expect((await middleware(req('/upload'))).status).toBe(307);
    expect((await middleware(req('/api/upload'))).status).toBe(401);
    expect((await middleware(req('/api/kgs/upload'))).status).toBe(401);
  });

  it('still requires CRON_SECRET for cron', async () => {
    expect((await middleware(req('/api/cron/intel-news'))).status).toBe(401);
  });

  it('admin path rejected without session', async () => {
    expect((await middleware(req('/intel/admin'))).status).toBe(307);
    expect((await middleware(req('/api/intel/upload'))).status).toBe(401);
  });

  it('admin-role session passes admin path', async () => {
    // With ADMIN_PASSWORD unset, site-role session also passes (backward compat)
    const r = await reqWithSession('/intel/admin', 'site');
    expect((await middleware(r)).headers.get('x-middleware-next')).toBe('1');
  });

  it('admin-role session passes admin path when ADMIN_PASSWORD set', async () => {
    process.env.ADMIN_PASSWORD = 'secret-admin';
    const r = await reqWithSession('/api/intel/upload', 'admin');
    expect((await middleware(r)).headers.get('x-middleware-next')).toBe('1');
  });

  it('site-role session rejected on admin path when ADMIN_PASSWORD set', async () => {
    process.env.ADMIN_PASSWORD = 'secret-admin';
    const r = await reqWithSession('/api/intel/upload', 'site');
    expect((await middleware(r)).status).toBe(401);
  });

  it('site-role session rejected on /upload when ADMIN_PASSWORD set', async () => {
    process.env.ADMIN_PASSWORD = 'secret-admin';
    const r = await reqWithSession('/upload', 'site');
    expect((await middleware(r)).status).toBe(307);
  });

  it('proxy token does NOT open admin paths', async () => {
    process.env.MCP_PROXY_TOKEN = 'my-proxy-token';
    process.env.ADMIN_PASSWORD = 'secret-admin';
    const r = reqWithProxy('/api/intel/upload', 'my-proxy-token');
    expect((await middleware(r)).status).toBe(401);
  });

  it('proxy token does NOT open /api/upload', async () => {
    process.env.MCP_PROXY_TOKEN = 'my-proxy-token';
    process.env.ADMIN_PASSWORD = 'secret-admin';
    const r = reqWithProxy('/api/upload', 'my-proxy-token');
    expect((await middleware(r)).status).toBe(401);
  });

  it('public paths still open without session', async () => {
    expect((await middleware(req('/intel'))).headers.get('x-middleware-next')).toBe('1');
    expect((await middleware(req('/api/search'))).headers.get('x-middleware-next')).toBe('1');
  });
});

describe('middleware with SITE_PASSWORD set (login on)', () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = 'test-password';
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
    delete process.env.ADMIN_PASSWORD;
  });
  afterEach(() => {
    delete process.env.SITE_PASSWORD;
    delete process.env.SESSION_SECRET;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.MCP_PROXY_TOKEN;
  });

  it('redirects pages and rejects APIs without a session', async () => {
    expect((await middleware(req('/intel'))).status).toBe(307);
    expect((await middleware(req('/api/search'))).status).toBe(401);
  });

  it('site-role session opens non-admin pages', async () => {
    const r = await reqWithSession('/intel', 'site');
    expect((await middleware(r)).headers.get('x-middleware-next')).toBe('1');
  });

  it('admin-role session opens non-admin pages', async () => {
    const r = await reqWithSession('/intel', 'admin');
    expect((await middleware(r)).headers.get('x-middleware-next')).toBe('1');
  });

  it('site-role session rejected on admin path when ADMIN_PASSWORD set', async () => {
    process.env.ADMIN_PASSWORD = 'secret-admin';
    const r = await reqWithSession('/api/intel/upload', 'site');
    expect((await middleware(r)).status).toBe(401);
  });

  it('admin-role session passes admin path when ADMIN_PASSWORD set', async () => {
    process.env.ADMIN_PASSWORD = 'secret-admin';
    const r = await reqWithSession('/api/intel/upload', 'admin');
    expect((await middleware(r)).headers.get('x-middleware-next')).toBe('1');
  });

  it('/upload and /api/upload gated even with SITE_PASSWORD set', async () => {
    // No session at all
    expect((await middleware(req('/upload'))).status).toBe(307);
    expect((await middleware(req('/api/upload'))).status).toBe(401);
  });

  it('proxy token does NOT open admin paths even when SITE_PASSWORD set', async () => {
    process.env.MCP_PROXY_TOKEN = 'my-proxy-token';
    process.env.ADMIN_PASSWORD = 'secret-admin';
    const r = reqWithProxy('/api/intel/upload', 'my-proxy-token');
    expect((await middleware(r)).status).toBe(401);
  });

  it('proxy token opens non-admin API when SITE_PASSWORD set', async () => {
    process.env.MCP_PROXY_TOKEN = 'my-proxy-token';
    const r = reqWithProxy('/api/search', 'my-proxy-token');
    expect((await middleware(r)).headers.get('x-middleware-next')).toBe('1');
  });

  it('token with tampered role is rejected', async () => {
    // Build a valid admin token and swap the role field to 'site'
    const token = await createSessionToken('admin');
    const tampered = token.replace('.admin.', '.site.');
    const r = new NextRequest(new URL('/api/intel/upload', 'https://example.test'));
    r.cookies.set(SESSION_COOKIE, tampered);
    expect((await middleware(r)).status).toBe(401);
  });
});
