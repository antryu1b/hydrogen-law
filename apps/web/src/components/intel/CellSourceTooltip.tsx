'use client';

import { useCallback, useRef, useState } from 'react';
// Import only client-safe modules: '@/lib/intel' transitively pulls in
// node:crypto via competitor-watch, which cannot enter this client bundle.
import type { IntelLink } from '@/lib/intel';
import { safeHref } from '@/lib/intel-utils';

interface TooltipPos {
  top: number;
  left: number;
}

/**
 * Shows a fixed-position tooltip with source links when the user hovers or
 * focuses the ⓘ trigger. Using position:fixed lets it escape the table's
 * overflow-x-auto container without clipping.
 *
 * Keyboard flow:
 *   Tab → trigger gets focus → tooltip opens
 *   Tab again → focus moves to first <a> inside floating panel (DOM child of outer span)
 *   Enter on link → navigates (new tab)
 *   Tab past last link → focus leaves outer span → tooltip closes
 */
export function CellSourceTooltip({ links }: { links: IntelLink[] }) {
  const valid = links.filter((l) => safeHref(l.url));

  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const open = useCallback(() => {
    clearTimeout(closeTimer.current);
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  }, []);

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setPos(null), 80);
  }, []);

  const cancelClose = useCallback(() => clearTimeout(closeTimer.current), []);

  if (!valid.length) return null;

  return (
    <span
      ref={triggerRef}
      className="ml-0.5 inline-block align-middle"
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
      onFocus={open}
      onBlur={scheduleClose}
    >
      {/* Trigger: focusable ⓘ icon */}
      <span
        tabIndex={0}
        aria-label={`출처: ${valid.map((l) => l.label).join(' · ')}`}
        className="cursor-help rounded text-[9px] text-muted-foreground/40 hover:text-[hsl(var(--brass))] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        ⓘ
      </span>
      {/* Floating panel — fixed to viewport, z-50 above header (z-30) */}
      {pos && (
        <span
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 flex w-max max-w-[220px] flex-col gap-1 rounded-md border border-border bg-background p-2 text-[11px] shadow-md"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {valid.map((l, i) => (
            <a
              key={i}
              href={safeHref(l.url)!}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden text-ellipsis whitespace-nowrap text-[hsl(var(--brass))] underline-offset-2 hover:underline"
            >
              {l.label}
            </a>
          ))}
        </span>
      )}
    </span>
  );
}
