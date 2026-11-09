import { NextResponse, type NextRequest } from 'next/server';
import { MCP_PROXY_HEADER, SESSION_COOKIE, safeEqual, verifySessionToken } from '@/lib/auth';

// Site-wide gate. Everything requires a valid session cookie except:
//   /login, /api/auth/*          — the login flow itself
//   /api/cron/*                  — requires `Authorization: Bearer ${CRON_SECRET}` instead (Vercel Cron)
//   /api/mcp                     — remote MCP endpoint stays public for existing integrations
//   static assets                — excluded via `config.matcher`
// /api/* also accepts `x-mcp-proxy-token: ${MCP_PROXY_TOKEN}` so the MCP proxies
// (mcp-server/ and /api/mcp itself) can keep calling the deployed API routes.

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

  if (isApi) {
    const proxyToken = process.env.MCP_PROXY_TOKEN;
    const sent = req.headers.get(MCP_PROXY_HEADER);
    if (proxyToken && sent && safeEqual(sent, proxyToken)) return NextResponse.next();
  }

  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

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
