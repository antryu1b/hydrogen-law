'use client';

import { useId, useMemo, useState } from 'react';
import {
  COMPETITOR_GROUPS,
  OTHER_APPLICANT_GROUP,
  PATENT_CATEGORY_LABEL,
  WATCH_SET_LABEL,
  filterWatchRows,
  watchFacets,
  type WatchListRow,
} from '@/lib/patent-watch';

// Unreviewed KIPRIS watch hits. Shows the newest DEFAULT_VISIBLE rows until 「전체 보기」.
const DEFAULT_VISIBLE = 50;

function safeHref(url?: string | null) {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

export function SectionHeading({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mt-8 border-b border-border/70 pb-2">
      <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>
  );
}

export function PatentWatchList({
  rows,
  error,
  max,
}: {
  rows: WatchListRow[];
  error: string | null;
  /** Loader cap; when reached, older filings were not loaded. */
  max: number;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [company, setCompany] = useState('');
  const [year, setYear] = useState('');
  const [showAll, setShowAll] = useState(false);

  const facets = useMemo(() => watchFacets(rows), [rows]);
  // Company options follow the selected group; none for the 「그 외 출원인」 bucket.
  const companyOptions =
    group === OTHER_APPLICANT_GROUP
      ? []
      : group
        ? facets.companies.filter((c) => COMPETITOR_GROUPS.find((g) => g.group === group)?.companies.includes(c))
        : facets.companies;
  const filtered = useMemo(() => filterWatchRows(rows, { group, company, year, q }), [rows, group, company, year, q]);
  const visible = showAll ? filtered : filtered.slice(0, DEFAULT_VISIBLE);

  const control =
    'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="space-y-3">
      <SectionHeading
        title="KIPRIS 신규 특허(미검토)"
        desc="KIPRIS 감시 검색으로 새로 발견된 국내 출원 · 출원일 최신순 · 판정 전"
      />
      {rows.length === 0 ? (
        <EmptyNote>{error ?? '아직 수집된 신규 특허가 없습니다. 매일 KIPRIS 자동 수집이 돌면 채워집니다.'}</EmptyNote>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${id}-q`} className="sr-only">
              검색
            </label>
            <input
              id={`${id}-q`}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="명칭·출원인·출원번호 검색"
              className={`${control} w-full sm:w-auto sm:min-w-[14rem] sm:flex-1`}
            />
            <label htmlFor={`${id}-group`} className="sr-only">
              그룹
            </label>
            <select
              id={`${id}-group`}
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setCompany('');
              }}
              className={`${control} min-w-0 flex-1 sm:flex-none`}
            >
              <option value="">전체 그룹</option>
              {facets.groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <label htmlFor={`${id}-company`} className="sr-only">
              기업
            </label>
            <select
              id={`${id}-company`}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              disabled={companyOptions.length === 0}
              className={`${control} min-w-0 flex-1 disabled:opacity-50 sm:flex-none`}
            >
              <option value="">전체 기업</option>
              {companyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <label htmlFor={`${id}-year`} className="sr-only">
              출원연도
            </label>
            <select
              id={`${id}-year`}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className={`${control} min-w-0 flex-1 sm:flex-none`}
            >
              <option value="">전체 연도</option>
              {facets.years.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {filtered.length}건 중 {visible.length}건 표시 (불러온 {rows.length}건
              {rows.length >= max ? ` · 최신 ${max}건까지만 불러옴` : ''})
            </p>
            {filtered.length > DEFAULT_VISIBLE && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-pressed={showAll}
                className="h-8 rounded-md border border-input px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showAll ? `최신 ${DEFAULT_VISIBLE}건만 보기` : '전체 보기'}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {visible.map((p) => (
              <div key={p.appNo} className="rounded-lg border border-border/80 bg-card p-3.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {PATENT_CATEGORY_LABEL[p.category] ?? p.category} · 자동분류(추정)
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">미검토</span>
                  <strong className="break-words font-semibold">{p.title}</strong>
                </div>
                <div className="mt-1.5 break-words text-xs text-muted-foreground">
                  출원번호 {p.appNo} · 출원인 {p.applicant || '-'} · 상태 {p.status || '-'}
                  {p.filedDate ? ` · 출원일 ${p.filedDate}` : ''} · 감시 세트 {p.matchedSet} {WATCH_SET_LABEL[p.matchedSet] ?? ''}
                </div>
                {safeHref(p.link) && (
                  <a
                    href={safeHref(p.link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-block text-xs text-[hsl(var(--brass))] hover:underline"
                  >
                    KIPRIS 원문 보기 →
                  </a>
                )}
              </div>
            ))}
            {filtered.length === 0 && <EmptyNote>검색 결과가 없습니다.</EmptyNote>}
          </div>
        </>
      )}
    </div>
  );
}
