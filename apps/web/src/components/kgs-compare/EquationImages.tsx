'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, ChevronLeft, ChevronRight, X, Maximize2 } from 'lucide-react';
import type { EquationRegion } from './types';

// ---------------------------------------------------------------------------
// Inline equation / table image strip
//
// Scanned KGS formulas & tables are rendered server-side at 150 DPI, so a
// native crop can be anywhere from ~60px (a single symbol) to ~870px wide and
// ~1380px tall (a full-page table or stacked block).
//
// Sizing rule (cap HEIGHT, not WIDTH):
//   Appendix formulas are typically short-and-wide single lines (e.g. a
//   ~560×210 CHSS block, or a 460×22 table row at aspect ratio ~10). A hard
//   WIDTH cap (the old 420px) shrank these to illegible thin strips — a wide
//   line forced to 420px became a few-pixel-tall bar. The width was never the
//   problem; tall full-page scans dominating the column were. So we let crops
//   take the full container width (max-w-full) and instead bound HEIGHT.
//   - Wide single-line formulas now render at the column width → readable.
//   - A crop wider than the column horizontally scrolls (overflow-x-auto)
//     instead of being squished.
//   - Tall multi-line / full-page scans stay bounded by the height cap, and
//     click-to-zoom still reveals full detail.
// ---------------------------------------------------------------------------

/**
 * Inline figure height cap — tall scans stay bounded so they don't dominate the
 * body column, while width is free (max-w-full) so wide formulas read clearly.
 */
const INLINE_MAX_HEIGHT = 300; // px — tall stacked equations / full-page scans stay compact

interface EquationImagesProps {
  code: string;
  equationRegions: EquationRegion[];
}

export function EquationImages({ code, equationRegions }: EquationImagesProps) {
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);

  if (equationRegions.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-2">
      {equationRegions.map((eq) => {
        const bboxStr = eq.bbox.join(',');
        const src = `/api/kgs/eq-image?code=${code}&page=${eq.page}&bbox=${bboxStr}`;
        const label = `수식/표 영역 ${eq.id} (p.${eq.page})`;
        return (
          <figure key={eq.id} className="m-0">
            {/* Horizontal-scroll wrapper: wide tables scroll instead of overflowing/clipping */}
            <div className="overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setZoom({ src, label })}
                title="클릭하여 확대"
                aria-label={`${label} — 클릭하여 확대`}
                className="group relative inline-block rounded border border-muted/50 bg-white dark:bg-white/5 p-0.5 cursor-zoom-in transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brass))]"
              >
                <img
                  src={src}
                  alt={label}
                  loading="lazy"
                  className="block object-contain max-w-full"
                  style={{
                    maxHeight: `${INLINE_MAX_HEIGHT}px`,
                    width: 'auto',
                    height: 'auto',
                    imageRendering: 'crisp-edges',
                  }}
                />
                {/* Zoom affordance — appears on hover/focus */}
                <span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 rounded bg-[hsl(var(--primary))]/80 text-[hsl(var(--primary-foreground))] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                  <Maximize2 className="w-3 h-3" />
                </span>
              </button>
            </div>
          </figure>
        );
      })}

      {zoom && (
        <EquationZoomModal
          src={zoom.src}
          label={zoom.label}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Equation crop zoom modal — shows the cropped formula/table at full detail.
// (Distinct from the full PDF-page modal below.)
// ---------------------------------------------------------------------------

interface EquationZoomModalProps {
  src: string;
  label: string;
  onClose: () => void;
}

function EquationZoomModal({ src, label, onClose }: EquationZoomModalProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="relative bg-background rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            aria-label="닫기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Scroll both axes so even very large crops are fully reachable */}
        <div className="flex-1 overflow-auto p-4 flex items-start justify-center bg-white dark:bg-white/5">
          <img
            src={src}
            alt={label}
            className="max-w-none"
            style={{ imageRendering: 'crisp-edges' }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PDF full-page viewer modal (no Radix Dialog — plain overlay to avoid dep issues)
// ---------------------------------------------------------------------------

interface PageImageModalProps {
  code: string;
  pageStart: number;
  pageEnd: number;
  onClose: () => void;
}

export function PageImageModal({ code, pageStart, pageEnd, onClose }: PageImageModalProps) {
  const [currentPage, setCurrentPage] = useState(pageStart);
  const [imgSrc, setImgSrc] = useState('');

  useEffect(() => {
    setImgSrc(`/api/kgs/page-image?code=${code}&page=${currentPage}`);
  }, [code, currentPage]);

  // Close on Escape
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );
  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const canPrev = currentPage > pageStart;
  const canNext = currentPage < pageEnd;

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Modal box — stop click propagation so clicks inside don't close */}
      <div
        className="relative bg-background rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileText className="w-4 h-4 text-[#0d9488]" />
            <span className="font-mono text-[#0d9488]">{code}</span>
            <span className="text-muted-foreground">페이지 {currentPage}</span>
            <span className="text-muted-foreground text-xs">
              ({pageStart}–{pageEnd})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(pageStart, p - 1))}
              disabled={!canPrev}
              className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="이전 페이지"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(pageEnd, p + 1))}
              disabled={!canNext}
              className="p-1.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="다음 페이지"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Page image */}
        <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
          {imgSrc && (
            <img
              key={imgSrc}
              src={imgSrc}
              alt={`${code} 페이지 ${currentPage}`}
              className="max-w-full shadow-sm border border-muted/30"
              style={{ imageRendering: 'auto' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "PDF 페이지 보기" trigger button
// ---------------------------------------------------------------------------

interface PageViewButtonProps {
  code: string;
  pageStart: number;
  pageEnd: number;
}

export function PageViewButton({ code, pageStart, pageEnd }: PageViewButtonProps) {
  const [open, setOpen] = useState(false);

  if (!pageStart || !pageEnd) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[10px] text-[#0d9488] hover:underline mt-1"
      >
        <FileText className="w-3 h-3" />
        PDF 페이지 보기 (p.{pageStart}–{pageEnd})
      </button>
      {open && (
        <PageImageModal
          code={code}
          pageStart={pageStart}
          pageEnd={pageEnd}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
