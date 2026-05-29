'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import type { CanonicalFamily, CanonicalTocEntry, SectionBody } from './types';
import { CODE_TO_FAMILY } from '@/data/kgs-families-display';

interface ViewAProps {
  selectedCodes: string[];
  families: CanonicalFamily[];
  activeFamilyId: string | null; // null = '전체'
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
      const res = await fetch(`/api/kgs/section-body?code=${code}&sec_no=${encodeURIComponent(secNo)}`);
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
    return (
      <p className="text-sm text-muted-foreground italic">이 코드엔 해당 섹션 없음</p>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="text-sm">불러오는 중...</span>
      </div>
    );
  }
  if (notFound) {
    return <p className="text-sm text-muted-foreground italic">섹션 데이터 없음</p>;
  }
  if (data?.is_umbrella || (data && data.body_chars === 0)) {
    return <p className="text-sm text-muted-foreground italic">(상위 헤더, 본문 없음)</p>;
  }
  if (data) {
    return (
      <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{data.body}</pre>
    );
  }
  return null;
}

export function ViewA({ selectedCodes, families, activeFamilyId }: ViewAProps) {
  const [activeSecNo, setActiveSecNo] = useState<string | null>(null);

  // Build the TOC entries to show in sidebar based on selected family
  const tocEntries = (() => {
    if (activeFamilyId) {
      const family = families.find((f) => f.id === activeFamilyId);
      return family?.canonical_toc ?? [];
    }
    // '전체': merge all families. Use a Map keyed by sec_no to deduplicate.
    const merged = new Map<string, CanonicalTocEntry>();
    for (const family of families) {
      for (const entry of family.canonical_toc) {
        if (!merged.has(entry.sec_no)) {
          merged.set(entry.sec_no, entry);
        }
      }
    }
    return Array.from(merged.values());
  })();

  // Filter only entries relevant to selected codes
  const relevantEntries = tocEntries.filter((entry) =>
    selectedCodes.some((code) => entry.codes[code]?.present)
  );

  // Auto-select first entry if nothing selected
  useEffect(() => {
    if (relevantEntries.length > 0 && !activeSecNo) {
      setActiveSecNo(relevantEntries[0].sec_no);
    }
  }, [relevantEntries, activeSecNo]);

  const activeEntry = relevantEntries.find((e) => e.sec_no === activeSecNo) ?? null;

  if (selectedCodes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        코드를 1개 이상 선택하세요.
      </p>
    );
  }

  return (
    <div className="flex gap-0 border rounded-lg overflow-hidden" style={{ minHeight: '600px' }}>
      {/* Sidebar TOC */}
      <aside className="w-64 border-r flex-shrink-0 overflow-y-auto bg-muted/20">
        <div className="p-2 text-xs font-semibold text-muted-foreground border-b px-3 py-2">
          목차 ({relevantEntries.length}개 섹션)
        </div>
        <nav className="p-1">
          {relevantEntries.map((entry) => {
            const presentCount = selectedCodes.filter((c) => entry.codes[c]?.present).length;
            return (
              <button
                key={entry.sec_no}
                onClick={() => setActiveSecNo(entry.sec_no)}
                className={[
                  'text-left w-full px-2 py-1.5 rounded text-sm transition-colors flex items-start gap-1.5',
                  activeSecNo === entry.sec_no
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-foreground',
                  entry.level === 1 ? 'font-semibold' : '',
                  entry.level >= 3 ? 'pl-5' : entry.level === 2 ? 'pl-3' : '',
                ].join(' ')}
              >
                <span className="font-mono text-xs text-primary/70 flex-shrink-0 mt-0.5 w-8">
                  {entry.sec_no}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="line-clamp-2">{entry.title}</span>
                  {presentCount < selectedCodes.length && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 block">
                      {presentCount}/{selectedCodes.length} 코드
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Body columns */}
      <div className="flex-1 overflow-auto">
        {activeEntry ? (
          <div className="h-full flex flex-col">
            {/* Section header */}
            <div className="border-b px-4 py-3 bg-background sticky top-0 z-10">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-primary font-bold">{activeEntry.sec_no}</span>
                <span className="font-semibold">{activeEntry.title}</span>
              </div>
              {activeEntry.title_per_family && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  패밀리마다 제목이 다릅니다:
                  {Object.entries(activeEntry.title_per_family).map(([fam, title]) => (
                    <span key={fam} className="ml-2">
                      <span className="font-semibold">{fam}:</span> {title}
                    </span>
                  ))}
                </p>
              )}
            </div>

            {/* Code columns */}
            <div
              className="flex-1 grid divide-x overflow-auto"
              style={{
                gridTemplateColumns: `repeat(${selectedCodes.length}, minmax(0, 1fr))`,
              }}
            >
              {selectedCodes.map((code) => {
                const codeEntry = activeEntry.codes[code];
                const familyId = CODE_TO_FAMILY[code];
                return (
                  <article key={code} className="p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-mono font-bold text-primary">{code}</h3>
                      {familyId && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                          패밀리 {familyId}
                        </span>
                      )}
                    </div>
                    {codeEntry && codeEntry.matched_title !== activeEntry.title && (
                      <p className="text-xs text-muted-foreground">
                        이 코드의 제목: {codeEntry.matched_title}
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
          <p className="text-muted-foreground text-sm py-8 text-center">
            좌측 목차에서 섹션을 선택하세요.
          </p>
        )}
      </div>
    </div>
  );
}
