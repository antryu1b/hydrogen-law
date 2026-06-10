'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BookOpen, Loader2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CODE_TO_FAMILY, KGS_FAMILIES } from '@/data/kgs-families-display';
import { InlineBodyCompare } from '@/components/kgs-compare/InlineBodyCompare';
import { MarineInlineBody } from '@/components/marine-compare/MarineInlineBody';

// Issuing-body labels for marine standards (NOT 한국가스안전공사)
const MARINE_ISSUING_BODY: Record<string, string> = {
  GC12K: '한국선급 (KR)',
  MOFFC: '해양수산부 (해수부)',
};

// 선박 표준은 고정 2종 — 추천(키워드 매칭) 결과와 무관하게 항상 노출한다.
// 키워드는 본문 필터에만 쓰고, 박스 노출 여부엔 쓰지 않는다 ("등록신고" 같은
// 미등록 키워드에서 박스 자체가 사라지는 문제 방지).
const MARINE_STANDARDS = [
  { code: 'MOFFC', law_id: 'MOFFC-2024', name: '선박수소연료전지설비 잠정기준' },
  { code: 'GC12K', law_id: 'GC12K-2024', name: '선박용 연료전지 시스템 지침 (GC-12-K)' },
];

interface KGSComparisonProps {
  searchQuery: string;
  // 'kgs' = 한국가스안전공사 KGS CODE only; 'marine' = 선박 기술기준 only (다른 발급기관)
  section?: 'kgs' | 'marine';
}

