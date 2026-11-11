import { safeHref } from '@/lib/intel';
import {
  PATENT_CATEGORY_LABEL,
  WATCH_SET_LABEL,
  type CompetitorStats,
  type PatentCategory,
  type PatentWatchPayload,
  type StatBucket,
} from '@/lib/patent-watch';

// KIPRIS-derived views on the 특허 분석 tab: competitor filing trends and the
// unreviewed watch list. Server-rendered; bars are plain CSS with text alternatives.

const CATEGORY_ORDER: PatentCategory[] = ['system', 'gas-liquid', 'stack', 'control', 'transfer'];
const CATEGORY_COLOR: Record<PatentCategory, string> = {
  system: 'bg-muted-foreground/45',
  'gas-liquid': 'bg-[hsl(var(--brass)/0.85)]',
  stack: 'bg-primary/60',
  control: 'bg-primary',
  transfer: 'bg-muted-foreground/20',
};
const WATCH_MAX_RENDER = 100;

function SectionHeading({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mt-8 border-b border-border/70 pb-2">
      <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>
  );
}

function describe(b: StatBucket): string {
  const cats = CATEGORY_ORDER.filter((c) => b.byCategory[c]).map((c) => `${PATENT_CATEGORY_LABEL[c]} ${b.byCategory[c]}건`);
  return `${b.label} 총 ${b.total}건${cats.length ? `: ${cats.join(', ')}` : ''}`;
}

function CategoryBar({ bucket, max }: { bucket: StatBucket; max: number }) {
  const width = max ? (bucket.total / max) * 100 : 0;
  return (
    <div role="img" aria-label={describe(bucket)} className="h-3 w-full rounded-sm bg-muted/40">
      <div className="flex h-full overflow-hidden rounded-sm" style={{ width: `${width}%` }}>
        {CATEGORY_ORDER.filter((c) => bucket.byCategory[c]).map((c) => (
          <div
            key={c}
            className={CATEGORY_COLOR[c]}
            style={{ width: `${(bucket.byCategory[c] / bucket.total) * 100}%` }}
            title={`${PATENT_CATEGORY_LABEL[c]} ${bucket.byCategory[c]}건`}
          />
        ))}
      </div>
    </div>
  );
}

function YearBars({ bucket, years, max }: { bucket: StatBucket; years: string[]; max: number }) {
  const label = `${bucket.label} 출원연도별: ${years.map((y) => `${y}년 ${bucket.byYear[y] ?? 0}건`).join(', ')}`;
  return (
    <div role="img" aria-label={label} className="flex h-8 items-end gap-px">
      {years.map((y) => {
        const n = bucket.byYear[y] ?? 0;
        return (
          <div
            key={y}
            className="flex-1 rounded-t-[1px] bg-primary/70"
            style={{ height: n ? `${Math.max((n / max) * 100, 6)}%` : '1px', opacity: n ? 1 : 0.25 }}
            title={`${y}년 ${n}건`}
          />
        );
      })}
    </div>
  );
}

function StatRows({ buckets, years }: { buckets: StatBucket[]; years: string[] }) {
  const maxTotal = Math.max(0, ...buckets.map((b) => b.total));
  const maxYear = Math.max(0, ...buckets.flatMap((b) => Object.values(b.byYear)));
  return (
    <div className="space-y-3">
      {buckets.map((b) => (
        <div key={b.label} className="grid grid-cols-1 items-center gap-x-4 gap-y-1.5 sm:grid-cols-[9rem_1fr_minmax(8rem,14rem)]">
          <div className="text-sm">
            <span className="font-medium">{b.label}</span>{' '}
            <span className="tabular-nums text-muted-foreground">{b.total}건</span>
          </div>
          <CategoryBar bucket={b} max={maxTotal} />
          {years.length > 0 && <YearBars bucket={b} years={years} max={maxYear} />}
        </div>
      ))}
    </div>
  );
}

export function CompetitorPatentStats({ stats, error }: { stats: CompetitorStats; error: string | null }) {
  const years = stats.years;
  return (
    <div className="space-y-3">
      <SectionHeading title="경쟁사 특허 출원 동향" desc="그룹 비교 → 그룹 내 업체별 · 구분별 건수와 출원연도별 건수" />
      <p className="text-xs text-muted-foreground">
        KIPRIS 국내 출원 기준 · 구분은 키워드 자동분류(추정) · 출원 후 공개 전 건은 미포함
        {' · '}추정: Siemens Energy에 Siemens AG 분사 전 출원 포함
      </p>
      {stats.total === 0 ? (
        <EmptyNote>{error ?? '아직 수집된 경쟁사 출원이 없습니다. 매일 KIPRIS 자동 수집이 돌면 채워집니다.'}</EmptyNote>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {CATEGORY_ORDER.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${CATEGORY_COLOR[c]}`} aria-hidden />
                {PATENT_CATEGORY_LABEL[c]}
              </span>
            ))}
            {years.length > 0 && (
              <span className="tabular-nums">
                연도 막대 {years[0]}–{years[years.length - 1]}
              </span>
            )}
          </div>
          <div className="rounded-lg border border-border/80 bg-card p-4 sm:p-6">
            <h3 className="mb-3 text-sm font-semibold">그룹 비교</h3>
            <StatRows buckets={stats.groups} years={years} />
          </div>
          {stats.groups.map((g) => (
            <details key={g.label} className="rounded-lg border border-border/80 bg-card p-4 sm:p-6">
              <summary className="cursor-pointer text-sm font-semibold">
                {g.label} <span className="font-normal tabular-nums text-muted-foreground">· {g.total}건</span>
              </summary>
              <div className="mt-3">
                <StatRows buckets={g.companies} years={years} />
              </div>
            </details>
          ))}
        </>
      )}
    </div>
  );
}

export function PatentWatchList({ rows, error }: { rows: PatentWatchPayload[]; error: string | null }) {
  return (
    <div className="space-y-3">
      <SectionHeading title="신규 특허(미검토)" desc="KIPRIS 감시 검색으로 새로 발견된 국내 출원 · 출원일 최신순 · 판정 전" />
      {rows.length === 0 ? (
        <EmptyNote>{error ?? '아직 수집된 신규 특허가 없습니다. 매일 KIPRIS 자동 수집이 돌면 채워집니다.'}</EmptyNote>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {rows.length}건{rows.length > WATCH_MAX_RENDER ? ` · 최신 ${WATCH_MAX_RENDER}건만 표시` : ''}
          </p>
          <div className="space-y-2">
            {rows.slice(0, WATCH_MAX_RENDER).map((p) => (
              <div key={p.appNo} className="rounded-lg border border-border/80 bg-card p-3.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {PATENT_CATEGORY_LABEL[p.category] ?? p.category} · 자동분류(추정)
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">미검토</span>
                  <strong className="font-semibold">{p.title}</strong>
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
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
          </div>
        </>
      )}
    </div>
  );
}
