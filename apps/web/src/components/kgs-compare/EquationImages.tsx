'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, ChevronLeft, ChevronRight, X, Maximize2, ScanSearch } from 'lucide-react';
import type { EquationRegion } from './types';

// ---------------------------------------------------------------------------
// Inline equation / table region renderer
//
// Each scanned KGS formula/table region is precomputed offline with free
// Tesseract OCR (scripts/ocr-kgs.mjs → data/kgs_ocr.json). At render time:
//   - ocr_good === true  → show the recognized text (readable, selectable),
//     with the original scan one click away as the authoritative source.
//   - ocr_good !== true  → never show garbled OCR. Show a "원본 PDF에서 확인"
//     note that opens the source scan.
// This is a legal site, so wrong OCR is dangerous — low confidence always
// falls back to the authoritative source.
// ---------------------------------------------------------------------------

interface EquationImagesProps {
  code: string;
  equationRegions: EquationRegion[];
}

export function EquationImages({ code, equationRegions }: EquationImagesProps) {
  // "원본 보기" opens the FULL PDF page (complete context), not just the
  // cropped region — users reported the crop showed only a partial slice.
  const [pageView, setPageView] = useState<{ page: number } | null>(null);

  if (equationRegions.length === 0) return null;

  // OCR passed the gate → show the recognized text (it's real content).
  const goodOcr = equationRegions.filter((eq) => eq.ocr_good && eq.ocr_text);
  // OCR poor/absent → never show garbled text. Multiple such regions on the
  // same page are consolidated into ONE simple "원본 PDF 확인" note per page
  // (avoid showing N notes for N formulas).
  const fallbackPages = Array.from(
    new Set(
      equationRegions
        .filter((eq) => !(eq.ocr_good && eq.ocr_text))
        .map((eq) => eq.page)
    )
  ).sort((a, b) => a - b);

  return (
    <div className="mt-1.5 space-y-2">
      {goodOcr.map((eq) => (
        <OcrTextBlock
          key={eq.id}
          text={eq.ocr_text ?? ''}
          label={`수식/표 (p.${eq.page})`}
          onViewSource={() => setPageView({ page: eq.page })}
        />
      ))}

      {fallbackPages.map((page) => (
        <OcrFallback
          key={`fb-${page}`}
          page={page}
          label={`수식/표 (p.${page})`}
          onViewSource={() => setPageView({ page })}
        />
      ))}

      {pageView && (
        <PageImageModal
          code={code}
          pageStart={pageView.page}
          pageEnd={pageView.page}
          onClose={() => setPageView(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OCR text block — shown when OCR confidence passed the gate.
// Monospace + preserved line breaks so tables and formula legends keep their
// alignment. The original scan is one click away as the source of truth.
// ---------------------------------------------------------------------------

interface OcrTextBlockProps {
  text: string;
  label: string;
  onViewSource: () => void;
}

function OcrTextBlock({ text, label, onViewSource }: OcrTextBlockProps) {
  return (
    <figure className="m-0">
      <div className="rounded border border-[hsl(var(--brass))]/35 bg-[hsl(var(--parchment,var(--card)))] dark:bg-white/5">
        <pre
          className="m-0 px-3 py-2 text-[13px] leading-relaxed text-[hsl(var(--foreground))] whitespace-pre-wrap break-words overflow-x-auto"
          style={{ fontFamily: "'Pretendard', ui-monospace, 'SF Mono', monospace" }}
        >
          {text}
        </pre>
        <div className="flex items-center justify-between gap-2 px-3 py-1 border-t border-[hsl(var(--brass))]/20">
          <span className="text-[10px] text-muted-foreground">
            자동 인식 텍스트 · 원본 스캔이 기준입니다
          </span>
          <button
            type="button"
            onClick={onViewSource}
            title="원본 스캔 보기"
            aria-label={`${label} — 원본 스캔 보기`}
            className="inline-flex items-center gap-1 text-[10px] text-[hsl(var(--brass))] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brass))] rounded"
          >
            <ScanSearch className="w-3 h-3" />
            원본 확인
          </button>
        </div>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// OCR fallback — shown when OCR did NOT pass the gate. Never renders garbled
// text. Directs the reader to the authoritative source scan.
// ---------------------------------------------------------------------------

interface OcrFallbackProps {
  page: number;
  label: string;
  onViewSource: () => void;
}

function OcrFallback({ page, label, onViewSource }: OcrFallbackProps) {
  return (
    <figure className="m-0">
      <button
        type="button"
        onClick={onViewSource}
        title="원본 스캔 보기"
        aria-label={`${label} — 원본 스캔에서 확인`}
        className="group flex w-full items-center gap-2 rounded border border-dashed border-[hsl(var(--brass))]/40 bg-[hsl(var(--brass))]/[0.04] px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--brass))]/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brass))]"
      >
        <FileText className="w-4 h-4 flex-shrink-0 text-[hsl(var(--brass))]" />
        <span className="flex-1 text-xs text-[hsl(var(--foreground))]/80">
          📄 이 부분(수식/표)은 원본 PDF에서 확인하세요{' '}
          <span className="text-muted-foreground">(p.{page})</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-[hsl(var(--brass))] group-hover:underline">
          <Maximize2 className="w-3 h-3" />
          원본 보기
        </span>
      </button>
    </figure>
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
