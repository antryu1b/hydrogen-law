'use client';

import { useState } from 'react';
import Link from 'next/link';

type Lens = 'design' | 'production';

interface IntegrateItem {
  law_name: string;
  law_type: string;
  article_no: string;
  title: string;
  snippet: string;
}

interface IntegrateGroup {
  category: string;
  count: number;
  shown: number;
  items: IntegrateItem[];
}

interface IntegrateResponse {
  topic: string;
  lens: Lens;
  keywords: string[];
  total: number;
  groups: IntegrateGroup[];
}

const LENS_LABEL: Record<Lens, string> = {
  design: '설계',
  production: '생산',
};

// 키워드를 brass 마크로 강조 (정규식 특수문자 이스케이프)
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(text: string, keywords: string[]) {
  if (!text) return null;
  const valid = keywords.filter((k) => k && k.length > 0).map(escapeRegex);
  if (valid.length === 0) return text;
  const re = new RegExp(`(${valid.join('|')})`, 'gi');
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part) ? (
      <mark key={i} className="kw-highlight">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function IntegratePage() {
  const [topic, setTopic] = useState('');
  const [lens, setLens] = useState<Lens>('design');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntegrateResponse | null>(null);

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const t = topic.trim();
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/integrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: t, lens }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || '검색 중 문제가 발생했습니다');
        setResult(null);
      } else {
        setResult(json as IntegrateResponse);
      }
    } catch {
      setError('검색 서버에 연결할 수 없습니다');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const groupCount = result?.groups.length ?? 0;
  const articleCount = result?.total ?? 0;

  return (
    // 본문비교 페이지와 동일 폭 (헤더 컨테이너 90rem)
    <main className="max-w-[90rem] mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-px w-6 bg-[hsl(var(--brass)/0.7)]" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--brass))]">
          교차참조 통합 요건
        </span>
      </div>
      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-2">
        한 주제로, 모든 분야의 조문을 한자리에
      </h1>
      <p className="text-muted-foreground mb-8 leading-relaxed">
        주제 키워드와 관점(설계·생산)을 고르면 수소·가스 법령, 선박 법령, 선박 기술기준에
        흩어진 관련 조문을 분야별로 묶어 보여줍니다. 합성·해설 없이 법령 원문에서 찾은
        조문만 그대로 모읍니다.
      </p>

      {/* 검색 폼 */}
      <form
        onSubmit={handleSearch}
        className="mb-8 rounded-lg border border-border/70 bg-card p-5 shadow-[0_1px_2px_-1px_hsl(var(--primary)/0.10),0_4px_16px_-10px_hsl(var(--primary)/0.10)] sm:p-6"
      >
        <label htmlFor="topic" className="mb-2 block text-sm font-semibold">
          주제 키워드
        </label>
        <input
          id="topic"
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="예: 압력용기, 안전거리, 환기, 연료전지"
          className="mb-5 h-12 w-full rounded-md border-2 border-input bg-background px-4 text-base outline-none transition-colors focus:border-[hsl(var(--brass)/0.6)] focus:ring-2 focus:ring-[hsl(var(--ring)/0.3)]"
        />

        <div className="mb-2 block text-sm font-semibold">관점</div>
        <div className="mb-5 inline-flex rounded-md border border-border bg-muted/40 p-1">
          {(['design', 'production'] as Lens[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLens(l)}
              className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
                lens === l
                  ? 'bg-[hsl(var(--brass))] text-[hsl(var(--brass-foreground))]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {LENS_LABEL[l]}
            </button>
          ))}
        </div>

        <div>
          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '검색 중…' : '교차참조 검색'}
          </button>
        </div>
      </form>

      {/* 에러 */}
      {error && (
        <div className="mb-8 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* 결과 */}
      {result && !error && (
        <>
          <div className="mb-6 flex items-center gap-2 text-sm">
            <span className="h-px w-5 bg-[hsl(var(--brass)/0.7)]" aria-hidden="true" />
            <span className="font-medium">
              이 주제에 걸리는 분야 <strong className="text-[hsl(var(--brass))]">{groupCount}</strong>개 ·
              조문 <strong className="text-[hsl(var(--brass))]">{articleCount}</strong>건
              <span className="ml-2 text-muted-foreground">
                (주제: {result.topic} · 관점: {LENS_LABEL[result.lens]})
              </span>
            </span>
          </div>

          {groupCount === 0 ? (
            <div className="rounded-lg border border-border/70 bg-muted/20 p-8 text-center text-muted-foreground">
              이 주제로 걸리는 조문이 없습니다. 다른 키워드로 다시 시도해보세요.
            </div>
          ) : (
            result.groups.map((group) => (
              <section
                key={group.category}
                className="mb-8 rounded-lg border border-border/70 bg-card p-5 shadow-[0_1px_2px_-1px_hsl(var(--primary)/0.10),0_4px_16px_-10px_hsl(var(--primary)/0.10)] sm:p-6"
              >
                <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-border/60 pb-3">
                  <h2 className="font-display text-xl font-bold tracking-tight">
                    {group.category}
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {group.count}건
                    {group.shown < group.count && ` 중 ${group.shown}건 표시`}
                  </span>
                </div>

                <ul className="space-y-4">
                  {group.items.map((item, idx) => (
                    <li
                      key={`${item.law_name}-${item.article_no}-${idx}`}
                      className="border-l-2 border-[hsl(var(--brass)/0.4)] pl-4"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-foreground">
                          {item.law_name}
                          {item.article_no ? ` ${item.article_no}` : ''}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {item.law_type}
                        </span>
                        {item.title && (
                          <span className="text-sm text-muted-foreground">· {item.title}</span>
                        )}
                      </div>
                      {item.snippet && (
                        <p className="prose-legal text-sm text-muted-foreground">
                          {highlight(item.snippet, result.keywords)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}

      <p className="mt-10 text-center">
        <Link href="/" className="text-primary hover:underline">
          ← 검색으로 돌아가기
        </Link>
      </p>
    </main>
  );
}
