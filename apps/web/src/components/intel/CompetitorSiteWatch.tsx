import { CHANGE_BADGE_DAYS, isRecentChange, type SiteSnapshot } from '@/lib/competitor-watch';
import { formatKst, safeHref } from '@/lib/intel';
import { EmptyNote, SectionHeading } from '@/components/intel/PatentWatchList';

// 「공식 홈페이지 모니터링」 on the 경쟁사 비교 tab — rows from /api/cron/competitor-sites.
// Shown next to (never merged into) the seeded report blocks.
export function CompetitorSiteWatch({
  rows,
  error,
  nowMs,
}: {
  rows: SiteSnapshot[];
  error: string | null;
  /** Render time, for the 「변경 감지」 window. */
  nowMs: number;
}) {
  return (
    <section className="space-y-3" aria-labelledby="competitor-site-watch">
      <div id="competitor-site-watch">
        <SectionHeading
          title="공식 홈페이지 모니터링"
          desc={`각사 공식 홈페이지를 매일 1회 자동 확인 · 페이지가 바뀌면 ${CHANGE_BADGE_DAYS}일간 「변경 감지」 표시 · 수치는 해당 페이지에서 자동 추출한 원문 값`}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyNote>{error ?? '아직 자동 수집 결과가 없습니다. 첫 수집은 다음 정기 실행 때 반영됩니다.'}</EmptyNote>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const href = safeHref(r.url);
            const changed = isRecentChange(r.changedAt, nowMs);
            return (
              <li key={r.key} className="min-w-0 rounded-lg border border-border/80 bg-card p-3.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <strong className="break-words font-semibold">{r.company}</strong>
                  <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    자동 수집
                  </span>
                  {changed && (
                    <span className="rounded bg-[hsl(var(--brass))]/15 px-1.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--brass))]">
                      변경 감지 · {formatKst(r.changedAt)}
                    </span>
                  )}
                  {r.status === 'fail' && (
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">
                      확인 실패
                    </span>
                  )}
                </div>
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-block max-w-full break-all text-xs text-[hsl(var(--brass))] hover:underline"
                  >
                    출처: {r.page} →
                  </a>
                )}
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  반영일 {formatKst(r.lastOkAt)} · 마지막 확인 {formatKst(r.checkedAt)}
                  {r.changedAt && !changed ? ` · 마지막 변경 ${formatKst(r.changedAt)}` : ''}
                  {r.status === 'fail' && r.error ? ` · 실패 사유: ${r.error}` : ''}
                </p>
                {r.figures.length > 0 && (
                  <dl className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {r.figures.map((f) => (
                      <div key={f.label} className="max-w-full rounded bg-muted px-2 py-1">
                        <dt className="inline text-muted-foreground">{f.label} </dt>
                        <dd className="inline break-words font-medium tabular-nums text-foreground">
                          {f.value}
                          {f.unit ? ` ${f.unit}` : ''}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
