'use client';

import Link from 'next/link';
import { Scale } from 'lucide-react';

/**
 * Header brand "어플리케이션개발2팀 법령 검색" — Client Component so we can
 * attach an onClick that bridges to the SPA state on page.tsx.
 *
 * Link href="/" alone is a no-op when already at /, so the results view stays.
 * Dispatching 'hl-go-home' lets page.tsx reset viewState / results / query /
 * scopeLaw / searchStack back to landing.
 */
export function BrandLink() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 font-semibold text-lg hover:opacity-75 transition-opacity"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('hl-go-home'));
        }
      }}
    >
      <Scale className="w-5 h-5 text-foreground/70" strokeWidth={1.75} />
      <span className="tracking-tight">어플리케이션개발2팀 법령 검색</span>
    </Link>
  );
}
