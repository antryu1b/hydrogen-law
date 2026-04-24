import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata: Metadata = {
  title: '어플리케이션개발2팀 법령 검색',
  description: '어플리케이션개발2팀 법령 검색 시스템 · 국가법령정보센터',
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
          {/* Header - Full Width */}
          <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div style={{ maxWidth: '90rem', margin: '0 auto', padding: '0 1.5rem' }}>
              <div className="flex h-16 items-center justify-between">
                <Link href="/" className="flex items-center gap-2 font-bold text-xl hover:opacity-80 transition-opacity">
                  <span className="text-2xl">⚖️</span>
                  <span>어플리케이션개발2팀 법령 검색</span>
                </Link>
                <div className="flex items-center gap-4">
                  <Link href="/compliance-check" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
                    컴플라이언스 체크
                  </Link>
                  <Link href="/upload" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
                    법령 업로드
                  </Link>
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </header>

          {/* Main Content - Wider Container for Search Results */}
          <main className="min-h-screen">
            <div style={{ maxWidth: '90rem', margin: '0 auto', padding: '2rem 1.5rem' }}>
              {children}
            </div>
          </main>

          {/* Footer - Full Width */}
          <footer className="border-t py-8">
            <div style={{ maxWidth: '90rem', margin: '0 auto', padding: '0 1.5rem' }}>
              <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                <p className="text-sm text-muted-foreground">
                  © 2026 어플리케이션개발2팀 법령 검색. 국가법령정보센터 기반.
                </p>
                <p className="text-xs text-muted-foreground">
                  LLM 최소화 접근법 • 빠르고 정확한 법률 검색
                </p>
              </div>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
