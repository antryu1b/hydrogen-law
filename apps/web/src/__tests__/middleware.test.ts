// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { MCP_PROXY_HEADER, SESSION_COOKIE, createSessionToken } from '@/lib/auth';

const req = (path: string, opts?: { cookie?: string }) => {
  const r = new NextRequest(new URL(path, 'https://example.test'));
  if (opts?.cookie) r.cookies.set(SESSION_COOKIE, opts.cookie);
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

  it('site-role session passes admin path when ADMIN_PASSWORD unset (backward compat)', async () => {
    // With ADMIN_PASSWORD unset a site-role session is accepted on admin paths
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

  it('gates subpaths of admin routes', async () => {
    // /intel/admin/x and /api/kgs/upload/file must be treated as admin paths
    expect((await middleware(req('/intel/admin/x'))).status).toBe(307);
    expect((await middleware(req('/api/kgs/upload/file'))).status).toBe(401);
  });

  it('segment match: /uploads-foo is not an admin path', async () => {
    // /uploads-foo starts with /upload but is a different path segment — must be public
    expect((await middleware(req('/uploads-foo'))).headers.get('x-middleware-next')).toBe('1');
  });

  it('normalizes percent-encoded paths to admin paths', async () => {
    // /api/%75pload → /api/upload (admin API path) → 401
    expect((await middleware(req('/api/%75pload'))).status).toBe(401);
    // /%75pload → /upload (admin non-API path) → 307
    expect((await middleware(req('/%75pload'))).status).toBe(307);
    // /intel/%61dmin → /intel/admin → 307
    expect((await middleware(req('/intel/%61dmin'))).status).toBe(307);
    // /API/upload — uppercase lowercased to /api/upload → admin
    // (raw isApi check is case-sensitive so response is 307 not 401)
    expect((await middleware(req('/API/upload'))).status).toBe(307);
    // /api//upload — double slash collapses to /api/upload (admin API) → 401
    const doubleSlash = new NextRequest(new URL('https://example.test/api//upload'));
    expect((await middleware(doubleSlash)).status).toBe(401);
    // malformed percent-encoding → fail closed (treat as admin path)
    expect((await middleware(req('/api/upload/%E0%A4%A'))).status).toBe(401);
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
