'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Search, ExternalLink, Anchor, Info } from 'lucide-react';

// 선박 두 표준의 발급기관·식별 메타 (표시용)
const STANDARD_META: Record<
  string,
  { agency: string; pdfCode: string; accent: 'left' | 'right' }
> = {
  'MOFFC-2024': { agency: '해양수산부', pdfCode: 'MOFFC', accent: 'left' },
  'GC12K-2024': { agency: '한국선급 (KR)', pdfCode: 'GC12K', accent: 'right' },
};

interface MarineItem {
  article_no: string;
  title: string;
  content: string;
}

interface MarineStandard {
  law_id: string;
  law_name: string;
  count: number;
  items: MarineItem[];
}

interface MarineResponse {
  q: string;
  standards: MarineStandard[];
}

// 키워드 하이라이트 — 안전하게 정규식 이스케이프 후 <mark> 처리
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const re = new RegExp(`(${escapeRegex(q)})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part) ? (
      <mark
        key={i}
        className="bg-[hsl(var(--brass)/0.28)] text-foreground rounded px-0.5"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function pdfHref(pdfCode: string): string {
  return `/api/kgs/page-image?code=${pdfCode}&page=1`;
}

function StandardColumn({
  standard,
  q,
}: {
  standard: MarineStandard;
  q: string;
}) {
  const meta = STANDARD_META[standard.law_id] ?? {
    agency: '',
    pdfCode: '',
    accent: 'left' as const,
  };

  return (
    <div className="flex-1 min-w-0 border rounded-lg overflow-hidden flex flex-col">
      {/* Column header — amber accent for marine */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800/60 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Anchor className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                {meta.agency}
              </span>
            </div>
            <h3 className="text-sm font-bold mt-1 leading-snug">
              {standard.law_name}
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {standard.count}개 조문
            </p>
          </div>
          {meta.pdfCode && (
            <a
              href={pdfHref(meta.pdfCode)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap flex-shrink-0 mt-0.5"
            >
              원본 PDF
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 p-3 space-y-2.5">
        {standard.items.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-10">
            {q ? (
              <>‘{q}’에 해당하는 조문이 없습니다.</>
            ) : (
              <>표시할 조문이 없습니다.</>
            )}
          </div>
        ) : (
          standard.items.map((item, i) => (
            <div
              key={`${item.article_no}-${i}`}
              className="border rounded-md p-3 hover:border-amber-300 dark:hover:border-amber-700/60 transition-colors"
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                {item.article_no && (
                  <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                    {item.article_no}
                  </span>
                )}
                {item.title && (
                  <span className="text-sm font-semibold leading-snug">
                    {highlight(item.title, q)}
                  </span>
                )}
              </div>
              {item.content && (
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap break-words">
                  {highlight(item.content, q)}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function MarineCompare() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState<MarineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (keyword: string) => {
    setLoading(true);
    setError(false);
    try {
      const url = keyword
        ? `/api/marine-compare?q=${encodeURIComponent(keyword)}`
        : '/api/marine-compare';
      const res = await fetch(url);
      if (!res.ok) throw new Error('fetch failed');
      const json: MarineResponse = await res.json();
      setData(json);
      setQ(keyword);
    } catch {
      setError(true);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 초기 로드(전체)
  useEffect(() => {
    fetchData('');
  }, [fetchData]);

  // 디바운스 검색
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchData(input.trim());
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, fetchData]);

  const standards = data?.standards ?? [];
  const totalCount = standards.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-4">
      {/* Search box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="환기, 검사, 수소 저장…"
          className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[hsl(var(--brass)/0.5)] focus:border-amber-400"
          aria-label="선박 기술기준 본문 검색"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* 체계 차이 안내 */}
      <div className="flex items-start gap-2 border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
        <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          잠정기준(조)과 지침(장·절)은 조문 체계가 달라 1:1로 정렬되지 않습니다.
          같은 줄에 놓인 조문이 서로 대응한다는 뜻이 아니라, 두 기준의 본문을
          주제별로 나란히 펼쳐 비교하는 방식입니다.
        </p>
      </div>

      {/* Status / empty / error */}
      {error ? (
        <div className="text-sm text-center py-12 text-muted-foreground">
          본문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      ) : loading && !data ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>본문 불러오는 중...</span>
        </div>
      ) : (
        <>
          {q && (
            <p className="text-xs text-muted-foreground">
              ‘{q}’ 검색 결과 — 총 {totalCount}개 조문
            </p>
          )}
          {/* 2-column layout: LEFT 잠정기준(MOFFC), RIGHT 지침(GC-12-K) */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            {standards.map((std) => (
              <StandardColumn key={std.law_id} standard={std} q={q} />
            ))}
          </div>
          {standards.length > 0 && totalCount === 0 && q && (
            <p className="text-sm text-center text-muted-foreground py-4">
              ‘{q}’에 해당하는 본문이 양쪽 기준 모두에 없습니다. 다른 키워드를 입력해 보세요.
            </p>
          )}
        </>
      )}
    </div>
  );
}
