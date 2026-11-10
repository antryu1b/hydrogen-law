import type { Metadata } from 'next';
import './globals.css';
import { LogOut, Scale } from 'lucide-react';
import { BrandLink } from '@/components/BrandLink';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { VisitorCounter } from '@/components/VisitorCounter';
import { Sidebar } from '@/components/nav/Sidebar';
import { MobileNav } from '@/components/nav/MobileNav';

export const metadata: Metadata = {
  title: '수전해 인텔리전스',
  description: '수전해 · 수소 법령 검색 · 경쟁사 분석 · 특허 동향 · 국가법령정보센터',
  openGraph: { siteName: '수전해 인텔리전스' },
};

// Header height: 3px brass rule + 53px content = 56px total
const HEADER_H = 56;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const loginEnabled = !!process.env.SITE_PASSWORD;

  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="antialiased bg-background">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-screen flex-col">
            {/* Full-width sticky header — 3px brass + 53px content = 56px total */}
            <header className="sticky top-0 z-30 w-full border-b border-border/70 bg-background">
              <div className="h-[3px] w-full bg-[hsl(var(--brass))]" aria-hidden="true" />
              <div className="flex h-[53px] items-center">
                {/* Left zone: matches sidebar width on desktop; logo aligns with sidebar items */}
                <div className="flex items-center gap-2 pl-3 pr-2 md:w-64 md:shrink-0 md:pl-5">
                  <MobileNav />
                  <BrandLink />
                </div>
                {/* Right zone: utility controls */}
                <nav className="flex flex-1 items-center justify-end gap-1 pr-4 sm:gap-2 sm:pr-6">
                  <VisitorCounter />
                  <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
                  <ThemeToggle />
                  {loginEnabled && (
                    <form method="post" action="/api/auth/logout">
                      <button
                        type="submit"
                        title="로그아웃"
                        aria-label="로그아웃"
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <LogOut className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </form>
                  )}
                </nav>
              </div>
            </header>

            {/* Below header: sidebar + content row */}
            <div className="flex flex-1">
              {/* Desktop sidebar — sticky below header, hidden on mobile */}
              <aside
                className="hidden md:flex w-64 shrink-0 flex-col border-r border-border/70 bg-background overflow-hidden"
                style={{
                  position: 'sticky',
                  top: `${HEADER_H}px`,
                  height: `calc(100vh - ${HEADER_H}px)`,
                }}
              >
                <Sidebar />
              </aside>

              {/* Page content + footer */}
              <div className="flex flex-1 flex-col min-w-0">
                <main className="flex-1">
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
                          © 2026 수전해 인텔리전스 · 국가법령정보센터 기반
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground/60">
                        Built by 유성필 · 수소인프라개발팀
                      </p>
                    </div>
                  </div>
                </footer>
              </div>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
