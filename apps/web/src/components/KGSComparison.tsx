'use client';

import { useState, useEffect } from 'react';
import { BookOpen, ExternalLink, Loader2, Wrench } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface KGSCode {
  code: string;
  name: string;
  category: string;
  subcategory: string;
  updated: string;
  pages: number;
  pdfUrl: string;
}

interface ComparisonRow {
  criterion: string;
  [key: string]: string;
}

interface KGSComparisonProps {
  searchQuery: string;
}

export default function KGSComparison({ searchQuery }: KGSComparisonProps) {
  const [recommendations, setRecommendations] = useState<Array<{
    code: string;
    name: string;
    category: string;
    subcategory: string;
    score: number;
    matchedKeywords: string[];
  }>>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [comparison, setComparison] = useState<{
    codes: KGSCode[];
    comparison: ComparisonRow[];
    criteria: string[];
  } | null>(null);
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

  // 비교표 가져오기
  useEffect(() => {
    if (selectedCodes.length === 0) {
      setComparison(null);
      return;
    }

    const fetchComparison = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/kgs/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes: selectedCodes }),
        });

        if (res.ok) {
          const data = await res.json();
          setComparison(data);
        }
      } catch (error) {
        console.error('Comparison fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();
  }, [selectedCodes]);

  const toggleCode = (code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code]
    );
  };

  if (recommendations.length === 0 && !loading) {
    return null;
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <Wrench className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold text-foreground">관련 KGS CODE</h2>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* 추천 목록 */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          검색어와 관련된 기술기준을 선택하세요 (최대 5개)
        </p>
        <div className="space-y-1.5">
          {recommendations.map((rec) => (
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

      {/* 비교표 */}
      {comparison && comparison.codes.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="py-3 px-4 bg-muted/50">
            <CardTitle className="text-sm font-semibold">비교표</CardTitle>
            <CardDescription className="text-xs">
              선택한 {comparison.codes.length}개 CODE의 주요 기준 비교
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="p-3 text-left font-medium text-muted-foreground border-r sticky left-0 bg-muted/30 min-w-[120px] text-xs">
                      항목
                    </th>
                    {comparison.codes.map((code) => (
                      <th key={code.code} className="p-3 text-left min-w-[200px] align-top">
                        <div className="font-mono font-bold text-[#0d9488] text-sm">
                          {code.code}
                        </div>
                        <div className="text-xs font-normal text-muted-foreground mt-0.5">
                          {code.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                          {code.category} › {code.subcategory}
                        </div>
                        <a
                          href={code.pdfUrl || 'https://cyber.kgs.or.kr/kgscode.codeNew.list.ex.do'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[#0d9488] hover:underline mt-1.5 inline-flex items-center gap-0.5"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          사이트 연결
                        </a>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.comparison.map((row, idx) => (
                    <tr
                      key={row.criterion}
                      className={`border-b last:border-0 ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}
                    >
                      <td className="p-3 font-medium border-r sticky left-0 bg-inherit text-xs text-muted-foreground">
                        {row.criterion}
                      </td>
                      {comparison.codes.map((code) => (
                        <td key={code.code} className="p-3 text-sm">
                          {row[code.code] || (
                            <span className="text-muted-foreground/50 text-xs">해당없음</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && recommendations.length === 0 && (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">불러오는 중...</span>
        </div>
      )}
    </div>
  );
}
