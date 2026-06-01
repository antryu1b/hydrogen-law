'use client';

import { useState } from 'react';
import DOMPurify from 'dompurify';
import { Clock, FileText, Hash, Scale, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, TableProperties, ExternalLink, AlertTriangle } from 'lucide-react';
import type { SearchResponse } from '@/types/search';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const CONTENT_PREVIEW_LENGTH = 300;

interface SearchResultsProps {
  results: SearchResponse;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  startIndex?: number;
  hideRelevantLaws?: boolean; // 관련 법령 섹션 숨김 (page.tsx에서 필터로 대체할 때)
  onSearch?: (q: string) => void; // cross-reference citation clicks
}

/** Format legal content: add line breaks before numbered items for readability */
function formatLegalContent(html: string): string {
  let formatted = html;
  // Numbered items: 1., 2., 10. etc. (at start or after space)
  formatted = formatted.replace(/(?<=[.\s>])(\d+\.\s)/g, '<br/><br/>$1');
  // Korean letter items: 가., 나., 다. etc.
  formatted = formatted.replace(/(?<=[.\s>])([가-힣]\.\s)/g, '<br/>$1');
  // Circle numbers: ①, ②, ③ etc.
  formatted = formatted.replace(/([\u2460-\u2473\u3251-\u326D])/g, '<br/><br/>$1');
  // Korean ordinal markers: 제1호, 제2호 etc. at line start
  formatted = formatted.replace(/(?<=[.\s>])(제\d+[호조항])/g, '<br/>$1');
  // Clean up excessive line breaks
  formatted = formatted.replace(/(<br\s*\/?>\s*){3,}/g, '<br/><br/>');
  return formatted;
}

