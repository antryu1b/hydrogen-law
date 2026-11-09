'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './Sidebar';

/**
 * Mobile navigation: hamburger button (shown in header on small screens)
 * + slide-in sidebar drawer with overlay.
 *
 * Renders two things via React Fragment:
 * 1. The menu toggle button (inline in header flow, hidden on md+)
 * 2. When open: a fixed overlay + drawer
 */
export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  // Close on Esc
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // Trap focus scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const drawerId = 'mobile-nav-drawer';

  return (
    <>
      {/* Hamburger button — visible only on mobile (<md) */}
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        aria-label="메뉴 열기"
        aria-expanded={isOpen}
        aria-controls={drawerId}
        className="md:hidden rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} />
      </button>

      {/* Drawer + overlay — portaled to document.body so fixed height is not
          constrained by the header's backdrop-filter containing block */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50"
            aria-hidden="true"
            onClick={close}
          />

          {/* Drawer panel */}
          <div
            id={drawerId}
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="내비게이션 메뉴"
            className="fixed left-0 top-0 z-50 h-screen w-64 bg-background border-r border-border/70 shadow-xl overflow-y-auto"
          >
            {/* Brass accent line */}
            <div className="h-[3px] w-full shrink-0 bg-[hsl(var(--brass))]" aria-hidden="true" />
            {/* Drawer header with close button */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
              <span className="text-sm font-semibold text-foreground">메뉴</span>
              <button
                type="button"
                onClick={close}
                aria-label="메뉴 닫기"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            {/* Sidebar content */}
            <Sidebar onItemClick={close} />
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
