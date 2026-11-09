import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  authConfigured,
  checkPassword,
  createSessionToken,
  safeNextPath,
} from '@/lib/auth';

export const runtime = 'nodejs';

// POST form from /login → sets the signed session cookie and redirects to `next`.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const password = typeof form?.get('password') === 'string' ? (form.get('password') as string) : '';
  const next = safeNextPath(typeof form?.get('next') === 'string' ? (form.get('next') as string) : '/');

  const back = (error: string) => {
    const url = new URL('/login', req.url);
    url.searchParams.set('error', error);
    url.searchParams.set('next', next);
    return NextResponse.redirect(url, 303);
  };

  if (!authConfigured()) return back('config');
  if (!password || !(await checkPassword(password))) return back('invalid');

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  });
  return res;
}
