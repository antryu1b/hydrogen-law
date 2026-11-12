'use client';

import { useMemo, useState, useId } from 'react';
import type { FtoRecord } from '@/lib/intel';
import {
  COUNTRIES,
  PATENT_CATEGORY_LABEL,
  WATCH_SET_LABEL,
  rowCountry,
  type CheckKey,
  type CheckState,
  type WatchListRow,
} from '@/lib/patent-watch';
import {
  RIGHTS_STATUS_OPTIONS,
  buildDbRows,
  dbCompanyOptions,
  dbGroupOptions,
  filterPatentDb,
  resolveFtoCat,
  shouldShowDbEmptyNote,
  type PatentDbRow,
} from '@/lib/patent-db';
import { SectionHeading, EmptyNote } from './PatentWatchList';

// Widen to string-indexed so we can safely look up categories that are `string` at runtime.
const CATEGORY_LABEL: Record<string, string> = PATENT_CATEGORY_LABEL;

// ── Utilities ────────────────────────────────────────────────────────────────

function safeHref(url?: string | null): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

function kstDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

function AutoStatusNote({ status }: { status?: { registerStatus: string; checkedAt: string } }) {
  if (!status) return null;
  return (
    <p className="mt-1.5 inline-flex flex-wrap items-center gap-x-1.5 rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">현재 상태 {status.registerStatus}</span>
      <span>· 자동 수집 · KIPRIS · 반영일 {kstDate(status.checkedAt)}</span>
    </p>
  );
}

const CHECK_LABEL: Record<CheckKey, string> = {
  KR: '국내(KR) 검색',
  US: '미국(US) 검색',
  EP: '유럽(EP) 검색',
  status: 'KR 권리상태 갱신',
};

const OVERSEAS_KEYS: ReadonlySet<CheckKey> = new Set(['US', 'EP']);
const DOMESTIC_KEYS: ReadonlySet<CheckKey> = new Set(['KR', 'status']);

/** 「확인 실패」 entries: per country, the last run that had failed requests.
 *  - Overseas only (US/EP) → amber warning banner
 *  - Any domestic failure (KR/status) → red destructive banner
 */
