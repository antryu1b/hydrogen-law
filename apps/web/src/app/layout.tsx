import type { Metadata } from 'next';
import './globals.css';
import { LogOut } from 'lucide-react';
import { BrandLink } from '@/components/BrandLink';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import { VisitorCounter } from '@/components/VisitorCounter';
import { Sidebar } from '@/components/nav/Sidebar';
import { MobileNav } from '@/components/nav/MobileNav';

export const metadata: Metadata = {
  title: '수전해 인텔리전스',
  description: '수전해 · 수소 법령 검색 · 경쟁사 분석 · 특허 동향 · 국가법령정보센터',
};

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
          {/* Desktop sidebar — fixed left column, hidden on mobile */}
          <aside className="fixed left-0 top-0 z-30 hidden h-full w-64 flex-col border-r border-border/70 bg-background md:flex overflow-y-auto">
            {/* Sidebar top accent line */}
            <div className="h-[3px] w-full shrink-0 bg-[hsl(var(--brass))]" aria-hidden="true" />
            <Sidebar />
          </aside>

          {/* Content area — shifted right on desktop to clear the fixed sidebar */}
          <div className="md:pl-64">
            {/* Header — gazette masthead with a thin brass top-rule */}
            <header className="sticky top-0 z-20 w-full border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
              <div className="h-[3px] w-full bg-[hsl(var(--brass))]" aria-hidden="true" />
              <div style={{ maxWidth: '90rem', margin: '0 auto', padding: '0 1.5rem' }}>
                <div className="flex h-16 items-center justify-between">
                  {/* Left: mobile menu button + brand */}
                  <div className="flex items-center gap-2">
                    <MobileNav />
                    <BrandLink />
                  </div>
                  {/* Right: controls only (nav links moved to sidebar) */}
                  <nav className="flex items-center gap-1 sm:gap-2">
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
              </div>
            </header>

            {/* Main Content */}
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
                    <p className="text-sm text-muted-foreground">
                      © 2026 수전해 인텔리전스 · 국가법령정보센터 기반
                    </p>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
