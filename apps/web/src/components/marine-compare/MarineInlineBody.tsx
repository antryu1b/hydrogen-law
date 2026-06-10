'use client';

import { useState, useEffect } from 'react';
import { Loader2, Info } from 'lucide-react';
import {
  StandardColumn,
  type MarineResponse,
} from '@/components/marine-compare/MarineCompare';

interface MarineInlineBodyProps {
  // 홈 검색어 — 키워드 매칭 조문만 표시 (빈 문자열이면 전체 본문)
  searchQuery: string;
  // 선택된 표준 law_id 목록 (MOFFC-2024 / GC12K-2024). 1개=단독 보기, 2개=나란히 비교
  selectedIds: string[];
}

// 홈 선박 탭 인라인 본문 뷰 — KGS InlineBodyCompare 의 marine 대응.
// 박스에서 선택한 표준의 키워드 매칭 조문을 그 자리에서 보여준다.
export function MarineInlineBody({ searchQuery, selectedIds }: MarineInlineBodyProps) {
  const [data, setData] = useState<MarineResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (selectedIds.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    const url = searchQuery
      ? `/api/marine-compare?q=${encodeURIComponent(searchQuery)}`
      : '/api/marine-compare';
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json: MarineResponse) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchQuery, selectedIds.length]);

  if (selectedIds.length === 0) return null;

  if (error) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        본문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">본문 불러오는 중...</span>
      </div>
    );
  }

  const standards = (data?.standards ?? []).filter((s) =>
    selectedIds.includes(s.law_id)
  );
  if (standards.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* 두 기준을 동시에 볼 때만 체계 차이 안내 */}
      {standards.length > 1 && (
        <div className="flex items-start gap-2 border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            잠정기준(조)과 지침(장·절)은 조문 체계가 달라 1:1로 정렬되지 않습니다.
            두 기준의 본문을 주제별로 나란히 펼쳐 비교하는 방식입니다.
          </p>
        </div>
      )}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch">
        {standards.map((std) => (
          <StandardColumn key={std.law_id} standard={std} q={data?.q ?? ''} />
        ))}
      </div>
    </div>
  );
}
