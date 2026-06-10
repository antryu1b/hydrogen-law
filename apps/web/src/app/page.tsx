'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Scale, Clock, History, X, FileText, BookOpen, ChevronRight, Home, ChevronLeft, AlertCircle, Pin, ArrowLeft, Anchor } from 'lucide-react';
import type { SearchResponse } from '@/types/search';
import { SearchResults } from '@/components/SearchResults';
import KGSComparison from '@/components/KGSComparison';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deriveLawType } from '@/lib/utils';

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
  // 선박(marine) sector
  '선박', '선박안전법', '선박용 연료전지', '어선법', '항만법',
  '위험물 해상운송', '한국선급', '선급검사',
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

type TabType = 'law' | 'kgs' | 'marine';
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
  const [selectedSubLaw, setSelectedSubLaw] = useState<string | null>(null); // 특정 하위법령(법률/시행령/시행규칙) 바로가기 필터
  const [searchStack, setSearchStack] = useState<string[]>([]); // cross-ref drill-down back stack
  const [scopeLaw, setScopeLaw] = useState<string | null>(null); // 법령 한정 chip (수소법/고압가스법/etc)
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

  // Header brand ("어플리케이션개발2팀 법령 검색") sends hl-go-home event when clicked.
  // Reset SPA state so user returns to landing instead of staying on results view.
  useEffect(() => {
    const handler = () => {
      setViewState('home');
      setResults(null);
      setError(null);
      setSelectedLawFilter(null);
      setSelectedSubLaw(null);
      setQuery('');
      setScopeLaw(null);
      setSearchStack([]);
    };
    window.addEventListener('hl-go-home', handler);
    return () => window.removeEventListener('hl-go-home', handler);
  }, []);

  const doSearch = async (searchQuery: string, fromCrossRef = false) => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    setCurrentPage(1);
    setSelectedLawFilter(null);
    setSelectedSubLaw(null);
    setSubmittedQuery(searchQuery.trim());
    setViewState('results');
    setSelectedLaw(null);

    if (!fromCrossRef) {
      // Fresh top-level search — reset the drill-down stack
      setSearchStack([]);
    }

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
    const keyword = query.trim();
    if (!keyword && !scopeLaw) {
      setError('검색어를 입력해주세요.');
      return;
    }
    setShowSuggestions(false);
    // If a law-scope chip is active, prepend it: 수소법 AND <keyword>.
    const fullQuery = scopeLaw && keyword ? `${scopeLaw} ${keyword}` : (scopeLaw || keyword);
    await doSearch(fullQuery);
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

  // Cross-ref handler: push current query onto the back stack before drilling down
  const handleCrossRefSearch = useCallback(
    (newQuery: string) => {
      setSearchStack((prev) => (submittedQuery ? [...prev, submittedQuery] : prev));
      doSearch(newQuery, true);
    },
    [submittedQuery] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Back navigation: pop the stack and re-run the previous query (no re-push)
  const handleBack = useCallback(() => {
    setSearchStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const previousQuery = next.pop()!;
      doSearch(previousQuery, true);
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (lawName.includes('별표')) return 3;
    if (lawName.includes('부칙')) return 4;
    const ty = deriveLawType(lawName, lawType);
    if (ty === '시행규칙') return 2;
    if (ty === '시행령') return 1;
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

    // selectedSubLaw(특정 법령 정확일치) 우선, 없으면 family base 매칭
    const filtered = articles.filter((a) =>
      selectedSubLaw ? a.law_name === selectedSubLaw : getBaseLawName(a.law_name) === selectedLawFilter
    );
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
      <div className="min-h-[82vh] flex flex-col items-center justify-center px-4 -mt-4 home-bg">
        {/* 마스트헤드 */}
        <div className="mb-9 text-center">
          <h1 className="font-display mb-3 text-[2.1rem] font-bold leading-[1.12] tracking-tight text-foreground md:text-[2.75rem] rise-in" style={{ animationDelay: '90ms' }}>
            수소·고압가스 법령 검색
          </h1>
          <p className="mx-auto max-w-xl text-[15px] leading-relaxed text-muted-foreground rise-in" style={{ animationDelay: '140ms' }}>
            관련 법령과 KGS CODE 기술기준을 한 번에. 국가법령정보센터 기반의 정확한 1차 검색.
          </p>
        </div>

        {/* 검색창 */}
        <div className="w-full max-w-2xl rise-in" style={{ animationDelay: '190ms' }}>
          <form onSubmit={handleSearch} className="relative">
            <div className="relative">
              {/* 법령 한정 badge — absolute at input's left edge, inside the search bar */}
              {scopeLaw && (
                <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1 pl-3 pr-1.5 py-1.5 bg-primary/15 border border-primary/40 rounded-full text-sm font-bold text-primary fadeIn">
                  <span>{scopeLaw}</span>
                  <button
                    type="button"
                    onClick={() => setScopeLaw(null)}
                    className="p-0.5 rounded-full hover:bg-primary/20 transition-colors"
                    aria-label="법령 한정 해제"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
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
                placeholder={scopeLaw ? `${scopeLaw} 안에서 키워드 검색...` : "법령명, 조문, 키워드로 검색..."}
                className={`h-14 rounded-xl border-2 border-input bg-card pr-32 text-base shadow-[0_2px_10px_-4px_hsl(var(--primary)/0.18)] transition-all focus:shadow-[0_6px_24px_-8px_hsl(var(--primary)/0.30)] focus-visible:border-[hsl(var(--brass)/0.7)] focus-visible:ring-[hsl(var(--brass)/0.30)] ${scopeLaw ? 'pl-36' : 'pl-5'}`}
                autoComplete="off"
              />
              <Button
                type="submit"
                disabled={loading || !query.trim()}
                className="absolute right-2 top-2 h-10 rounded-lg px-5 transition-transform duration-200 hover:scale-[1.03] active:scale-95"
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
                className="absolute top-full left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-border/80 bg-popover shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.30)] fadeIn"
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

          {/* 주요 법령 — 빠른 검색 (선박 sector: 선박안전법 포함) */}
          <div className="mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {['수소법', '고압가스법', '산업안전보건법', '선박안전법'].map((law) => (
                <button
                  key={law}
                  type="button"
                  onClick={() => {
                    setScopeLaw(law);
                    setQuery('');                // chip carries the scope; input cleared for keyword
                    setShowSuggestions(false);   // close any open autocomplete
                    // intentionally NOT focusing input — focus → onFocus → reopens dropdown
                    // → covers results on next page. User clicks input themselves to refine.
                    doSearch(law);               // immediate search shows law family
                  }}
                  disabled={loading}
                  className={`h-10 rounded-md border text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    scopeLaw === law
                      ? 'border-[hsl(var(--brass)/0.6)] bg-[hsl(var(--brass)/0.12)] text-[hsl(var(--brass))]'
                      : 'border-input bg-card/60 text-foreground/85 hover:border-foreground/30 hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {law}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive text-center mt-3 fadeIn">{error}</p>
          )}

          {/* 키워드 예시 */}
          <div className="mt-8">
            <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              예시 검색어
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {['수소충전소', '안전기준', '고압가스', '수소안전', '수소저장', '등록신고'].map((kw) => (
                <button
                  key={kw}
                  onClick={() => handleSelectSuggestion(kw)}
                  className="rounded-full border border-border/80 bg-card/50 px-3.5 py-1.5 text-xs text-muted-foreground transition-all hover:border-[hsl(var(--brass)/0.5)] hover:bg-accent hover:text-foreground"
                >
                  {kw}
                </button>
              ))}
            </div>
          </div>

          {/* Gazette divider with § mark */}
          <div className="relative mb-4 mt-9">
            <div className="gazette-rule" />
            <span className="font-display absolute -top-3.5 left-1/2 -translate-x-1/2 bg-background px-3 text-base text-[hsl(var(--brass))]">
              §
            </span>
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
            {/* 법령 한정 badge (same as landing form, 결과 페이지에도 노출) */}
            {scopeLaw && (
              <div className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1 pl-2.5 pr-1 py-1 bg-primary/15 border border-primary/40 rounded-full text-xs font-bold text-primary fadeIn">
                <span>{scopeLaw}</span>
                <button
                  type="button"
                  onClick={() => setScopeLaw(null)}
                  className="p-0.5 rounded-full hover:bg-primary/20 transition-colors"
                  aria-label="법령 한정 해제"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
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
              placeholder={scopeLaw ? `${scopeLaw} 안에서 키워드...` : "검색어 입력..."}
              className={`h-11 pr-4 ${query ? 'ring-primary/30 ring-2' : ''} ${scopeLaw ? 'pl-32' : 'pl-4'}`}
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
            onClick={() => { setViewState('home'); setResults(null); setError(null); setSelectedLawFilter(null); setSelectedSubLaw(null); }}
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

      {/* 이전 검색결과로 돌아가기 */}
      {searchStack.length > 0 && (
        <div className="mb-3 fadeIn">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="gap-1.5 text-sm text-muted-foreground hover:text-foreground px-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>
              &ldquo;{searchStack[searchStack.length - 1]}&rdquo; 결과로 돌아가기
            </span>
          </Button>
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
            <span className="absolute left-2 top-2 ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary fadeIn">
              {results.articles.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('kgs')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'kgs'
              ? 'border-[hsl(var(--brass))] text-[hsl(var(--brass))]'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          } fadeIn`}
        >
          <BookOpen className="w-4 h-4" />
          KGS CODE
          {kgsResults.length > 0 && (
            <span className="absolute left-2 top-2 ml-1 rounded-full bg-[hsl(var(--brass)/0.12)] px-2 py-0.5 text-xs font-semibold text-[hsl(var(--brass))] fadeIn">
              {kgsResults.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('marine')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'marine'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          } fadeIn`}
        >
          <Anchor className="w-4 h-4" />
          선박 기술기준
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
                      <div
                        key={fam.baseName}
                        className="group w-full rounded-lg border-2 border-border/70 bg-card p-4 transition-all hover:border-[hsl(var(--brass)/0.55)] hover:shadow-[0_4px_18px_-8px_hsl(var(--primary)/0.25)]"
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => { setSelectedLawFilter(fam.baseName); setSelectedSubLaw(null); setCurrentPage(1); }}
                              className="font-display text-base font-bold text-left hover:text-[hsl(var(--brass))] transition-colors"
                            >
                              {fam.baseName}
                            </button>
                            {/* 하위 법령 배지 — 클릭하면 그 법령 조문만 바로가기 */}
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {fam.members.sort((a, b) => a.rank - b.rank).map((m) => {
                                const label = m.name.replace(fam.baseName, '').trim() || deriveLawType(m.name);
                                return (
                                  <button
                                    key={m.name}
                                    type="button"
                                    onClick={() => { setSelectedLawFilter(fam.baseName); setSelectedSubLaw(m.name); setCurrentPage(1); }}
                                    title={`${label} 조문만 보기`}
                                    className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-[hsl(var(--brass)/0.18)] hover:text-foreground transition-colors cursor-pointer"
                                  >
                                    {label} {m.count}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setSelectedLawFilter(fam.baseName); setSelectedSubLaw(null); setCurrentPage(1); }}
                            aria-label={`${fam.baseName} 전체 보기`}
                            className="ml-3 shrink-0"
                          >
                            <ChevronRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-[hsl(var(--brass))]" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2차: 선택된 상위법의 하위 법령 조문 (정렬: 법률→시행령→시행규칙→별표→부칙) */}
              {selectedLawFilter && (
                <div className="mt-4 mb-4">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <button
                      onClick={() => { setSelectedLawFilter(null); setSelectedSubLaw(null); setCurrentPage(1); }}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      상위 법령 목록
                    </button>
                    {selectedSubLaw && (
                      <button
                        onClick={() => { setSelectedSubLaw(null); setCurrentPage(1); }}
                        className="text-xs text-[hsl(var(--brass))] hover:underline inline-flex items-center gap-1"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        {selectedLawFilter} 전체
                      </button>
                    )}
                  </div>
                  <p className="text-sm font-semibold">{selectedSubLaw || selectedLawFilter}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedSubLaw ? '이 법령의 조문만 표시' : '법률 → 시행령 → 시행규칙 → 별표 순으로 정렬'}
                  </p>
                </div>
              )}

              {/* 검색 결과 (selectedLawFilter 있을 때만 조문 카드 표시) */}
              {selectedLawFilter && paginatedArticles && paginatedArticles.length > 0 ? (
                <>
                  <div className="text-xs text-muted-foreground mb-3 fadeIn">
                    {submittedQuery && <span className="font-medium">&ldquo;{submittedQuery}&rdquo;</span>}
                    {(selectedSubLaw || selectedLawFilter) && <span className="ml-1 text-primary font-medium">· {selectedSubLaw || selectedLawFilter}</span>}
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
                    onSearch={handleCrossRefSearch}
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

          {!loading && !(selectedLawFilter || submittedQuery) && (
            <div className="text-center py-16 text-muted-foreground fadeIn">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>관련 KGS CODE가 없습니다.</p>
            </div>
          )}
        </div>
      )}

      {/* 선박 기술기준 탭 내용 (KGS CODE 아님 — 한국선급·해수부 등 별도 발급기관) */}
      {!loading && activeTab === 'marine' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-amber-200/60 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <Anchor className="w-4 h-4 text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
              <span className="text-sm font-semibold text-foreground">선박 수소연료전지 기술기준</span>
              <span className="text-[10px] text-amber-600 font-medium bg-amber-100/70 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
                KGS CODE 아님 — 발급기관 상이
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              한국선급(KR)·해양수산부(해수부) 등 한국가스안전공사가 아닌 기관이 발급한 선박 분야 기술기준입니다.
            </p>
          </div>

          {(selectedLawFilter || submittedQuery) && (
            <KGSComparison
              searchQuery={selectedLawFilter || submittedQuery}
              section="marine"
            />
          )}

          {!loading && !(selectedLawFilter || submittedQuery) && (
            <div className="text-center py-16 text-muted-foreground fadeIn">
              <Anchor className="w-10 h-10 mx-auto mb-3 opacity-30" strokeWidth={1.5} />
              <p>선박 관련 검색어를 입력하세요 (예: 선박안전법, 선박용 연료전지).</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}