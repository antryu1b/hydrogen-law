import { EmptyNote, SectionHeading } from '@/components/intel/PatentWatchList';
import { PATENT_CATEGORY_LABEL, type CompetitorStats, type PatentCategory, type StatBucket } from '@/lib/patent-watch';

// KIPRIS competitor filing trends on the 특허 분석 tab (the unreviewed watch list lives in
// PatentWatchList.tsx). Server-rendered; bars are plain CSS with text alternatives.

const CATEGORY_ORDER: PatentCategory[] = ['system', 'gas-liquid', 'stack', 'control', 'transfer'];
const CATEGORY_COLOR: Record<PatentCategory, string> = {
  system: 'bg-muted-foreground/45',
  'gas-liquid': 'bg-[hsl(var(--brass)/0.85)]',
  stack: 'bg-primary/60',
  control: 'bg-primary',
  transfer: 'bg-muted-foreground/20',
};

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
      <SectionHeading title="KIPRIS 경쟁사 출원 동향" desc="그룹 비교 → 그룹 내 업체별 · 구분별 건수와 출원연도별 건수" />
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
