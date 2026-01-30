import { Clock, FileText, Hash, Scale } from 'lucide-react';
import type { SearchResponse } from '@/types/search';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface SearchResultsProps {
  results: SearchResponse;
}

export function SearchResults({ results }: SearchResultsProps) {
  return (
    <div className="space-y-6">
      {/* 검색 요약 */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              검색 결과: {results.total_found}건
            </CardTitle>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {results.metadata.search_time_ms.toFixed(0)}ms
              </Badge>
              {!results.metadata.llm_used && (
                <Badge variant="secondary">AI 분석</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 관련 법령 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Scale className="w-4 h-4" />
              관련 법령
            </div>
            <div className="flex flex-wrap gap-2">
              {results.relevant_laws.map((law) => (
                <Badge key={law} variant="default" className="text-sm py-1.5 px-3">
                  {law}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* 키워드 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Hash className="w-4 h-4" />
              검색 키워드
            </div>
            <div className="flex flex-wrap gap-2">
              {results.keywords.map((kw) => (
                <Badge key={kw} variant="outline" className="text-xs">
                  {kw}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 조항 목록 */}
      {results.articles.map((article, i) => (
        <Card
          key={`${article.law_name}-${article.article_number}-${i}`}
          className="border-2 hover:border-primary/50 transition-all hover:shadow-lg"
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-primary text-primary-foreground rounded-full font-bold text-lg">
                  {i + 1}
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-xl leading-tight">
                      {article.law_name} {article.article_number}
                    </CardTitle>
                    {article.article_type === 'appendix' && (
                      <Badge variant="secondary" className="text-xs">
                        별표
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-base">
                    {article.title}
                  </CardDescription>
                </div>
              </div>
              <Badge variant="default" className="text-sm font-semibold px-3 py-1">
                {Math.min(100, Math.round(article.relevance_score))}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 본문 */}
            <div
              className="text-sm leading-relaxed text-muted-foreground bg-muted/30 p-4 rounded-lg"
              dangerouslySetInnerHTML={{ __html: article.highlighted_content }}
            />

            {/* 참조 조항 */}
            {article.related_articles && article.related_articles.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-2">
                    관련 조항
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {article.related_articles.map((ref) => (
                      <Badge
                        key={ref.id}
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80"
                      >
                        {ref.article_number}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
