'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Scale, Clock, CheckCircle2, History, X } from 'lucide-react';
import type { SearchResponse } from '@/types/search';
import { SearchResults } from '@/components/SearchResults';
import KGSComparison from '@/components/KGSComparison';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// 자주 검색되는 법률 용어 자동완성
const AUTOCOMPLETE_TERMS = [
  '수소충전소', '수소안전', '수소경제', '수소연료전지',
  '안전기준', '안전관리', '안전검사', '안전성평가',
  '충전시설', '충전소 설치', '충전소 안전',
  '고압가스', '고압가스 안전', '가스안전',
  '수소생산', '수소저장', '수소운송', '수소유통',
  '수소전문기업', '수소특화단지',
  '폭발방지', '누출감지', '화재예방',
  '허가', '인허가', '등록', '신고',
  '벌칙', '과태료', '행정처분',
  '시설기준', '기술기준', '검사기준',
  '수소차', '수소버스', '수소트럭',
  '연료전지 발전', '수전해', '그린수소',
  '배관', '용기', '저장탱크', '디스펜서',
];

const SEARCH_HISTORY_KEY = 'hydrogen-law-search-history';
const MAX_HISTORY = 20;

function getSearchHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addSearchHistory(query: string) {
  const history = getSearchHistory().filter((h) => h !== query);
  history.unshift(query);
  if (history.length > MAX_HISTORY) history.pop();
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
}

function removeSearchHistory(query: string) {
  const history = getSearchHistory().filter((h) => h !== query);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
}

