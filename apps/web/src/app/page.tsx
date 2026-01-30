'use client';

import { useState } from 'react';
import { Search, Zap, Shield, Clock, Database, CheckCircle2 } from 'lucide-react';
import type { SearchResponse } from '@/types/search';
import { SearchResults } from '@/components/SearchResults';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), top_k: 5 }),
      });

      if (!response.ok) {
        throw new Error('검색 실패');
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '서버 연결 실패. 백엔드 서버가 실행 중인지 확인하세요.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 py-8 sm:py-12 md:py-16">
      {/* Search Section */}
      <section className="text-center space-y-6 sm:space-y-8 max-w-4xl mx-auto w-full mb-8">
        <div className="space-y-3 sm:space-y-4">
          <div className="flex justify-center">
            <div className="p-2.5 sm:p-3 bg-primary/10 rounded-xl">
              <Search className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold">법령 검색</h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto px-4">
            자연어로 질문하시면 관련 법령을 즉시 찾아드립니다
          </p>
        </div>

        <div className="max-w-2xl mx-auto space-y-4">
          <form onSubmit={handleSearch} className="space-y-3 sm:space-y-4">
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예: 고압가스 제조 허가, 수소충전소 설치 기준"
              className="h-12 sm:h-14 lg:h-16 text-base sm:text-lg px-4 sm:px-6"
            />
            <Button
              type="submit"
              disabled={loading || !query}
              className="w-full h-12 sm:h-14 text-base sm:text-lg font-semibold"
              size="lg"
            >
              {loading ? (
                <>
                  <Clock className="w-5 h-5 mr-2 animate-spin" />
                  검색 중
                </>
              ) : (
                <>
                  <Search className="w-5 h-5 mr-2" />
                  검색
                </>
              )}
            </Button>
          </form>

          <div className="flex flex-wrap gap-2 sm:gap-3 items-center justify-center text-xs sm:text-sm">
            <Badge variant="secondary" className="gap-1 sm:gap-1.5 py-1 sm:py-1.5 px-2 sm:px-3">
              <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4" />
              LLM 미사용
            </Badge>
            <Separator orientation="vertical" className="h-4 sm:h-5 hidden sm:block" />
            <span className="font-medium text-muted-foreground">1초 이내</span>
            <Separator orientation="vertical" className="h-4 sm:h-5 hidden sm:block" />
            <span className="font-medium text-muted-foreground">100% 정확</span>
          </div>

          {error && (
            <div className="p-4 border border-destructive bg-destructive/10 rounded-lg text-center">
              <p className="text-base text-destructive font-semibold">
                ❌ {error}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Search Results */}
      {results && <SearchResults results={results} />}
    </div>
  );
}
