'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { CanonicalFamily, CanonicalTocEntry, SectionBody } from './types';
import { CODE_TO_FAMILY } from '@/data/kgs-families-display';

interface InlineBodyCompareProps {
  selectedCodes: string[];
}

function SectionBodyColumn({
  code,
  secNo,
  tocEntry,
}: {
  code: string;
  secNo: string;
  tocEntry: CanonicalTocEntry;
}) {
  const [data, setData] = useState<SectionBody | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const codeEntry = tocEntry.codes[code];
  const isPresent = codeEntry?.present ?? false;

  const fetchBody = useCallback(async () => {
    if (!isPresent) return;
    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch(
        `/api/kgs/section-body?code=${code}&sec_no=${encodeURIComponent(secNo)}`
      );
      if (res.status === 404) {
        setNotFound(true);
        setData(null);
      } else if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [code, secNo, isPresent]);

  useEffect(() => {
    setData(null);
    setNotFound(false);
    fetchBody();
  }, [fetchBody]);

  if (!isPresent) {
    return <p className="text-xs text-muted-foreground italic">해당 섹션 없음</p>;
  }
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span className="text-xs">불러오는 중...</span>
      </div>
    );
  }
  if (notFound) {
    return <p className="text-xs text-muted-foreground italic">데이터 없음</p>;
  }
  if (data?.is_umbrella || (data && data.body_chars === 0)) {
    return <p className="text-xs text-muted-foreground italic">(상위 헤더, 본문 없음)</p>;
  }
  if (data) {
    return (
      <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{data.body}</pre>
    );
  }
  return null;
}

/** Detect the dominant family among selected codes (most common family id). */
function detectDominantFamily(codes: string[]): string | null {
  const counts: Record<string, number> = {};
  for (const code of codes) {
    const fid = CODE_TO_FAMILY[code];
    if (fid) counts[fid] = (counts[fid] ?? 0) + 1;
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [fid, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = fid;
      bestCount = count;
    }
  }
  return best;
}

/** Build relevant TOC entries from families data + selectedCodes. */
function buildRelevantEntries(
  families: CanonicalFamily[],
  selectedCodes: string[],
  dominantFamilyId: string | null
): CanonicalTocEntry[] {
  if (!families.length) return [];

  let tocEntries: CanonicalTocEntry[];
  if (dominantFamilyId) {
    const fam = families.find((f) => f.id === dominantFamilyId);
    tocEntries = fam?.canonical_toc ?? [];
  } else {
    const merged = new Map<string, CanonicalTocEntry>();
    for (const fam of families) {
      for (const entry of fam.canonical_toc) {
        if (!merged.has(entry.sec_no)) merged.set(entry.sec_no, entry);
      }
    }
    tocEntries = Array.from(merged.values());
  }

  return tocEntries.filter((entry) =>
    selectedCodes.some((code) => entry.codes[code]?.present)
  );
}

