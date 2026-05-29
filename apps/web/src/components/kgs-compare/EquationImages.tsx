'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { EquationRegion } from './types';

// ---------------------------------------------------------------------------
// Inline equation image strip
// ---------------------------------------------------------------------------

interface EquationImagesProps {
  code: string;
  equationRegions: EquationRegion[];
}

export function EquationImages({ code, equationRegions }: EquationImagesProps) {
  if (equationRegions.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-1.5">
      {equationRegions.map((eq) => {
        const bboxStr = eq.bbox.join(',');
        const src = `/api/kgs/eq-image?code=${code}&page=${eq.page}&bbox=${bboxStr}`;
        return (
          <img
            key={eq.id}
            src={src}
            alt={`수식 영역 ${eq.id}`}
            loading="lazy"
            className="max-w-full object-contain rounded border border-muted/40 bg-white dark:bg-white/5"
            style={{ display: 'block', imageRendering: 'crisp-edges' }}
          />
        );
      })}
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
