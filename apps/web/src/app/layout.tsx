import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Scale } from 'lucide-react';
import { BrandLink } from '@/components/BrandLink';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { VisitorCounter } from '@/components/VisitorCounter';

export const metadata: Metadata = {
  title: '수소법령 검색',
  description: '수소·고압가스 법령 검색 시스템 · 국가법령정보센터',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased bg-background">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Header — gazette masthead with a thin brass top-rule */}
          <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
            <div className="h-[3px] w-full bg-[hsl(var(--brass))]" aria-hidden="true" />
            <div style={{ maxWidth: '90rem', margin: '0 auto', padding: '0 1.5rem' }}>
              <div className="flex h-16 items-center justify-between">
                <BrandLink />
                <nav className="flex items-center gap-1 sm:gap-2">
                  <Link
                    href="/kgs-compare"
                    className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:block"
                  >
                    본문 비교
                  </Link>
                  <Link
                    href="/integrate"
                    className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:block"
                  >
                    통합 요건(교차참조)
                  </Link>
                  <Link
                    href="/kgs-family"
                    className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:block"
                  >
                    기술기준 분류
                  </Link>
                  <Link
                    href="/forms/industrial-convergence"
                    className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:block"
                  >
                    별표·서식
                  </Link>
                  <VisitorCounter />
                  <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
                  <ThemeToggle />
                </nav>
              </div>
            </div>
          </header>

          {/* Main Content - Wider Container for Search Results */}
          <main className="min-h-screen">
            <div style={{ maxWidth: '90rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
              {children}
            </div>
          </main>

          {/* Footer — restrained gazette colophon */}
          <footer className="mt-8 border-t border-border/70 bg-secondary/40">
            <div style={{ maxWidth: '90rem', margin: '0 auto', padding: '0 1.5rem' }}>
              <div className="flex flex-col items-start justify-between gap-3 py-8 md:flex-row md:items-center">
                <div className="flex items-center gap-3">
                  <Scale className="h-4 w-4 text-[hsl(var(--brass))]" strokeWidth={1.75} />
                  <p className="text-sm text-muted-foreground">
                    © 2026 수소법령 검색 · 국가법령정보센터 기반
                  </p>
                </div>
                <p className="text-xs text-muted-foreground/60">
                  Built by 유성필 · 수소인프라개발팀
                </p>
              </div>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
