'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { CanonicalFamily, CanonicalTocEntry } from './types';
import { CODE_TO_FAMILY } from '@/data/kgs-families-display';

interface ViewCProps {
  selectedCodes: string[];
  families: CanonicalFamily[];
}

interface SectionData {
  sec_no: string;
  title: string;
  body: string;
  is_umbrella: boolean;
  body_chars: number;
  level: number;
}

interface CodeSections {
  code: string;
  sections: SectionData[];
  loading: boolean;
  error: boolean;
}

function useSectionsForCode(code: string | null): CodeSections {
  const [state, setState] = useState<CodeSections>({
    code: code ?? '',
    sections: [],
    loading: false,
    error: false,
  });

  useEffect(() => {
    if (!code) return;
    setState({ code, sections: [], loading: true, error: false });

    // Fetch full sections list then fetch bodies for all
    const controller = new AbortController();
    (async () => {
      try {
        const listRes = await fetch(`/api/kgs/sections-list?code=${code}`, { signal: controller.signal });
        if (!listRes.ok) throw new Error('list fetch failed');
        const listData = await listRes.json();

        // Fetch body for each section (batch via individual requests — sections ~50-300)
        const sections: SectionData[] = await Promise.all(
          listData.sections.map(async (s: { sec_no: string; title: string; level: number; body_chars: number; is_umbrella: boolean }) => {
            if (s.body_chars === 0 || s.is_umbrella) {
              return { sec_no: s.sec_no, title: s.title, body: '', is_umbrella: true, body_chars: 0, level: s.level };
            }
            try {
              const bodyRes = await fetch(
                `/api/kgs/section-body?code=${code}&sec_no=${encodeURIComponent(s.sec_no)}`,
                { signal: controller.signal }
              );
              if (!bodyRes.ok) return { sec_no: s.sec_no, title: s.title, body: '', is_umbrella: false, body_chars: 0, level: s.level };
              const bd = await bodyRes.json();
              return { sec_no: s.sec_no, title: s.title, body: bd.body, is_umbrella: bd.is_umbrella, body_chars: bd.body_chars, level: s.level };
            } catch {
              return { sec_no: s.sec_no, title: s.title, body: '', is_umbrella: false, body_chars: 0, level: s.level };
            }
          })
        );
        setState({ code, sections, loading: false, error: false });
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        setState({ code, sections: [], loading: false, error: true });
      }
    })();

    return () => controller.abort();
  }, [code]);

  return state;
}

