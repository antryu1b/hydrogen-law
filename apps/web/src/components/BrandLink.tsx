'use client';

import Link from 'next/link';

export function BrandLink() {
  return (
    <Link
      href="/"
      className="group flex items-center gap-2 transition-opacity hover:opacity-80"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('hl-go-home'));
        }
      }}
    >
      {/* HTWO mark — teal SVG from /public */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/htwo-mark.svg"
        alt="HTWO"
        className="h-[22px] w-auto"
        aria-hidden="true"
      />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[13px] font-bold tracking-tight text-foreground">
          HTWO
        </span>
        <span className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          FUEL CELL
        </span>
      </span>
    </Link>
  );
}
