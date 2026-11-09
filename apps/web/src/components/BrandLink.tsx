'use client';

import Link from 'next/link';
import Image from 'next/image';

/**
 * Header brand "수전해 인텔리전스" — Client Component so we can
 * attach an onClick that bridges to the SPA state on page.tsx.
 *
 * Link href="/" alone is a no-op when already at /, so the results view stays.
 * Dispatching 'hl-go-home' lets page.tsx reset viewState / results / query /
 * scopeLaw / searchStack back to landing.
 *
 * Logo: HTWO (Hyundai Motor Group) official SVG.
 * Light theme → htwo-logo-black.svg (dark text on light bg).
 * Dark theme  → htwo-logo-white.svg (white text on dark bg).
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
      {/* Light theme logo */}
      <Image
        src="/htwo-logo-black.svg"
        alt="HTWO"
        width={96}
        height={30}
        className="block dark:hidden"
        style={{ height: '30px', width: 'auto' }}
        priority
      />
      {/* Dark theme logo */}
      <Image
        src="/htwo-logo-white.svg"
        alt="HTWO"
        width={96}
        height={30}
        className="hidden dark:block"
        style={{ height: '30px', width: 'auto' }}
        priority
      />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[15px] font-bold tracking-tight text-foreground sm:text-base">
          수전해 인텔리전스
        </span>
        <span className="mt-0.5 hidden text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:block">
          수소 법령 · 수전해 동향
        </span>
      </span>
    </Link>
  );
}