export function ViewC({ selectedCodes, families }: ViewCProps) {
  const [activeSecNo, setActiveSecNo] = useState<string | null>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  const codeA = selectedCodes[0] ?? null;
  const codeB = selectedCodes[1] ?? null;

  const dataA = useSectionsForCode(codeA);
  const dataB = useSectionsForCode(codeB);

  if (selectedCodes.length !== 2) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        View C는 코드 정확히 2개를 선택해야 합니다.
      </p>
    );
  }

  // Build combined canonical TOC from families covering these codes
  const combinedSecNos = new Map<string, CanonicalTocEntry>();
  for (const family of families) {
    for (const entry of family.canonical_toc) {
      if (!combinedSecNos.has(entry.sec_no)) {
        combinedSecNos.set(entry.sec_no, entry);
      }
    }
  }
  const tocEntries = Array.from(combinedSecNos.values());

  const secNosInA = new Set(dataA.sections.map((s) => s.sec_no));
  const secNosInB = new Set(dataB.sections.map((s) => s.sec_no));

  function scrollTo(secNo: string) {
    setActiveSecNo(secNo);
    const scrollPane = (paneRef: React.RefObject<HTMLDivElement | null>, code: string) => {
      const el = paneRef.current?.querySelector(`[data-sec="${code}-${secNo}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    scrollPane(leftPaneRef, codeA ?? '');
    scrollPane(rightPaneRef, codeB ?? '');
  }

  function SectionBlock({ secData, code }: { secData: SectionData; code: string }) {
    const inBoth = secNosInA.has(secData.sec_no) && secNosInB.has(secData.sec_no);
    return (
      <div
        data-sec={`${code}-${secData.sec_no}`}
        className={[
          'mb-4 p-3 rounded border',
          inBoth ? 'border-yellow-300 bg-yellow-50/30 dark:bg-yellow-900/10 dark:border-yellow-700' : 'border-muted bg-muted/5',
        ].join(' ')}
      >
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-mono text-xs text-primary">{secData.sec_no}</span>
          <span className="text-sm font-semibold">{secData.title}</span>
        </div>
        {secData.is_umbrella || secData.body_chars === 0 ? (
          <p className="text-xs text-muted-foreground italic">(상위 헤더, 본문 없음)</p>
        ) : (
          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed mt-1">{secData.body}</pre>
        )}
      </div>
    );
  }

  const familyIdA = codeA ? CODE_TO_FAMILY[codeA] : null;
  const familyIdB = codeB ? CODE_TO_FAMILY[codeB] : null;

  const isLoading = dataA.loading || dataB.loading;

  return (
    <div className="relative flex gap-0 border rounded-lg overflow-hidden" style={{ height: '80vh' }}>
      {/* Sidebar TOC */}
      <aside className="w-56 border-r flex-shrink-0 overflow-y-auto bg-muted/20">
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b">
          목차 ({tocEntries.length})
        </div>
        <nav className="p-1">
          {tocEntries.map((entry) => {
            const inA = secNosInA.has(entry.sec_no);
            const inB = secNosInB.has(entry.sec_no);
            const inBoth = inA && inB;
            return (
              <button
                key={entry.sec_no}
                onClick={() => scrollTo(entry.sec_no)}
                className={[
                  'text-left w-full px-2 py-1 rounded text-xs transition-colors flex items-start gap-1',
                  activeSecNo === entry.sec_no ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground',
                  entry.level >= 3 ? 'pl-5' : entry.level === 2 ? 'pl-3' : '',
                ].join(' ')}
              >
                <span className="font-mono text-primary/70 flex-shrink-0 w-7 mt-0.5">{entry.sec_no}</span>
                <span className="flex-1 min-w-0 line-clamp-2">{entry.title}</span>
                <span className="flex-shrink-0 flex gap-0.5 mt-0.5">
                  {inA && <span className="w-1.5 h-1.5 rounded-full bg-primary block" title={codeA ?? ''} />}
                  {inB && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 block" title={codeB ?? ''} />}
                  {!inBoth && <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 block" />}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Two panes */}
      <div className="flex-1 grid grid-cols-2 overflow-hidden divide-x">
        {/* Left pane: Code A */}
        <div ref={leftPaneRef} className="overflow-y-auto p-4">
          <div className="sticky top-0 bg-background/90 backdrop-blur pb-2 mb-3 border-b">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-primary">{codeA}</span>
              {familyIdA && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                  패밀리 {familyIdA}
                </span>
              )}
            </div>
          </div>
          {dataA.loading && (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">불러오는 중...</span>
            </div>
          )}
          {dataA.error && <p className="text-red-500 text-sm">데이터 로드 실패</p>}
          {!dataA.loading && !dataA.error && dataA.sections.map((s) => (
            <SectionBlock key={s.sec_no} secData={s} code={codeA ?? ''} />
          ))}
        </div>

        {/* Right pane: Code B */}
        <div ref={rightPaneRef} className="overflow-y-auto p-4">
          <div className="sticky top-0 bg-background/90 backdrop-blur pb-2 mb-3 border-b">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-orange-500">{codeB}</span>
              {familyIdB && (
                <span className="text-[10px] bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded-full">
                  패밀리 {familyIdB}
                </span>
              )}
            </div>
          </div>
          {dataB.loading && (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">불러오는 중...</span>
            </div>
          )}
          {dataB.error && <p className="text-red-500 text-sm">데이터 로드 실패</p>}
          {!dataB.loading && !dataB.error && dataB.sections.map((s) => (
            <SectionBlock key={s.sec_no} secData={s} code={codeB ?? ''} />
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="absolute bottom-4 right-4 bg-background border rounded-full px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5 shadow-md">
          <Loader2 className="w-3 h-3 animate-spin" />
          본문 불러오는 중
        </div>
      )}
    </div>
  );
}