/** Strip markdown syntax from legalize-kr content */
function cleanMarkdown(text: string): string {
  if (!text) return '';
  let cleaned = text;
  // Strip next-chapter/section headers that bleed into this article
  cleaned = cleaned.replace(/\n+#{1,3}\s+제\d+장[\s\S]*$/m, '');
  cleaned = cleaned.replace(/\n+#{1,3}\s+제\d+절[\s\S]*$/m, '');
  // Headers: remove ##### prefix
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
  // Bold: **text** → text
  cleaned = cleaned.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  // Italic: *text* → text
  cleaned = cleaned.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2');
  // Stray asterisks
  cleaned = cleaned.replace(/\*+/g, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  // Bold bare article sub-headings that appear at the start of a line:
  // e.g. "제1조 (목적)" or "제12조의2 (정의)" — these are the article's own structure.
  // Only matches when 제N조 is the FIRST non-whitespace token on a line (not mid-sentence cross-refs).
  cleaned = cleaned.replace(
    /^(\s*)(제\d+조(?:의\d+)?(?:\s*\([^)]+\))?)/gm,
    '$1<strong>$2</strong>'
  );
  return cleaned.trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Add <mark class="kw-highlight"> for matched keywords.
 *  Styled via globals.css so it respects dark mode. */
function highlightKeywords(text: string, keywords: string[]): string {
  const valid = keywords.filter(k => k && k.length > 0).map(escapeRegex);
  if (!valid.length) return text;
  // Sort longest first so multi-char keywords take priority over sub-fragments
  valid.sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${valid.join('|')})`, 'g');
  return text.replace(re, '<mark class="kw-highlight">$1</mark>');
}

/**
 * Detect Korean legal citation patterns and wrap them in anchor tags
 * that trigger a search via ?q=... navigation.
 *
 * Matched patterns (conservative — only clear citations):
 *  - 「법령명」 제N조 (optional 제N항/호)
 *  - 법령명 제N조 (where name ends in 법/령/규칙/지침/고시/규정)
 *  - 같은 법 제N조 / 이 법 제N조
 *  - 제N조제N항 / 제N조의N
 *
 * onSearch: called with the query string when user clicks the link.
 */
function linkifyLegalCitations(html: string, onSearch: (q: string) => void): string {
  // We work on the raw HTML string but are careful not to break existing tags.
  // Strategy: replace patterns that appear OUTSIDE existing HTML tags.
  // Since the input may already have <mark> and <br/> tags, we do a split-around-tags approach.

  // Pattern A: 「법령명」제N조 (with optional 제N항/호 suffix)
  const patternA = /「([^」]+)」\s*(제\d+조(?:의\d+)?(?:제\d+항)?(?:제\d+호)?)/g;
  // Pattern B: (법|령|규칙|규정|지침|고시)으로 끝나는 법령명 + 공백 + 제N조
  const patternB = /([가-힣A-Za-z\s]{2,20}(?:법|령|규칙|규정|지침|고시))\s+(제\d+조(?:의\d+)?(?:제\d+항)?(?:제\d+호)?)/g;
  // Pattern C: "같은 법" / "이 법" / "해당 법" + 제N조
  const patternC = /(같은\s*법|이\s*법|해당\s*법)\s+(제\d+조(?:의\d+)?(?:제\d+항)?(?:제\d+호)?)/g;

  // We need a placeholder mechanism to avoid double-linking
  // Use a unique marker that won't appear in legal text
  const PLACEHOLDER = '\x00LINK\x00';
  const links: { query: string; label: string }[] = [];

  function makeAnchor(label: string, query: string): string {
    links.push({ query, label });
    return `${PLACEHOLDER}${links.length - 1}${PLACEHOLDER}`;
  }

  // Split around existing HTML tags so we only replace in text nodes
  const parts = html.split(/(<[^>]+>)/);
  const processed = parts.map(part => {
    if (part.startsWith('<')) return part; // skip existing tags
    let out = part;
    out = out.replace(patternA, (_, lawName, articleRef) => {
      const label = `「${lawName}」 ${articleRef}`;
      const q = `${lawName} ${articleRef}`;
      return makeAnchor(label, q);
    });
    out = out.replace(patternB, (_, lawName, articleRef) => {
      const trimmed = lawName.trim();
      const label = `${trimmed} ${articleRef}`;
      const q = `${trimmed} ${articleRef}`;
      return makeAnchor(label, q);
    });
    out = out.replace(patternC, (_, lawRef, articleRef) => {
      const label = `${lawRef} ${articleRef}`;
      // For "같은 법 / 이 법" we only link the article reference; query is article only
      return makeAnchor(label, articleRef);
    });
    return out;
  });

  let result = processed.join('');
  // Replace placeholders with actual anchor elements
  result = result.replace(/\x00LINK\x00(\d+)\x00LINK\x00/g, (_, idx) => {
    const { label, query } = links[parseInt(idx, 10)];
    // Use data-cite-query so the React onClick handler (added via event delegation) can intercept
    return `<a class="cite-link" data-cite-query="${escapeHtmlAttr(query)}" href="#">${label}</a>`;
  });

  return result;
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isAppendix(article: SearchResponse['articles'][number]): boolean {
  return article.article_type === 'appendix'
    || article.article_number.includes('별표')
    || article.title.includes('별표');
}

function ArticleCard({ article, index, keywords = [], onSearch }: { article: SearchResponse['articles'][number]; index: number; keywords?: string[]; onSearch?: (q: string) => void }) {
  const appendix = isAppendix(article);
  const [expanded, setExpanded] = useState(false);
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [fullError, setFullError] = useState<string | null>(null);

  const loadFullContent = async () => {
    if (fullContent || loadingFull) return;
    setLoadingFull(true);
    setFullError(null);
    try {
      const res = await fetch('/api/law-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ law_name: article.law_name, article_number: article.article_number }),
      });
      const data = await res.json();
      if (data.content) {
        setFullContent(data.content);
      } else {
        setFullError(data.error || '전문을 가져오지 못했습니다');
      }
    } catch (e) {
      setFullError('서버 연결 실패');
    } finally {
      setLoadingFull(false);
    }
  };

  // Clean markdown from content, then highlight keywords, then linkify legal citations
  const cleanContent = cleanMarkdown(article.content);
  const highlightedSnippet = highlightKeywords(cleanContent, keywords);
  const linkedSnippet = onSearch ? linkifyLegalCitations(highlightedSnippet, onSearch) : highlightedSnippet;
  const rawSanitized = DOMPurify.sanitize(linkedSnippet, {
    ALLOWED_TAGS: ['mark', 'br', 'a', 'strong'],
    ALLOWED_ATTR: ['class', 'data-cite-query', 'href'],
  });
  const sanitized = appendix ? formatLegalContent(rawSanitized) : rawSanitized;
  // Cleaned full text for "전문 보기"
  const cleanFullContent = fullContent ? cleanMarkdown(fullContent) : null;
  const highlightedFull = cleanFullContent ? highlightKeywords(cleanFullContent, keywords) : null;
  const fullHtml = highlightedFull && onSearch ? linkifyLegalCitations(highlightedFull, onSearch) : highlightedFull;

  const isLong = article.content.length > CONTENT_PREVIEW_LENGTH;

  // For appendix: extract a short summary
  const summaryText = (() => {
    if (!appendix) return '';
    const plain = article.content.replace(/\n/g, ' ').trim();
    const firstSentence = plain.match(/^.{0,150}[.)\]]\s/);
    return firstSentence ? firstSentence[0].trim() : plain.slice(0, 120) + '…';
  })();

  // 국가법령정보센터 검색 URL
  const lawInfoUrl = `https://www.law.go.kr/lsSc.do?section=&menuId=1&subMenuId=15&tabMenuId=81&eventGubun=060101&query=${encodeURIComponent(article.law_name)}`;

  return (
    <Card className={`border-2 hover:border-primary/50 transition-all hover:shadow-lg ${appendix ? 'border-amber-200 dark:border-amber-800' : ''}`}>
      <CardHeader className={appendix ? 'pb-2' : ''}>
        <div className="flex items-start gap-4 flex-1">
          <div className={`flex-shrink-0 w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center rounded-full font-bold text-sm sm:text-lg ${appendix ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : 'bg-primary text-primary-foreground'}`}>
            {appendix ? <TableProperties className="w-4 h-4 sm:w-5 sm:h-5" /> : index + 1}
          </div>
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm sm:text-lg leading-tight">
                <a
                  href={lawInfoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary hover:underline inline-flex items-center gap-1"
                >
                  {article.law_name} {article.article_number}
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 opacity-50" />
                </a>
              </CardTitle>
              {appendix && (
                <Badge variant="secondary" className="text-[10px] sm:text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                  별표
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs sm:text-sm font-semibold text-foreground/80">
              {article.title}
            </CardDescription>
            {/* Appendix: show summary when collapsed */}
            {appendix && !expanded && summaryText && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {summaryText}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Content area: hidden for appendix when collapsed */}
      {(!appendix || expanded) && (
        <CardContent className="space-y-4">
          <div className="relative">
            <div
              className={`prose-legal rounded-lg border border-border/50 bg-muted/40 p-3 text-xs text-foreground/80 sm:p-4 sm:text-sm ${!expanded && isLong && !fullHtml ? 'max-h-48 overflow-hidden' : ''} ${appendix || fullHtml ? 'max-h-[70vh] overflow-y-auto whitespace-pre-wrap' : ''}`}
              dangerouslySetInnerHTML={{ __html: fullHtml ? fullHtml.replace(/\n/g, '<br/>') : sanitized }}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                const anchor = target.closest('a.cite-link') as HTMLAnchorElement | null;
                if (anchor && onSearch) {
                  e.preventDefault();
                  const q = anchor.getAttribute('data-cite-query');
                  if (q) onSearch(q);
                }
              }}
            />
            {!expanded && isLong && !appendix && !fullContent && (
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent rounded-b-lg" />
            )}
            {loadingFull && (
              <div className="text-xs text-center text-muted-foreground py-2">조문 전문 불러오는 중...</div>
            )}
            {fullError && (
              <div className="text-xs text-destructive py-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                {fullError}
              </div>
            )}
          </div>
          {/* 전문 보기 링크 */}
          <div className="flex justify-end">
            <a
              href={lawInfoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              국가법령정보센터에서 전문 보기
            </a>
          </div>

          {article.related_articles && article.related_articles.length > 0 && (
            <div className="space-y-2">
              <Separator />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-2">
                  관련 조항
                </p>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {article.related_articles.map((ref) => (
                    <Badge
                      key={ref.id}
                      variant="secondary"
                      className="text-xs"
                    >
                      {ref.article_number}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      )}

      {/* 통일된 전문 보기 / 접기 버튼 */}
      <div className="px-4 sm:px-6 pb-4">
        <Button
          variant={expanded ? 'ghost' : 'outline'}
          size="sm"
          className="w-full text-xs"
          onClick={() => {
            if (!expanded && !fullContent) {
              loadFullContent();
            }
            setExpanded(!expanded);
          }}
          disabled={loadingFull}
        >
          {loadingFull ? (
            <>로딩 중...</>
          ) : expanded ? (
            <>
              <ChevronUp className="w-4 h-4 mr-1" />
              접기
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4 mr-1" />
              {appendix ? '별표 내용 보기' : '전문 보기'}
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

export function SearchResults({ results, currentPage = 1, totalPages = 1, onPageChange, startIndex = 0, hideRelevantLaws = false, onSearch }: SearchResultsProps) {
  // 페이지 번호 생성 (현재 페이지 주변 표시)
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      if (start > 2) pages.push('ellipsis');
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 검색 요약 */}
      <Card className="border-2">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
              검색 결과: {results.total_found}건
            </CardTitle>
            <div className="flex items-center gap-2 sm:gap-3">
              <Badge variant="outline" className="gap-1 sm:gap-1.5 text-xs sm:text-sm">
                <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                {results.metadata.search_time_ms.toFixed(0)}ms
              </Badge>
              {!results.metadata.llm_used && (
                <Badge variant="secondary" className="text-xs sm:text-sm">AI 분석</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {/* 관련 법령 - hideRelevantLaws prop으로 숨길 수 있음 */}
          {!hideRelevantLaws && (
            <>
              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground">
                  <Scale className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  관련 법령
                </div>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {results.relevant_laws.map((law) => (
                    <Badge key={law} variant="default" className="text-xs sm:text-sm py-1 sm:py-1.5 px-2 sm:px-3">
                      {law}
                    </Badge>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* 키워드 */}
          <div className="space-y-1.5 sm:space-y-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-muted-foreground">
              <Hash className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              검색 키워드
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {results.keywords.map((kw) => (
                <Badge key={kw} variant="outline" className="text-[10px] sm:text-xs">
                  {kw}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty-state fallback — when we have no rows, offer external 법제처 search */}
      {results.total_found === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground mb-1">
                이 검색어는 우리 DB에 없습니다
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                현재 DB는 수소·고압가스·안전법규 도메인 위주입니다. 다른 법령은 법제처에서 직접 검색하실 수 있습니다.
              </p>
            </div>
            <a
              href={`https://www.law.go.kr/lsSc.do?query=${encodeURIComponent(results.query || '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm px-3 py-2 rounded-md border border-input bg-background hover:bg-accent transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              law.go.kr에서 검색
            </a>
          </CardContent>
        </Card>
      )}

      {/* 조항 목록 */}
      <div className="space-y-4">
      {results.articles.map((article, i) => (
        <ArticleCard
          key={`${article.law_name}-${article.article_number}-${startIndex + i}`}
          article={article}
          index={startIndex + i}
          keywords={results.keywords || []}
          onSearch={onSearch}
        />
      ))}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-center gap-1 sm:gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="h-8 w-8 sm:h-9 sm:w-9 p-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {getPageNumbers().map((page, idx) =>
            page === 'ellipsis' ? (
              <span key={`ellipsis-${idx}`} className="px-1 sm:px-2 text-muted-foreground text-sm">…</span>
            ) : (
              <Button
                key={page}
                variant={page === currentPage ? 'default' : 'outline'}
                size="sm"
                onClick={() => onPageChange(page)}
                className="h-8 w-8 sm:h-9 sm:w-9 p-0 text-xs sm:text-sm"
              >
                {page}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="h-8 w-8 sm:h-9 sm:w-9 p-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