function clearSearchHistory() {
  localStorage.removeItem(SEARCH_HISTORY_KEY);
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setHistory(getSearchHistory());
  }, []);

  // 외부 클릭 시 자동완성 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSuggestions = useCallback(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // 입력 없으면 히스토리만 표시
      return { history: history.slice(0, 5), terms: [] };
    }
    const matchingTerms = AUTOCOMPLETE_TERMS.filter(
      (t) => t.toLowerCase().includes(q) && t.toLowerCase() !== q
    ).slice(0, 5);
    const matchingHistory = history.filter(
      (h) => h.toLowerCase().includes(q) && h.toLowerCase() !== q
    ).slice(0, 3);
    return { history: matchingHistory, terms: matchingTerms };
  }, [query, history]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setError('검색어를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setShowSuggestions(false);
    setCurrentPage(1);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), top_k: 100 }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error?.message || data.error || '검색 실패';
        throw new Error(errorMsg);
      }

      setResults(data);
      addSearchHistory(query.trim());
      setHistory(getSearchHistory());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '검색 서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSuggestion = (term: string) => {
    setQuery(term);
    setShowSuggestions(false);
    // 선택 후 바로 검색
    setTimeout(() => {
      const form = document.querySelector('form');
      if (form) form.requestSubmit();
    }, 0);
  };

  const suggestions = getSuggestions();
  const hasSuggestions = suggestions.history.length > 0 || suggestions.terms.length > 0;

  // 페이지네이션 계산
  const totalItems = results?.articles.length ?? 0;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const paginatedArticles = results?.articles.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="min-h-screen px-3 sm:px-6 lg:px-8 py-6 sm:py-12 md:py-16">
      {/* Search Section */}
      <section className="text-center space-y-5 sm:space-y-8 max-w-6xl mx-auto w-full mb-6 sm:mb-8">
        <div className="space-y-2 sm:space-y-4">
          <div className="flex justify-center">
            <div className="p-2.5 sm:p-3 bg-primary/10 rounded-xl">
              <Scale className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
          </div>
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold">법령 검색</h2>
          <p className="text-xs sm:text-base text-muted-foreground max-w-xl mx-auto px-2 sm:px-4">
            자연어로 질문하시면 관련 법령을 즉시 찾아드립니다
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
          <form onSubmit={handleSearch} className="space-y-2 sm:space-y-4">
            <div className="relative">
              <Input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSearch(e as unknown as React.FormEvent);
                  }
                  if (e.key === 'Escape') {
                    setShowSuggestions(false);
                  }
                }}
                placeholder="예: 수소충전소, 안전기준"
                className="h-11 sm:h-14 lg:h-16 text-sm sm:text-lg px-3 sm:px-6"
                autoComplete="off"
              />

              {/* 자동완성 드롭다운 */}
              {showSuggestions && hasSuggestions && (
                <div
                  ref={suggestionsRef}
                  className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden"
                >
                  {suggestions.history.length > 0 && (
                    <div className="p-1">
                      <div className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                          <History className="w-3 h-3" />
                          최근 검색
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearSearchHistory();
                            setHistory([]);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          전체 삭제
                        </button>
                      </div>
                      {suggestions.history.map((h) => (
                        <div
                          key={`h-${h}`}
                          className="flex items-center justify-between px-3 py-2 hover:bg-accent rounded cursor-pointer text-sm"
                        >
                          <span
                            className="flex-1 text-left"
                            onClick={() => handleSelectSuggestion(h)}
                          >
                            <History className="w-3.5 h-3.5 inline mr-2 text-muted-foreground" />
                            {h}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSearchHistory(h);
                              setHistory(getSearchHistory());
                            }}
                            className="p-0.5 hover:bg-muted rounded"
                          >
                            <X className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {suggestions.terms.length > 0 && (
                    <div className="p-1 border-t">
                      <div className="px-3 py-1.5">
                        <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                          <Search className="w-3 h-3" />
                          추천 검색어
                        </span>
                      </div>
                      {suggestions.terms.map((t) => (
                        <div
                          key={`t-${t}`}
                          onClick={() => handleSelectSuggestion(t)}
                          className="px-3 py-2 hover:bg-accent rounded cursor-pointer text-sm"
                        >
                          <Search className="w-3.5 h-3.5 inline mr-2 text-muted-foreground" />
                          {t}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <Button
              type="submit"
              disabled={loading || !query}
              className="w-full h-11 sm:h-14 text-sm sm:text-lg font-semibold"
              size="lg"
            >
              {loading ? (
                <>
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-spin" />
                  검색 중
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                  검색
                </>
              )}
            </Button>
          </form>

          <div className="flex flex-wrap gap-1.5 sm:gap-3 items-center justify-center text-xs sm:text-sm">
            <Badge variant="secondary" className="gap-1 sm:gap-1.5 py-0.5 sm:py-1.5 px-1.5 sm:px-3 text-[10px] sm:text-sm">
              <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4" />
              LLM 미사용
            </Badge>
            <Separator orientation="vertical" className="h-3 sm:h-5 hidden sm:block" />
            <span className="font-medium text-muted-foreground text-[10px] sm:text-sm">1초 이내</span>
            <Separator orientation="vertical" className="h-3 sm:h-5 hidden sm:block" />
            <span className="font-medium text-muted-foreground text-[10px] sm:text-sm">100% 정확</span>
          </div>

          {error && (
            <div className="p-3 sm:p-4 border border-destructive bg-destructive/10 rounded-lg text-center">
              <p className="text-sm sm:text-base text-destructive font-semibold">
                ❌ {error}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Search Results */}
      {results && paginatedArticles && (
        <div className="max-w-6xl mx-auto">
          <div className="text-xs text-gray-400 text-center mb-2">
            {totalItems}건 중 {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, totalItems)}건 표시
          </div>
          <SearchResults
            results={{
              ...results,
              articles: paginatedArticles,
              total_found: results.total_found,
            }}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            startIndex={(currentPage - 1) * ITEMS_PER_PAGE}
          />
        </div>
      )}

      {/* KGS CODE 비교 (법령 검색과 독립) */}
      {query && !loading && (
        <div className="max-w-6xl mx-auto mt-8">
          <KGSComparison searchQuery={query} />
        </div>
      )}
    </div>
  );
}
