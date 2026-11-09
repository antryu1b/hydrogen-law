import type { Metadata } from 'next';
import { Lock } from 'lucide-react';
import { safeNextPath } from '@/lib/auth';

export const metadata: Metadata = { title: '로그인 · 수소법령 검색' };

const ERRORS: Record<string, string> = {
  invalid: '비밀번호가 올바르지 않습니다.',
  config: '서버 인증 설정(SITE_PASSWORD / SESSION_SECRET)이 없습니다. 관리자에게 문의하세요.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = safeNextPath(next);
  const message = error ? ERRORS[error] ?? ERRORS.invalid : null;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border/80 bg-card p-8 shadow-[0_1px_2px_-1px_hsl(var(--primary)/0.12),0_4px_16px_-8px_hsl(var(--primary)/0.10)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-[hsl(var(--brass)/0.4)] bg-[hsl(var(--brass)/0.12)] text-[hsl(var(--brass))]">
            <Lock className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <h1 className="font-display text-xl font-bold tracking-tight">로그인</h1>
          <p className="mt-1 text-sm text-muted-foreground">공유 비밀번호를 입력하세요.</p>
        </div>
        <form method="post" action="/api/auth/login" className="space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          <label className="block">
            <span className="sr-only">비밀번호</span>
            <input
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              placeholder="비밀번호"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
          <button
            type="submit"
            className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            들어가기
          </button>
        </form>
      </div>
    </div>
  );
}
