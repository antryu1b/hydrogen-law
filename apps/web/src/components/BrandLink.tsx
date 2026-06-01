'use client';

import Link from 'next/link';
import { Scale } from 'lucide-react';

/**
 * Header brand "수소법령 검색" — Client Component so we can
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
      className="group flex items-center gap-2.5 transition-opacity hover:opacity-80"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('hl-go-home'));
        }
      }}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[hsl(var(--brass)/0.4)] bg-[hsl(var(--brass)/0.12)] text-[hsl(var(--brass))] transition-colors group-hover:bg-[hsl(var(--brass)/0.18)]">
        <Scale className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-[15px] font-bold tracking-tight text-foreground sm:text-base">
          수소법령 검색
        </span>
        <span className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:block">
          수소 · 고압가스 안전 법령
        </span>
      </span>
    </Link>
  );
}