export function InlineBodyCompare({ selectedCodes }: InlineBodyCompareProps) {
  const [families, setFamilies] = useState<CanonicalFamily[]>([]);
  const [tocLoading, setTocLoading] = useState(false);
  const [activeSecNo, setActiveSecNo] = useState<string | null>(null);
  // Track the codes key to detect changes for reset
  const codesKey = selectedCodes.join(',');

  // Fetch canonical TOC on mount (once — families are static)
  useEffect(() => {
    if (families.length > 0) return; // already fetched
    setTocLoading(true);
    fetch('/api/kgs/canonical-toc')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setFamilies(data.families ?? []))
      .catch(() => {})
      .finally(() => setTocLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset sec_no when selected codes change
  useEffect(() => {
    setActiveSecNo(null);
  }, [codesKey]);

  // Derive computed values (no hooks below here for hook-ordering safety)
  const dominantFamilyId = detectDominantFamily(selectedCodes);
  const crossFamily =
    new Set(selectedCodes.map((c) => CODE_TO_FAMILY[c]).filter(Boolean)).size > 1;
  const relevantEntries = buildRelevantEntries(families, selectedCodes, dominantFamilyId);

  // Auto-select first L2 entry (or first entry) once entries are ready
  useEffect(() => {
    if (relevantEntries.length === 0 || activeSecNo) return;
    const firstL2 = relevantEntries.find((e) => e.level === 2);
    setActiveSecNo((firstL2 ?? relevantEntries[0]).sec_no);
  }, [relevantEntries.length, activeSecNo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Early return AFTER all hooks
  if (selectedCodes.length === 0) return null;

  const activeEntry = relevantEntries.find((e) => e.sec_no === activeSecNo) ?? null;

  return (
    <div className="border rounded-lg overflow-hidden text-sm">
      {/* Family indicator + cross-family warning */}
      <div className="px-3 py-2 bg-muted/40 border-b flex items-center gap-2 flex-wrap">
        {dominantFamilyId && (
          <span className="text-xs font-mono bg-[#0d9488]/10 text-[#0d9488] px-2 py-0.5 rounded-full">
            패밀리 {dominantFamilyId}
          </span>
        )}
        {crossFamily && (
          <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            다른 family — 본문 의미 다를 수 있음
          </span>
        )}
        {tocLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground ml-auto" />}
      </div>

      {relevantEntries.length === 0 && !tocLoading ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          본문 데이터를 불러올 수 없습니다.
        </p>
      ) : (
        <div className="flex" style={{ minHeight: '280px', maxHeight: '480px' }}>
          {/* Left: sec_no list (1/3) */}
          <aside className="w-1/3 border-r overflow-y-auto bg-muted/10 flex-shrink-0">
            <nav className="p-1">
              {relevantEntries.map((entry) => {
                const presentCount = selectedCodes.filter((c) => entry.codes[c]?.present).length;
                return (
                  <button
                    key={entry.sec_no}
                    onClick={() => setActiveSecNo(entry.sec_no)}
                    className={[
                      'text-left w-full px-2 py-1 rounded text-xs transition-colors flex items-start gap-1',
                      activeSecNo === entry.sec_no
                        ? 'bg-[#0d9488]/10 text-[#0d9488]'
                        : 'hover:bg-muted text-foreground',
                      entry.level === 1 ? 'font-semibold' : '',
                      entry.level >= 3 ? 'pl-4' : entry.level === 2 ? 'pl-2.5' : '',
                    ].join(' ')}
                  >
                    <span className="font-mono text-[10px] text-primary/60 flex-shrink-0 mt-0.5 w-7">
                      {entry.sec_no}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="line-clamp-2 leading-tight">{entry.title}</span>
                      {presentCount < selectedCodes.length && (
                        <span className="text-[9px] text-amber-600 dark:text-amber-400 block">
                          {presentCount}/{selectedCodes.length}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Right: body columns (2/3) */}
          <div className="flex-1 overflow-auto">
            {activeEntry ? (
              <div className="h-full flex flex-col">
                {/* Section header */}
                <div className="border-b px-3 py-2 bg-background sticky top-0 z-10">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-[#0d9488] font-bold text-xs">
                      {activeEntry.sec_no}
                    </span>
                    <span className="font-semibold text-xs">{activeEntry.title}</span>
                  </div>
                </div>

                {/* Code columns */}
                <div
                  className="flex-1 grid divide-x overflow-auto"
                  style={{
                    gridTemplateColumns: `repeat(${selectedCodes.length}, minmax(0, 1fr))`,
                  }}
                >
                  {selectedCodes.map((code) => {
                    const familyId = CODE_TO_FAMILY[code];
                    const codeEntry = activeEntry.codes[code];
                    return (
                      <article key={code} className="p-3 flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-mono font-bold text-[#0d9488] text-xs">{code}</h3>
                          {familyId && (
                            <span className="text-[9px] bg-[#0d9488]/10 text-[#0d9488] px-1 py-0.5 rounded-full">
                              {familyId}
                            </span>
                          )}
                        </div>
                        {codeEntry && codeEntry.matched_title !== activeEntry.title && (
                          <p className="text-[10px] text-muted-foreground">
                            이 코드 제목: {codeEntry.matched_title}
                          </p>
                        )}
                        <SectionBodyColumn
                          code={code}
                          secNo={activeEntry.sec_no}
                          tocEntry={activeEntry}
                        />
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                좌측에서 섹션을 선택하세요.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
