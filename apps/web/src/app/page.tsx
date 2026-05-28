'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Scale, Clock, History, X, FileText, BookOpen, ChevronRight, Home, Zap, Database, ChevronLeft, AlertCircle, Pin } from 'lucide-react';
import type { SearchResponse } from '@/types/search';
import { SearchResults } from '@/components/SearchResults';
import KGSComparison from '@/components/KGSComparison';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

// 최상위 법령 목록
const TOP_LAWS = [
  { id: 'hydrogen', name: '수소경제 육성 및 수소 안전관리에 관한 법률', short: '수소안전관리법', keyword: '수소' },
  { id: 'highpressure', name: '고압가스 안전관리법', short: '고압가스안전관리법', keyword: '고압가스' },
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

type TabType = 'law' | 'kgs';
type ViewState = 'home' | 'results' | 'drilldown';

interface KGSRecommendation {
  code: string;
  name: string;
  category: string;
  subcategory: string;
  score: number;
  matchedKeywords: string[];
  pdfUrl?: string | null;
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [kgsResults, setKgsResults] = useState<KGSRecommendation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('law');
  const [viewState, setViewState] = useState<ViewState>('home');
  const [selectedLaw, setSelectedLaw] = useState<typeof TOP_LAWS[0] | null>(null);
  const [selectedLawFilter, setSelectedLawFilter] = useState<string | null>(null); // 최상위 법령 필터
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setHistory(getSearchHistory());
  }, []);

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

  const doSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    setCurrentPage(1);
    setSelectedLawFilter(null);
    setSubmittedQuery(searchQuery.trim());
    setViewState('results');
    setSelectedLaw(null);

    try {
      // 법령 검색
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim(), top_k: 100 }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error?.message || data.error || '검색 실패';
        throw new Error(errorMsg);
      }

      setResults(data);
      addSearchHistory(searchQuery.trim());
      setHistory(getSearchHistory());

      // KGS 추천 검색
      try {
        const kgsRes = await fetch('/api/kgs/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        });
        if (kgsRes.ok) {
          const kgsData = await kgsRes.json();
          setKgsResults(kgsData.recommended || []);
        }
      } catch {
        setKgsResults([]);
      }

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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setError('검색어를 입력해주세요.');
      return;
    }
    setShowSuggestions(false);
    await doSearch(query.trim());
  };

  const handleSelectSuggestion = (term: string) => {
    setQuery(term);
    setShowSuggestions(false);
    setTimeout(async () => {
      await doSearch(term);
    }, 0);
  };

  const handleLawDrilldown = async (law: typeof TOP_LAWS[0]) => {
    setSelectedLaw(law);
    setViewState('drilldown');
    setLoading(true);
    setError(null);
    setCurrentPage(1);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: law.keyword, top_k: 100 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '검색 실패');
      setResults(data);

      try {
        const kgsRes = await fetch('/api/kgs/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: law.keyword }),
        });
        if (kgsRes.ok) {
          const kgsData = await kgsRes.json();
          setKgsResults(kgsData.recommended || []);
        }
      } catch {
        setKgsResults([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 실패');
    } finally {
      setLoading(false);
    }
  };

  const suggestions = getSuggestions();
  const hasSuggestions = suggestions.history.length > 0 || suggestions.terms.length > 0;

  // 법령명에서 베이스 (상위법) 이름 추출: "...법률 시행령" → "...법률"
  const getBaseLawName = (name: string): string => {
    return name
      .replace(/\s*시행규칙$/, '')
      .replace(/\s*시행령$/, '')
      .replace(/\s*부칙$/, '')
      .replace(/\s*별표.*$/, '')
      .trim();
  };

  // 법령 종류별 정렬 우선순위
  const getLawTypeRank = (lawName: string, lawType?: string): number => {
    const t = (lawType || '').toLowerCase();
    if (lawName.includes('시행규칙') || t.includes('시행규칙') || t.includes('부령') || t.includes('총리령')) return 2;
    if (lawName.includes('시행령') || t.includes('시행령') || t.includes('대통령령')) return 1;
    if (lawName.includes('별표')) return 3;
    if (lawName.includes('부칙')) return 4;
    return 0; // 법률
  };

  // 조문 번호에서 숫자 추출 (정렬용)
  const getArticleNum = (articleNo: string): number => {
    const m = articleNo.match(/제(\d+)조/);
    return m ? parseInt(m[1], 10) : 9999;
  };

  // 상위 법령(베이스) 단위로 그룹화
  const lawFamilies = results
    ? (() => {
        const map = new Map<string, { baseName: string; members: { name: string; count: number; rank: number }[]; total: number }>();
        for (const a of results.articles) {
          const base = getBaseLawName(a.law_name);
          const rank = getLawTypeRank(a.law_name, a.law_type);
          if (!map.has(base)) map.set(base, { baseName: base, members: [], total: 0 });
          const fam = map.get(base)!;
          let m = fam.members.find(m => m.name === a.law_name);
          if (!m) { m = { name: a.law_name, count: 0, rank }; fam.members.push(m); }
          m.count++;
          fam.total++;
        }
        return [...map.values()].sort((a, b) => b.total - a.total);
      })()
    : [];

  // 선택된 상위법(family) 또는 단일 법령 필터
  const filteredArticles = (() => {
    const articles = results?.articles ?? [];
    if (!selectedLawFilter) return articles;

    // family 매칭: selectedLawFilter는 base name
    const filtered = articles.filter((a) => getBaseLawName(a.law_name) === selectedLawFilter);
    // 정렬: 법률 → 시행령 → 시행규칙 → 별표 → 부칙, 같은 type 안에서는 조문번호 순
    return filtered.sort((a, b) => {
      const rankDiff = getLawTypeRank(a.law_name, a.law_type) - getLawTypeRank(b.law_name, b.law_type);
      if (rankDiff !== 0) return rankDiff;
      const nameDiff = a.law_name.localeCompare(b.law_name);
      if (nameDiff !== 0) return nameDiff;
      return getArticleNum(a.article_number) - getArticleNum(b.article_number);
    });
  })();

  const totalItems = filteredArticles.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const paginatedArticles = filteredArticles.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // 홈 화면
  if (viewState === 'home') {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 bg-background home-bg">
        {/* 로고 */}
        <div className="mb-8 text-center fadeIn">
          <div className="flex items-center justify-center gap-2.5 mb-5">
            <Scale className="w-6 h-6 text-foreground/50" strokeWidth={1.5} />
            <span className="text-xs font-medium tracking-widest text-muted-foreground uppercase">어플리케이션개발2팀</span>
          </div>
          <h1 className="text-3xl font-noto-serif-kr tracking-tight font-bold leading-tight md:text-4xl mb-3">법령 검색</h1>
          <p className="text-muted-foreground text-sm">수소·고압가스 관련 법령 및 KGS CODE 통합 검색</p>
        </div>

        {/* 검색창 */}
        <div className="w-full max-w-2xl fadeIn">
          <form onSubmit={handleSearch} className="relative">
            <div className="relative">
              <Input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                  setError(null);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowSuggestions(false);
                }}
                placeholder="법령명, 조문, 키워드로 검색..."
                className={`h-14 text-base pl-5 pr-32 rounded-full border-2 shadow-sm focus:shadow-md transition-shadow ${query ? 'ring-primary/30 ring-2' : ''}`}
                autoComplete="off"
              />
              <Button
                type="submit"
                disabled={loading || !query.trim()}
                className="absolute right-2 top-2 h-10 px-5 rounded-full transition-transform duration-200 hover:scale-105 active:scale-95"
              >
                {loading ? (
                  <Clock className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span className="ml-2 hidden sm:inline">검색</span>
              </Button>
            </div>

            {/* 자동완성 */}
            {showSuggestions && hasSuggestions && (
              <div
                ref={suggestionsRef}
                className="absolute top-full left-0 right-0 z-50 mt-2 bg-popover border rounded-2xl shadow-lg overflow-hidden fadeIn"
              >
                {suggestions.history.length > 0 && (
                  <div className="p-2">
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
                        className="flex items-center justify-between px-3 py-2 hover:bg-accent rounded-lg cursor-pointer text-sm fadeIn"
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
                          className="p-0.5 hover:bg-muted rounded fadeIn"
                        >
                          <X className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {suggestions.terms.length > 0 && (
                  <div className="p-2 border-t">
                    {suggestions.terms.map((t) => (
                      <div
                        key={`t-${t}`}
                        onClick={() => handleSelectSuggestion(t)}
                        className="px-3 py-2 hover:bg-accent rounded-lg cursor-pointer text-sm fadeIn"
                      >
                        <Search className="w-3.5 h-3.5 inline mr-2 text-muted-foreground" />
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </form>

          {error && (
            <p className="text-sm text-destructive text-center mt-3 fadeIn">{error}</p>
          )}

          {/* 키워드 예시 */}
          <div className="mt-8 fadeIn">
            <p className="text-xs text-muted-foreground text-center mb-3">예시 검색어</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {['수소충전소', '안전기준', '고압가스', '수소안전', '수소저장', '등록신고'].map((kw) => (
                <button
                  key={kw}
                  onClick={() => handleSelectSuggestion(kw)}
                  className="px-3 py-1.5 text-xs border rounded-full hover:bg-accent transition-colors text-muted-foreground hover:text-foreground fadeIn"
                >
                  {kw}
                </button>
              ))}
            </div>
          </div>

          {/* 안내 뱃지 */}
          <div className="flex gap-4 items-center justify-center mt-6 text-xs text-muted-foreground fadeIn">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              1초 이내
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Search className="w-3 h-3" />
              법령 + KGS CODE
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3" />
              전체 법령 5,573건
            </span>
          </div>

          {/* Decorative Divider */}
          <div className="border-t border-gray-200 relative mt-8 mb-4">
            <span className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-background px-3 text-muted-foreground text-sm">§</span>
          </div>
        </div>
      </div>
    );
  }

  // 결과 화면 (검색 결과 or 드릴다운)
  return (
    <div className="min-h-screen bg-background">
      {/* 결과 페이지 검색바 */}
      <div className="mb-6 fadeIn">
        <form onSubmit={handleSearch} className="flex gap-2 max-w-3xl w-full md:w-auto">
          <div className="relative flex-1">
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
                if (e.key === 'Escape') setShowSuggestions(false);
              }}
              placeholder="검색어 입력..."
              className={`h-11 pl-4 pr-4 ${query ? 'ring-primary/30 ring-2' : ''}`}
              autoComplete="off"
            />
            {showSuggestions && hasSuggestions && (
              <div
                ref={suggestionsRef}
                className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-xl shadow-lg overflow-hidden fadeIn"
              >
                {suggestions.history.map((h) => (
                  <div
                    key={`h-${h}`}
                    onClick={() => handleSelectSuggestion(h)}
                    className="px-3 py-2 hover:bg-accent cursor-pointer text-sm flex items-center gap-2 fadeIn"
                  >
                    <History className="w-3.5 h-3.5 text-muted-foreground" />
                    {h}
                  </div>
                ))}
                {suggestions.terms.map((t) => (
                  <div
                    key={`t-${t}`}
                    onClick={() => handleSelectSuggestion(t)}
                    className="px-3 py-2 hover:bg-accent cursor-pointer text-sm flex items-center gap-2 fadeIn"
                  >
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                    {t}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button type="submit" disabled={loading} className="h-11 px-5 fadeIn transition-transform duration-200 hover:scale-105 active:scale-95">
            {loading ? <Clock className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="ml-2">검색</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => { setViewState('home'); setResults(null); setError(null); setSelectedLawFilter(null); }}
            className="h-11 px-4 fadeIn gap-1.5"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">시작화면</span>
          </Button>
        </form>
      </div>

      {/* 드릴다운 헤더 */}
      {viewState === 'drilldown' && selectedLaw && (
        <div className="mb-4 p-4 bg-primary/5 rounded-xl border fadeIn">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold text-sm">{selectedLaw.name}</h2>
              <p className="text-xs text-muted-foreground mt-1">이 법의 하위 법령 및 관련 KGS CODE를 표시합니다.</p>
            </div>
          </div>
          {/* 최상위 법령 전환 버튼 */}
          <div className="flex gap-2 mt-3 fadeIn">
            {TOP_LAWS.map((law) => (
              <button
                key={law.id}
                onClick={() => handleLawDrilldown(law)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  selectedLaw.id === law.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'hover:bg-accent'
                } fadeIn`}
              >
                {law.short}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 탭 */}
      <div className="flex flex-col md:flex-row md:space-x-8 space-y-4 md:space-y-0 border-b fadeIn mb-2">
        <button
          onClick={() => setActiveTab('law')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'law'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          } fadeIn`}
        >
          <FileText className="w-4 h-4" />
          법령
          {results && (
            <span className="ml-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full absolute top-2 left-2 fadeIn">
              {results.articles.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('kgs')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'kgs'
              ? 'border-[#0d9488] text-[#0d9488]'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          } fadeIn`}
        >
          <BookOpen className="w-4 h-4" />
          KGS CODE
          {kgsResults.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-xs bg-[#0d9488]/10 text-[#0d9488] rounded-full absolute top-2 left-2 fadeIn">
              {kgsResults.length}
            </span>
          )}
        </button>
      </div>

      {/* 에러 */}
      {error && (
        <div className="p-4 border border-destructive bg-destructive/10 rounded-xl mb-4 fadeIn">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="flex items-center justify-center py-16 fadeIn">
          <Clock className="w-6 h-6 animate-spin text-muted-foreground mr-3" />
          <span className="text-muted-foreground">검색 중...</span>
        </div>
      )}

      {/* 법령 탭 내용 */}
      {!loading && activeTab === 'law' && (
        <div>
          {results && (
            <>
              {/* 1차: 상위법명만 카드 형태 (선택 안 됐을 때) */}
              {!selectedLawFilter && lawFamilies.length > 0 && (
                <div className="mt-6 mb-6 animate-fade-in">
                  <p className="text-sm text-muted-foreground mb-4 font-medium flex items-center gap-1.5">
                    <Pin className="w-3.5 h-3.5" />
                    검색된 상위 법령 ({lawFamilies.length}건) — 클릭하면 하위 법령 조문이 표시됩니다
                  </p>
                  <div className="space-y-2">
                    {lawFamilies.map((fam) => (
                      <button
                        key={fam.baseName}
                        onClick={() => { setSelectedLawFilter(fam.baseName); setCurrentPage(1); }}
                        className="w-full text-left p-4 border-2 rounded-lg hover:border-primary/50 hover:shadow-md transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-base">{fam.baseName}</div>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {fam.members.sort((a, b) => a.rank - b.rank).map((m) => {
                                const label = m.name.replace(fam.baseName, '').trim() || '법률';
                                return (
                                  <span key={m.name} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    {label} {m.count}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 ml-3" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 2차: 선택된 상위법의 하위 법령 조문 (정렬: 법률→시행령→시행규칙→별표→부칙) */}
              {selectedLawFilter && (
                <div className="mt-4 mb-4">
                  <button
                    onClick={() => { setSelectedLawFilter(null); setCurrentPage(1); }}
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    상위 법령 목록
                  </button>
                  <p className="text-sm font-semibold">{selectedLawFilter}</p>
                  <p className="text-xs text-muted-foreground mt-1">법률 → 시행령 → 시행규칙 → 별표 순으로 정렬</p>
                </div>
              )}

              {/* 검색 결과 (selectedLawFilter 있을 때만 조문 카드 표시) */}
              {selectedLawFilter && paginatedArticles && paginatedArticles.length > 0 ? (
                <>
                  <div className="text-xs text-muted-foreground mb-3 fadeIn">
                    {submittedQuery && <span className="font-medium">&ldquo;{submittedQuery}&rdquo;</span>}
                    {selectedLawFilter && <span className="ml-1 text-primary font-medium">· {selectedLawFilter}</span>}
                    {' '}{totalItems}건 중 {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, totalItems)}건
                  </div>
                  <SearchResults
                    results={{
                      ...results,
                      articles: paginatedArticles,
                      total_found: totalItems,
                    }}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    startIndex={(currentPage - 1) * ITEMS_PER_PAGE}
                    hideRelevantLaws={true}
                    onSearch={doSearch}
                  />
                </>
              ) : (
                selectedLawFilter && !error && (
                  <div className="text-center py-16 text-muted-foreground fadeIn">
                    <Scale className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>해당 법령의 조문이 없습니다.</p>
                  </div>
                )
              )}
              {!selectedLawFilter && lawFamilies.length === 0 && !loading && !error && (
                <div className="text-center py-16 text-muted-foreground fadeIn">
                  <Scale className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>검색 결과가 없습니다.</p>
                </div>
              )}
            </>
          )}
          {!results && !loading && !error && (
            <div className="text-center py-16 text-muted-foreground fadeIn">
              <Scale className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>검색어를 입력하세요.</p>
            </div>
          )}
        </div>
      )}

      {/* KGS CODE 탭 내용 */}
      {!loading && activeTab === 'kgs' && (
        <div className="space-y-6">
          {/* 자동 비교표 — 검색어/선택된 상위법 기반 */}
          {(selectedLawFilter || submittedQuery) && (
            <KGSComparison searchQuery={selectedLawFilter || submittedQuery} />
          )}

          {kgsResults.length > 0 ? (
            <div className="space-y-3 fadeIn">
              {kgsResults.map((rec) => (
                <div key={rec.code} className="p-4 border rounded-xl hover:bg-accent/50 transition-colors hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-[#0d9488] text-sm">{rec.code}</span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full fadeIn">
                          {rec.category} › {rec.subcategory}
                        </span>
                        <span className="text-xs text-muted-foreground fadeIn">
                          매칭도 {(rec.score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-sm font-medium fadeIn">{rec.name}</p>
                      {rec.matchedKeywords.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap fadeIn">
                          {rec.matchedKeywords.map((kw) => (
                            <span key={kw} className="text-xs bg-[#0d9488]/10 text-[#0d9488] px-2 py-0.5 rounded-full fadeIn">
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <a
                      href={
                        rec.pdfUrl
                          ? `https://cyber.kgs.or.kr/kgscode.codeNew.view.ex.do?pblcCd=${rec.pdfUrl.replace(/^.*\//, '').replace(/\.pdf$/, '')}`
                          : `https://cyber.kgs.or.kr/kgscode.codeNew.list.ex.do`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#0d9488] hover:underline flex-shrink-0 flex items-center gap-1 fadeIn"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      사이트 연결
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !loading && (
              <div className="text-center py-16 text-muted-foreground fadeIn">
                <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>관련 KGS CODE가 없습니다.</p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}