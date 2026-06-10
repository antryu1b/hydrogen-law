'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { KGS_FAMILIES, CODE_TO_FAMILY } from '@/data/kgs-families-display';
import { kgsCodesData } from '@/data/kgs-codes-data';
import type { CanonicalTocData, CanonicalFamily, ViewMode } from '@/components/kgs-compare/types';
import { ViewA } from '@/components/kgs-compare/ViewA';
import { ViewB } from '@/components/kgs-compare/ViewB';
import { ViewC } from '@/components/kgs-compare/ViewC';
import { MarineCompare } from '@/components/marine-compare/MarineCompare';

// Code metadata from existing data
const ALL_CODES = kgsCodesData.codes.map((c) => ({
  code: c.code,
  name: c.name,
  category: c.category,
}));

// 최상위 분야(domain) — KGS CODE(가스·수소) / 선박 / 항공(예정)
type Domain = 'kgs' | 'marine' | 'air';

function getFamilyLabel(familyId: string) {
  if (familyId === 'A') return 'A 제조';
  if (familyId === 'B') return 'B 시설';
  if (familyId === 'C') return 'C 재검사';
  return familyId;
}

function KgsComparePage() {
  const searchParams = useSearchParams();

  // State
  const [domain, setDomain] = useState<Domain>('kgs'); // 최상위 분야 탭
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [activeFamilyFilter, setActiveFamilyFilter] = useState<string | null>(null); // null = all (KGS 패밀리 2차 필터)
  const [viewMode, setViewMode] = useState<ViewMode>('A');
  const [tocData, setTocData] = useState<CanonicalTocData | null>(null);
  const [tocLoading, setTocLoading] = useState(true);

  // Preselect codes from URL query params (?codes=FP217,FP216,FU212)
  useEffect(() => {
    const codesParam = searchParams.get('codes');
    if (codesParam) {
      const codes = codesParam
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter((c) => ALL_CODES.some((ac) => ac.code === c))
        .slice(0, 5);
      setSelectedCodes(codes);
    }
  }, [searchParams]);

  // Load canonical TOC once
  const loadToc = useCallback(async () => {
    setTocLoading(true);
    try {
      const res = await fetch('/api/kgs/canonical-toc');
      if (res.ok) setTocData(await res.json());
    } catch {
      // silently fail; page still usable without TOC
    } finally {
      setTocLoading(false);
    }
  }, []);

  useEffect(() => { loadToc(); }, [loadToc]);

  // Detect cross-family selection
  const selectedFamilies = [...new Set(selectedCodes.map((c) => CODE_TO_FAMILY[c]).filter(Boolean))];
  const isCrossFamily = selectedFamilies.length > 1;

  // Filter codes for picker — KGS 도메인 한정. 선택된 패밀리가 있으면 그 패밀리,
  // 없으면(전체) 선박을 제외한 모든 가스·수소 코드.
  const codesForPicker = activeFamilyFilter
    ? ALL_CODES.filter((c) => CODE_TO_FAMILY[c.code] === activeFamilyFilter)
    : ALL_CODES.filter((c) => c.category !== '선박');

  // Toggle code selection
  function toggleCode(code: string) {
    setSelectedCodes((prev) => {
      // In View C mode, enforce max 2
      if (viewMode === 'C') {
        if (prev.includes(code)) return prev.filter((c) => c !== code);
        if (prev.length >= 2) return [prev[1], code]; // replace oldest
        return [...prev, code];
      }
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 5) return prev;
      return [...prev, code];
    });
  }

  // When switching to View C, trim to 2 codes
  function switchViewMode(mode: ViewMode) {
    setViewMode(mode);
    if (mode === 'C' && selectedCodes.length > 2) {
      setSelectedCodes((prev) => prev.slice(0, 2));
    }
  }

  // Get families from TOC data, filtered to relevant codes
  const tocFamilies: CanonicalFamily[] = tocData?.families ?? [];

  // Active family filter for View A sidebar — use activeFamilyFilter if set
  const viewAFamilyId = activeFamilyFilter;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">기술기준 본문 비교</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {domain === 'marine'
            ? '선박 기술기준 두 표준(해수부 잠정기준 · 한국선급 지침)의 본문을 주제별로 대조합니다.'
            : 'KGS CODE(가스·수소)를 분야별로 골라 본문을 나란히 비교합니다. 최대 5개 (View C는 2개 고정)'}
        </p>
      </div>

      {/* 1차 행 — 최상위 분야(domain) 탭 */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {([
          { id: 'kgs' as Domain, label: 'KGS CODE', disabled: false },
          { id: 'marine' as Domain, label: '⚓ 선박 기술기준', disabled: false },
          { id: 'air' as Domain, label: '✈ 항공 (예정)', disabled: true },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setDomain(tab.id)}
            disabled={tab.disabled}
            className={[
              'px-4 py-2 text-sm font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0',
              tab.disabled
                ? 'border-transparent text-muted-foreground/40 cursor-not-allowed'
                : domain === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {domain === 'marine' ? (
        <MarineCompare />
      ) : (
      <>
      {/* 2차 행 — KGS 패밀리 서브 필터 (domain === 'kgs' 일 때만) */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {[
          { id: null as string | null, label: '전체 (가스·수소)' },
          ...KGS_FAMILIES.map((f) => ({ id: f.id as string | null, label: `${f.id} ${f.shortLabel}` })),
        ].map((tab) => (
          <button
            key={tab.id ?? 'all'}
            onClick={() => setActiveFamilyFilter(tab.id)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0',
              activeFamilyFilter === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Code picker */}
      <div className="border rounded-lg p-3">
        <p className="text-xs text-muted-foreground mb-2">
          코드 선택 {viewMode === 'C' ? '(View C: 최대 2개)' : '(최대 5개)'}
          {selectedCodes.length > 0 && (
            <button
              onClick={() => setSelectedCodes([])}
              className="ml-3 text-xs text-red-500 hover:underline"
            >
              전체 해제
            </button>
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {codesForPicker.map((c) => {
            const isSelected = selectedCodes.includes(c.code);
            const familyId = CODE_TO_FAMILY[c.code];
            const isDisabled =
              !isSelected &&
              (viewMode === 'C' ? selectedCodes.length >= 2 : selectedCodes.length >= 5);
            return (
              <button
                key={c.code}
                onClick={() => !isDisabled && toggleCode(c.code)}
                disabled={isDisabled}
                className={[
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : isDisabled
                    ? 'border-muted bg-muted/20 text-muted-foreground cursor-not-allowed'
                    : 'border-border hover:border-primary/50 hover:bg-muted',
                ].join(' ')}
              >
                <span className="font-mono font-bold text-xs">{c.code}</span>
                {familyId && (
                  <span className={[
                    'text-[10px] px-1 py-0 rounded-full',
                    isSelected ? 'bg-primary/20' : 'bg-muted',
                  ].join(' ')}>
                    {getFamilyLabel(familyId)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground max-w-[180px] truncate hidden sm:block">
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected codes display */}
      {selectedCodes.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">선택됨:</span>
          {selectedCodes.map((code) => {
            const familyId = CODE_TO_FAMILY[code];
            const codeMeta = ALL_CODES.find((c) => c.code === code);
            return (
              <span
                key={code}
                className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium"
              >
                <span className="font-mono">{code}</span>
                {familyId && <span className="text-[10px]">({getFamilyLabel(familyId)})</span>}
                {codeMeta && <span className="text-muted-foreground hidden sm:inline"> {codeMeta.name.slice(0, 15)}{codeMeta.name.length > 15 ? '…' : ''}</span>}
                <button
                  onClick={() => toggleCode(code)}
                  className="ml-0.5 hover:text-red-500 transition-colors"
                  aria-label={`${code} 해제`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Cross-family warning */}
      {isCrossFamily && (
        <div className="flex items-start gap-2 border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            다른 패밀리 코드가 섞여 있습니다 ({selectedFamilies.map(getFamilyLabel).join(' + ')}).
            같은 sec_no라도 목차 구조가 다를 수 있어 본문 의미가 다를 수 있습니다.
          </p>
        </div>
      )}

      {/* View mode tabs */}
      <div className="flex gap-1 bg-muted/30 rounded-lg p-1 w-full sm:w-fit">
        {(['A', 'B', 'C'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => switchViewMode(mode)}
            className={[
              'flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
              viewMode === mode
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {mode === 'A' && (<><span className="sm:hidden">A 목차</span><span className="hidden sm:inline">A 목차 사이드바</span></>)}
            {mode === 'B' && (<><span className="sm:hidden">B 정렬</span><span className="hidden sm:inline">B 자동 정렬</span></>)}
            {mode === 'C' && (<><span className="sm:hidden">C split</span><span className="hidden sm:inline">C 좌우 split</span></>)}
          </button>
        ))}
      </div>

      {/* View content */}
      {tocLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>목차 불러오는 중...</span>
        </div>
      ) : (
        <div>
          {viewMode === 'A' && (
            <ViewA
              selectedCodes={selectedCodes}
              families={tocFamilies}
              activeFamilyId={viewAFamilyId}
            />
          )}
          {viewMode === 'B' && (
            <ViewB
              selectedCodes={selectedCodes}
              families={tocFamilies}
            />
          )}
          {viewMode === 'C' && (
            <ViewC
              selectedCodes={selectedCodes}
              families={tocFamilies}
            />
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>불러오는 중...</span>
        </div>
      }
    >
      <KgsComparePage />
    </Suspense>
  );
}
