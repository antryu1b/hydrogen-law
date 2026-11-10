import { NextResponse, type NextRequest } from 'next/server';
import { MCP_PROXY_HEADER, SESSION_COOKIE, safeEqual, verifySessionToken } from '@/lib/auth';

// Site-wide gate. Behaviour depends on which env vars are set:
//
//   SITE_PASSWORD unset → site is public, except admin paths (see below)
//   SITE_PASSWORD set   → all pages require a valid session
//
// Admin paths (/intel/admin, /api/intel/upload, /upload, /api/upload, /api/kgs/upload)
// always require a session. When ADMIN_PASSWORD is set they require an admin-role
// session specifically. When ADMIN_PASSWORD is unset a site-role session is also
// accepted (backward compat with the previous single-password setup).
//
// The MCP proxy token bypasses non-admin API paths only. It does NOT grant
// access to admin paths regardless of ADMIN_PASSWORD.
//
// Always-open paths:
//   /login, /api/auth/*          — the login flow itself
//   /api/cron/*                  — requires `Authorization: Bearer ${CRON_SECRET}` instead
//   /api/mcp, /api/mcp/*         — remote MCP endpoint stays public

/**
 * Returns true when the given raw (possibly percent-encoded) pathname refers
 * to an admin-only resource.
 *
 * Normalisation before matching:
 *  - decodeURIComponent  — prevents `/api/%75pload` from bypassing the check
 *  - toLowerCase         — prevents `/API/upload` from bypassing the check
 *  - collapse `//+` → `/`— prevents `//api//upload` tricks
 *  - strip trailing `/`  — treats `/upload/` the same as `/upload`
 *
 * On malformed percent-encoding, fail closed (treat as admin path).
 *
 * Segment matching (`=== base || startsWith(base + '/')`) ensures that
 * `/uploads-foo` is not admin while `/upload/x` is.
 */
function isAdminPath(raw: string): boolean {
  let p: string;
  try {
    p = decodeURIComponent(raw).toLowerCase().replace(/\/+/g, '/');
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  } catch {
    // Malformed percent-encoding — fail closed
    return true;
  }
  const eq = (base: string) => p === base || p.startsWith(base + '/');
  return (
    eq('/intel/admin') ||
    eq('/api/intel/upload') ||
    eq('/upload') ||
    eq('/api/upload') ||
    eq('/api/kgs/upload')
  );
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (pathname === '/login' || pathname.startsWith('/api/auth/')) return NextResponse.next();
  if (pathname === '/api/mcp' || pathname.startsWith('/api/mcp/')) return NextResponse.next();

  if (pathname.startsWith('/api/cron/')) {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization') ?? '';
    // Fail closed when CRON_SECRET is unset.
    if (secret && safeEqual(auth, `Bearer ${secret}`)) return NextResponse.next();
    return unauthorized();
  }

  const isApi = pathname.startsWith('/api/');
  const sessionRole = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (isAdminPath(pathname)) {
    // The MCP proxy token is NOT accepted on admin paths.
    // When ADMIN_PASSWORD is unset, a site-role session is sufficient (backward compat).
    const adminPasswordConfigured = Boolean(process.env.ADMIN_PASSWORD);
    const hasAccess =
      sessionRole === 'admin' || (!adminPasswordConfigured && sessionRole === 'site');
    if (hasAccess) return NextResponse.next();
    if (isApi) return unauthorized();
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Non-admin paths: public when SITE_PASSWORD is unset.
  if (!process.env.SITE_PASSWORD) return NextResponse.next();

  // SITE_PASSWORD is set: require any valid session.
  if (isApi) {
    const proxyToken = process.env.MCP_PROXY_TOKEN;
    const sent = req.headers.get(MCP_PROXY_HEADER);
    if (proxyToken && sent && safeEqual(sent, proxyToken)) return NextResponse.next();
  }

  if (sessionRole) return NextResponse.next();

  if (isApi) return unauthorized();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpe?g|gif|svg|webp|ico|css|js|map|woff2?|ttf)$).*)',
  ],
};
