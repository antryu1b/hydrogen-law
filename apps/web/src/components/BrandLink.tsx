'use client';

import Link from 'next/link';
import Image from 'next/image';

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
      <span className="flex h-8 items-center justify-center rounded-md border border-[hsl(var(--brass)/0.4)] bg-[hsl(var(--brass)/0.12)] px-1.5 transition-colors group-hover:bg-[hsl(var(--brass)/0.18)]">
        <Image
          src="/icon.png"
          alt="HTWO"
          width={24}
          height={24}
          className="h-5 w-5"
          priority
        />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-[15px] font-bold tracking-tight text-foreground sm:text-base">
          수소·고압가스 법령 검색
        </span>
      </span>
    </Link>
  );
}