function CheckFailures({ checks }: { checks: Partial<Record<CheckKey, CheckState>> | null }) {
  const failed = (Object.keys(CHECK_LABEL) as CheckKey[]).flatMap((k) => {
    const c = checks?.[k];
    return c && c.failures.length ? [[k, c] as const] : [];
  });
  if (failed.length === 0) return null;

  const hasDomesticFailure = failed.some(([k]) => DOMESTIC_KEYS.has(k));
  const overseasOnly = !hasDomesticFailure && failed.every(([k]) => OVERSEAS_KEYS.has(k));

  if (overseasOnly) {
    return (
      <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
        <p className="font-semibold text-amber-700 dark:text-amber-400">해외(US·EP) 수집 일부 실패 · 국내 수집은 정상입니다</p>
        <ul className="mt-1.5 space-y-1 text-muted-foreground">
          {failed.map(([k, c]) => (
            <li key={k} className="break-words">
              <span className="font-medium text-foreground">{CHECK_LABEL[k]}</span> · {c.at.slice(0, 10)} ·{' '}
              {c.failures.length}/{c.requests}건 실패 — {c.failures.join(' / ')}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div role="status" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
      <p className="font-semibold text-destructive">확인 실패 · 마지막 자동 수집에서 일부 요청이 실패했습니다</p>
      <ul className="mt-1.5 space-y-1 text-muted-foreground">
        {failed.map(([k, c]) => (
          <li key={k} className="break-words">
            <span className="font-medium text-foreground">{CHECK_LABEL[k]}</span> · {c.at.slice(0, 10)} ·{' '}
            {c.failures.length}/{c.requests}건 실패 — {c.failures.join(' / ')}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Row cards ────────────────────────────────────────────────────────────────

function FtoRowCard({
  record,
  autoStatus,
}: {
  record: FtoRecord;
  autoStatus?: { registerStatus: string; checkedAt: string };
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded bg-emerald-600/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          검토됨
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {CATEGORY_LABEL[resolveFtoCat(record.category)] ?? record.category ?? '-'}
        </span>
        {record.verdict && (
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
              record.verdict === '상세검토 필요'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {record.verdict}
          </span>
        )}
        <strong className="break-words font-semibold">{record.title ?? '-'}</strong>
      </div>
      <div className="mt-1.5 break-words text-xs text-muted-foreground">
        출원번호 {record.appNo ?? '-'} · 출원인{' '}
        {(record.applicant ?? '-').split('|').map((s) => s.trim()).join(' · ')} · 상태{' '}
        {record.status ?? '-'}
        {record.filedDate ? ` · 출원일 ${record.filedDate}` : ''}
      </div>
      <AutoStatusNote status={autoStatus} />
      {record.reason && (
        <p className="mt-1.5 break-words text-[13px] leading-relaxed text-muted-foreground">{record.reason}</p>
      )}
      {safeHref(record.link) && (
        <a
          href={safeHref(record.link)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-block text-xs text-[hsl(var(--brass))] hover:underline"
        >
          WIPS 원문 보기 →
        </a>
      )}
    </div>
  );
}

function WatchRowCard({ row }: { row: WatchListRow }) {
  return (
    <div className="rounded-lg border border-border/80 bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
          <span className="sr-only">출원국 </span>
          {rowCountry(row.country)}
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {CATEGORY_LABEL[row.category] ?? row.category} · 자동분류(추정)
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          신규(미검토)
        </span>
        <strong className="break-words font-semibold">{row.title}</strong>
      </div>
      <div className="mt-1.5 break-words text-xs text-muted-foreground">
        출원번호 {row.appNo} · 출원인 {row.applicant || '-'} · 상태 {row.status || '-'}
        {row.filedDate ? ` · 출원일 ${row.filedDate}` : ''} · 감시 세트 {row.matchedSet}{' '}
        {WATCH_SET_LABEL[row.matchedSet] ?? ''}
      </div>
      {safeHref(row.link) && (
        <a
          href={safeHref(row.link)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-block text-xs text-[hsl(var(--brass))] hover:underline"
        >
          KIPRIS 원문 보기 →
        </a>
      )}
    </div>
  );
}

function DbRowCard({ row }: { row: PatentDbRow }) {
  if (row.source === 'fto') return <FtoRowCard record={row.record} autoStatus={row.autoStatus} />;
  return <WatchRowCard row={row.row} />;
}

// ── Main component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

/**
 * Unified patent DB view combining FTO 검토 DB and KIPRIS 신규(미검토) filings.
 *
 * A single merged list with a shared filter bar.
 * - 구분 filter: 전체 / 검토됨 (FTO) / 신규(미검토) (watch)
 * - 권리상태 filter: 등록 / 공개·심사중 / 거절·취하·소멸 / 상태없음
 * - Verdict filter applies to FTO records only; country filter to watch rows only.
 * - Default sort: newest filing date first, unknown dates last.
 * - Render cap: PAGE_SIZE rows with 「더 보기」 button.
 */
export function PatentDbList({
  ftoRecords,
  autoStatus,
  watchRows,
  checks,
  max,
  loadError = null,
  statusWarning = null,
  initialGroup = '',
  initialCompany = '',
  initialQ = '',
  initialCat = '',
  initialVerdict = '',
  initialCountry = '',
  initialRights = '',
}: {
  ftoRecords: FtoRecord[];
  autoStatus: Record<string, { registerStatus: string; checkedAt: string }>;
  watchRows: WatchListRow[];
  checks: Partial<Record<CheckKey, CheckState>> | null;
  max: number;
  /** Hard failure: FTO or watch rows unavailable. Hides counts and suppresses the empty-state note. */
  loadError?: string | null;
  /** Soft failure: ancillary data (auto-status, check timestamps) unavailable; list still works. */
  statusWarning?: string | null;
  initialGroup?: string;
  initialCompany?: string;
  initialQ?: string;
  initialCat?: string;
  initialVerdict?: string;
  initialCountry?: string;
  initialRights?: string;
}) {
  const id = useId();
  const [q, setQ] = useState(initialQ);
  const [group, setGroup] = useState(initialGroup);
  const [company, setCompany] = useState(initialCompany);
  const [cat, setCat] = useState(initialCat);
  const [verdict, setVerdict] = useState(initialVerdict);
  const [country, setCountry] = useState(initialCountry);
  const [rights, setRights] = useState(initialRights);
  const [source, setSource] = useState('');
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);

  // Build combined sorted list once; re-build only when source data changes.
  const allRows = useMemo(
    () => buildDbRows(ftoRecords, autoStatus, watchRows),
    [ftoRecords, autoStatus, watchRows],
  );

  // Group options always cover all COMPETITOR_GROUPS + other (from BOTH sources).
  const groupOptions = useMemo(() => dbGroupOptions(ftoRecords, watchRows), [ftoRecords, watchRows]);
  // Company options follow the selected group.
  const companyOptions = useMemo(() => dbCompanyOptions(group), [group]);

  // Filter combined list.
  const filtered = useMemo(
    () => filterPatentDb(allRows, { source, group, company, cat, verdict, country, rights, q }),
    [allRows, source, group, company, cat, verdict, country, rights, q],
  );

  const shown = filtered.slice(0, pageLimit);
  const hasMore = filtered.length > pageLimit;

  const control =
    'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="space-y-4">
      {/* Hard failure: FTO or watch rows unavailable */}
      {loadError && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <p className="font-semibold text-destructive">데이터 로드 실패</p>
          <p className="mt-1 text-muted-foreground">{loadError}</p>
        </div>
      )}
      {/* Soft failure: ancillary data degraded; list still works */}
      {statusWarning && (
        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          {statusWarning}
        </div>
      )}
      <CheckFailures checks={checks} />

      {/* Shared filter bar — grid-cols-2 at 375 px so controls don't overflow */}
      <div className="grid grid-cols-2 gap-2">
        {/* Search full-width first row */}
        <label htmlFor={`${id}-q`} className="sr-only">검색</label>
        <input
          id={`${id}-q`}
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPageLimit(PAGE_SIZE); }}
          placeholder="명칭·출원번호·출원인 검색"
          className={`${control} col-span-2`}
        />

        {/* Row 2: group | company */}
        <label htmlFor={`${id}-group`} className="sr-only">그룹</label>
        <select
          id={`${id}-group`}
          value={group}
          onChange={(e) => { setGroup(e.target.value); setCompany(''); setPageLimit(PAGE_SIZE); }}
          className={control}
        >
          <option value="">전체 그룹</option>
          {groupOptions.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>

        <label htmlFor={`${id}-company`} className="sr-only">기업</label>
        <select
          id={`${id}-company`}
          value={company}
          onChange={(e) => { setCompany(e.target.value); setPageLimit(PAGE_SIZE); }}
          disabled={companyOptions.length === 0}
          className={`${control} disabled:opacity-50`}
        >
          <option value="">전체 기업</option>
          {companyOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Row 3: 구분 | 권리상태 */}
        <label htmlFor={`${id}-source`} className="sr-only">구분</label>
        <select
          id={`${id}-source`}
          value={source}
          onChange={(e) => { setSource(e.target.value); setPageLimit(PAGE_SIZE); }}
          className={control}
        >
          <option value="">전체 구분</option>
          <option value="fto">검토됨</option>
          <option value="watch">신규(미검토)</option>
        </select>

        <label htmlFor={`${id}-rights`} className="sr-only">권리상태</label>
        <select
          id={`${id}-rights`}
          value={rights}
          onChange={(e) => { setRights(e.target.value); setPageLimit(PAGE_SIZE); }}
          className={control}
        >
          <option value="">전체 권리상태</option>
          {RIGHTS_STATUS_OPTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {/* Row 4: 분류 | 판정 */}
        <label htmlFor={`${id}-cat`} className="sr-only">분류</label>
        <select
          id={`${id}-cat`}
          value={cat}
          onChange={(e) => { setCat(e.target.value); setPageLimit(PAGE_SIZE); }}
          className={control}
        >
          <option value="">전체 분류</option>
          {Object.entries(PATENT_CATEGORY_LABEL)
            .filter(([k]) => k !== 'transfer') // 이관 is folded into 시스템 at render level
            .map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
        </select>

        <label htmlFor={`${id}-verdict`} className="sr-only">판정 (FTO 검토 항목, 선택 시 미검토 행 숨김)</label>
        <select
          id={`${id}-verdict`}
          value={verdict}
          onChange={(e) => { setVerdict(e.target.value); setPageLimit(PAGE_SIZE); }}
          className={control}
        >
          <option value="">전체 판정</option>
          <option value="need">상세검토 필요</option>
          <option value="noneed">상세검토 불필요</option>
        </select>

        {/* Row 5: 국가 (watch only) — FTO rows hidden when country selected */}
        <label htmlFor={`${id}-country`} className="sr-only">출원국 (선택 시 FTO 검토 행 숨김)</label>
        <select
          id={`${id}-country`}
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPageLimit(PAGE_SIZE); }}
          className={control}
        >
          <option value="">전체 국가</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Count line + list */}
      <div>
        <SectionHeading
          title="특허 종합 DB"
          desc={
            loadError
              ? '데이터 미상 · 로드 실패로 건수 표시 불가'
              : `FTO 검토 ${ftoRecords.length}건 + KIPRIS 신규 ${watchRows.length}건 · 출원일 최신순${watchRows.length >= max ? ` · 신규는 최신 ${max}건까지만 불러옴` : ''}`
          }
        />

        {shouldShowDbEmptyNote(loadError, filtered.length) ? (
          <EmptyNote>검색 결과가 없습니다.</EmptyNote>
        ) : (
          <>
            {/* Count line hidden when loadError is set — partial rows may still appear below */}
            {!loadError && (
              <p
                role="status"
                aria-live="polite"
                className="text-xs text-muted-foreground"
              >
                {filtered.length}건 중 {shown.length}건 표시
              </p>
            )}
            <div className="mt-2 space-y-2">
              {shown.map((row, i) => {
                // FTO: srcIdx is the position in the original ftoRecords input — unique even
                // when two records share the same no+appNo.
                // Watch: id is the Supabase row PK, stable and unique across countries.
                const key =
                  row.source === 'fto'
                    ? `fto-${row.srcIdx}`
                    : `watch-${row.row.id || `idx-${i}`}`;
                return <DbRowCard key={key} row={row} />;
              })}
            </div>
            {hasMore && (
              <button
                type="button"
                onClick={() => setPageLimit((prev) => prev + PAGE_SIZE)}
                className="mt-3 w-full rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent"
              >
                더 보기 ({filtered.length - pageLimit}건 남음)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
