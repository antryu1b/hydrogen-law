'use client';

import { useState } from 'react';
import DOMPurify from 'dompurify';
import { Clock, FileText, Hash, Scale, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, TableProperties, ExternalLink } from 'lucide-react';
import Link from 'next/link';
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

function isAppendix(article: SearchResponse['articles'][number]): boolean {
  return article.article_type === 'appendix'
    || article.article_number.includes('별표')
    || article.title.includes('별표');
}

function ArticleCard({ article, index }: { article: SearchResponse['articles'][number]; index: number }) {
  const appendix = isAppendix(article);
  const [expanded, setExpanded] = useState(false);

  const rawSanitized = DOMPurify.sanitize(article.highlighted_content, {
    ALLOWED_TAGS: ['mark', 'br'],
    ALLOWED_ATTR: ['style'],
  });
  const sanitized = appendix ? formatLegalContent(rawSanitized) : rawSanitized;

  const isLong = article.content.length > CONTENT_PREVIEW_LENGTH;
  const collapsible = appendix || isLong;

  // For appendix: extract a short summary
  const summaryText = (() => {
    if (!appendix) return '';
    const plain = article.content.replace(/\n/g, ' ').trim();
    const firstSentence = plain.match(/^.{0,150}[.)\]]\s/);
    return firstSentence ? firstSentence[0].trim() : plain.slice(0, 120) + '…';
  })();

  const articleLink = `/laws/${encodeURIComponent(article.article_id || `${article.law_name}_${article.article_number}`)}`;

  return (
    <Card className={`border-2 hover:border-primary/50 transition-all hover:shadow-lg ${appendix ? 'border-amber-200 dark:border-amber-800' : ''}`}>
      <CardHeader className={appendix ? 'pb-2' : ''}>
        <div className="flex items-start gap-4 flex-1">
          <div className={`flex-shrink-0 w-7 h-7 sm:w-10 sm:h-10 flex items-center justify-center rounded-full font-bold text-sm sm:text-lg ${appendix ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : 'bg-primary text-primary-foreground'}`}>
            {appendix ? <TableProperties className="w-4 h-4 sm:w-5 sm:h-5" /> : index + 1}
          </div>
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm sm:text-xl leading-tight">
                <Link
                  href={articleLink}
                  className="hover:text-primary hover:underline inline-flex items-center gap-1"
                >
                  {article.law_name} {article.article_number}
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 opacity-50" />
                </Link>
              </CardTitle>
              {appendix && (
                <Badge variant="secondary" className="text-[10px] sm:text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                  별표
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs sm:text-base truncate">
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
              className={`text-xs sm:text-sm leading-relaxed text-muted-foreground bg-muted/30 p-3 sm:p-4 rounded-lg ${!expanded && isLong ? 'max-h-40 overflow-hidden' : ''} ${appendix ? 'max-h-[60vh] overflow-y-auto' : ''}`}
              dangerouslySetInnerHTML={{ __html: sanitized }}
            />
            {!expanded && isLong && !appendix && (
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent rounded-b-lg" />
            )}
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
                    <Link key={ref.id} href={`/laws/${encodeURIComponent(ref.id)}`}>
                      <Badge
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80 text-xs"
                      >
                        {ref.article_number}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      )}

      {/* Expand/collapse button */}
      {collapsible && (
        <div className="px-4 sm:px-6 pb-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-1" />
                접기
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1" />
                {appendix ? '별표 내용 보기' : '상세보기'}
              </>
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}

export function SearchResults({ results, currentPage = 1, totalPages = 1, onPageChange, startIndex = 0 }: SearchResultsProps) {
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
          {/* 관련 법령 */}
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

      {/* 조항 목록 */}
      {results.articles.map((article, i) => (
        <ArticleCard
          key={`${article.law_name}-${article.article_number}-${startIndex + i}`}
          article={article}
          index={startIndex + i}
        />
      ))}

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
