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
 * Logo: blue HTWO mark only (cut from the official SVG, no wordmark);
 * the brand blue reads on both light and dark themes.
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
      <Image
        src="/htwo-mark.svg"
        alt="HTWO"
        width={37}
        height={29}
        style={{ height: '26px', width: 'auto' }}
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