export default function KGSComparison({ searchQuery, section = 'kgs' }: KGSComparisonProps) {
  const [recommendations, setRecommendations] = useState<Array<{
    code: string;
    name: string;
    category: string;
    subcategory: string;
    score: number;
    matchedKeywords: string[];
  }>>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  // 선박 표준 선택 (law_id) — 기본 둘 다 선택(비교), 하나만 남기면 단독 본문
  const [selectedMarine, setSelectedMarine] = useState<string[]>(
    MARINE_STANDARDS.map((s) => s.law_id)
  );
  const [loading, setLoading] = useState(false);

  // 추천 CODE 가져오기
  useEffect(() => {
    if (!searchQuery) return;

    const fetchRecommendations = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/kgs/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        });

        if (res.ok) {
          const data = await res.json();
          setRecommendations(data.recommended || []);

          // 상위 3개 자동 선택
          const topCodes = data.recommended.slice(0, 3).map((r: { code: string }) => r.code);
          setSelectedCodes(topCodes);
        }
      } catch (error) {
        console.error('Recommendation fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [searchQuery]);

  const toggleCode = (code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code]
    );
  };

  const toggleMarine = (lawId: string) => {
    setSelectedMarine((prev) =>
      prev.includes(lawId) ? prev.filter((id) => id !== lawId) : [...prev, lawId]
    );
  };

  // Split into KGS codes (한국가스안전공사) and marine standards (선박 — different issuing bodies)
  const kgsCodes = recommendations.filter((r) => r.category !== '선박');
  const marineCodes = recommendations.filter((r) => r.category === '선박');

  // KGS 섹션만 추천 결과에 의존 — 선박 섹션은 표준 2종을 항상 노출
  if (section === 'kgs' && recommendations.length === 0 && !loading) {
    return null;
  }

  return (
    <div className="mt-6 space-y-6">
      {/* ── KGS CODE 섹션 (한국가스안전공사 고압가스·수소 기술기준) ── */}
      {section === 'kgs' && (kgsCodes.length > 0 || loading) && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            <h2 className="text-sm font-semibold text-foreground">관련 KGS CODE</h2>
            <span className="text-[10px] text-muted-foreground">(한국가스안전공사)</span>
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                검색어와 관련된 기술기준을 선택하세요 (최대 5개)
              </p>
              {selectedCodes.length > 0 && (
                <Link
                  href={`/kgs-compare?codes=${selectedCodes.join(',')}`}
                  className="text-xs font-medium text-[#0d9488] hover:underline inline-flex items-center gap-1 flex-shrink-0"
                >
                  <BookOpen className="w-3 h-3" />
                  본문 비교하기 →
                </Link>
              )}
            </div>
            <div className="space-y-1.5">
              {kgsCodes.map((rec) => (
                <label
                  key={rec.code}
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors group"
                >
                  <input
                    type="checkbox"
                    checked={selectedCodes.includes(rec.code)}
                    onChange={() => toggleCode(rec.code)}
                    disabled={
                      !selectedCodes.includes(rec.code) && selectedCodes.length >= 5
                    }
                    className="mt-0.5 accent-foreground"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-[#0d9488] text-sm">
                        {rec.code}
                      </span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {rec.category} › {rec.subcategory}
                      </Badge>
                      {(() => {
                        const familyId = CODE_TO_FAMILY[rec.code];
                        const family = KGS_FAMILIES.find(f => f.id === familyId);
                        if (!family) return null;
                        return (
                          <Link
                            href={`/kgs-family#family-${family.id}`}
                            title={family.description}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] bg-[#0d9488]/10 hover:bg-[#0d9488]/20 text-[#0d9488] px-1.5 py-0.5 rounded-full transition-colors inline-flex items-center gap-0.5"
                          >
                            🏷 {family.shortLabel}
                          </Link>
                        );
                      })()}
                      <span className="text-xs text-muted-foreground">
                        매칭도 {(rec.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 mt-1 truncate">{rec.name}</p>
                    {rec.matchedKeywords.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {rec.matchedKeywords.map((kw: string) => (
                          <span
                            key={kw}
                            className="text-[10px] bg-[#0d9488]/10 text-[#0d9488] px-1.5 py-0.5 rounded-full"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 인라인 본문 비교 */}
          {selectedCodes.length >= 1 && (
            <InlineBodyCompare selectedCodes={selectedCodes} />
          )}

          {loading && kgsCodes.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">불러오는 중...</span>
            </div>
          )}
        </div>
      )}

      {/* ── 선박 기술기준 섹션 (KGS CODE 아님 — 발급기관 다름) ── */}
      {section === 'marine' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              표준을 선택하세요 — 1개는 단독 본문, 2개를 선택하면 나란히 비교됩니다
            </p>
            <Link
              href="/kgs-compare?domain=marine"
              className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline inline-flex items-center gap-1 flex-shrink-0"
            >
              <BookOpen className="w-3 h-3" />
              전체 본문 비교 페이지 →
            </Link>
          </div>
          <div className="space-y-1.5">
            {MARINE_STANDARDS.map((std) => {
              const rec = marineCodes.find((r) => r.code === std.code);
              const issuingBody = MARINE_ISSUING_BODY[std.code];
              const isSelected = selectedMarine.includes(std.law_id);
              return (
                <label
                  key={std.code}
                  className={`w-full text-left flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-amber-400 dark:border-amber-600 bg-amber-100/60 dark:bg-amber-950/25'
                      : 'border-amber-200/60 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-100/60 dark:hover:bg-amber-950/20 hover:border-amber-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleMarine(std.law_id)}
                    className="mt-0.5 accent-amber-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-amber-700 dark:text-amber-400 text-sm">
                        {std.code}
                      </span>
                      {issuingBody && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 dark:text-amber-400">
                          발급: {issuingBody}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground/80 mt-1">{std.name}</p>
                    {rec && rec.matchedKeywords.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {rec.matchedKeywords.map((kw: string) => (
                          <span
                            key={kw}
                            className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <BookOpen className="w-4 h-4 text-amber-600/70 shrink-0 mt-0.5" />
                </label>
              );
            })}
          </div>

          {/* 인라인 본문 — 선택한 표준의 키워드 매칭 조문 (KGS 인라인 비교와 동일 UX) */}
          <MarineInlineBody searchQuery={searchQuery} selectedIds={selectedMarine} />
        </div>
      )}

    </div>
  );
}
