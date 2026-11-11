'use client';

import { useMemo, useState, useId } from 'react';
import type { FtoRecord } from '@/lib/intel';
import {
  COMPETITOR_GROUPS,
  COUNTRIES,
  PATENT_CATEGORY_LABEL,
  WATCH_SET_LABEL,
  competitorGroupFor,
  filterWatchRows,
  rowCountry,
  watchFacets,
  normalizeAppNo,
  type CheckKey,
  type CheckState,
  type WatchListRow,
} from '@/lib/patent-watch';

// Widen to string-indexed so we can safely look up categories that are `string` at runtime.
const CATEGORY_LABEL: Record<string, string> = PATENT_CATEGORY_LABEL;
import { SectionHeading, EmptyNote } from './PatentWatchList';

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

function CheckFailures({ checks }: { checks: Partial<Record<CheckKey, CheckState>> | null }) {
  const failed = (Object.keys(CHECK_LABEL) as CheckKey[]).flatMap((k) => {
    const c = checks?.[k];
    return c && c.failures.length ? [[k, c] as const] : [];
  });
  if (failed.length === 0) return null;
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

// ── FTO row ──────────────────────────────────────────────────────────────────

function FtoRow({
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
          {CATEGORY_LABEL[record.category ?? ''] ?? record.category ?? '-'}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
            record.verdict === '상세검토 필요'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {record.verdict ?? '-'}
        </span>
        <strong className="font-semibold">{record.title}</strong>
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">
        출원번호 {record.appNo ?? '-'} · 출원인 {(record.applicant ?? '-').split('|')[0].trim()} · 상태 {record.status ?? '-'}
        {record.filedDate ? ` · 출원일 ${record.filedDate}` : ''}
      </div>
      <AutoStatusNote status={autoStatus} />
      {record.reason && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{record.reason}</p>}
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

// ── Watch row ────────────────────────────────────────────────────────────────

function WatchRow({ row }: { row: WatchListRow }) {
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
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">신규(미검토)</span>
        <strong className="break-words font-semibold">{row.title}</strong>
      </div>
      <div className="mt-1.5 break-words text-xs text-muted-foreground">
        출원번호 {row.appNo} · 출원인 {row.applicant || '-'} · 상태 {row.status || '-'}
        {row.filedDate ? ` · 출원일 ${row.filedDate}` : ''} · 감시 세트 {row.matchedSet} {WATCH_SET_LABEL[row.matchedSet] ?? ''}
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

// ── Main component ───────────────────────────────────────────────────────────

const MAX_RENDER = 300;

/**
 * Unified patent DB view combining FTO 1차 검토 DB and KIPRIS 신규(미검토) filings.
 *
 * A single shared filter bar (group, company, category, verdict) filters both sections.
 * Additionally: verdict filter applies to FTO records only; country filter to watch rows only.
 * Initial filter values are read from URL query params (passed as props from the server page).
 */
export function PatentDbList({
  ftoRecords,
  autoStatus,
  watchRows,
  checks,
  max,
  initialGroup = '',
  initialCompany = '',
  initialQ = '',
  initialCat = '',
  initialVerdict = '',
  initialCountry = '',
}: {
  ftoRecords: FtoRecord[];
  autoStatus: Record<string, { registerStatus: string; checkedAt: string }>;
  watchRows: WatchListRow[];
  checks: Partial<Record<CheckKey, CheckState>> | null;
  max: number;
  initialGroup?: string;
  initialCompany?: string;
  initialQ?: string;
  initialCat?: string;
  initialVerdict?: string;
  initialCountry?: string;
}) {
  const id = useId();
  const [q, setQ] = useState(initialQ);
  const [group, setGroup] = useState(initialGroup);
  const [company, setCompany] = useState(initialCompany);
  const [cat, setCat] = useState(initialCat);
  const [verdict, setVerdict] = useState(initialVerdict);
  const [country, setCountry] = useState(initialCountry);

  // Company options follow the selected group
  const watchFacetsData = useMemo(() => watchFacets(watchRows), [watchRows]);
  const companyOptions = useMemo(() => {
    if (!group) return watchFacetsData.companies;
    const g = COMPETITOR_GROUPS.find((cg) => cg.group === group);
    return g ? watchFacetsData.companies.filter((c) => g.companies.includes(c)) : [];
  }, [group, watchFacetsData.companies]);

  // Filter FTO records
  const filteredFto = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ftoRecords.filter((r) => {
      if (cat && r.category !== cat) return false;
      if (verdict === 'need' && r.verdict !== '상세검토 필요') return false;
      if (verdict === 'noneed' && r.verdict !== '상세검토 불필요') return false;
      if (group || company) {
        const cg = competitorGroupFor(r.applicant);
        if (company && cg?.company !== company) return false;
        if (group && cg?.group !== group) return false;
      }
      if (!needle) return true;
      return [r.title, r.appNo, r.applicant, r.reason].some((v) => (v ?? '').toLowerCase().includes(needle));
    });
  }, [ftoRecords, q, cat, verdict, group, company]);

  // Filter watch rows (verdict filter excluded: watch rows are always unreviewed)
  const filteredWatch = useMemo(() => {
    // country filter applies to watch only
    const filtered = filterWatchRows(watchRows, { group, company, year: '', country, q });
    if (!cat) return filtered;
    return filtered.filter((r) => r.category === cat);
  }, [watchRows, group, company, country, q, cat]);

  const control =
    'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="space-y-4">
      {/* Shared filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-q`} className="sr-only">검색</label>
        <input
          id={`${id}-q`}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="명칭·출원번호·출원인 검색"
          className={`${control} w-full sm:min-w-[14rem] sm:flex-1`}
        />
        <label htmlFor={`${id}-group`} className="sr-only">그룹</label>
        <select
          id={`${id}-group`}
          value={group}
          onChange={(e) => { setGroup(e.target.value); setCompany(''); }}
          className={`${control} min-w-0 flex-1 sm:flex-none`}
        >
          <option value="">전체 그룹</option>
          {watchFacetsData.groups.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <label htmlFor={`${id}-company`} className="sr-only">기업</label>
        <select
          id={`${id}-company`}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          disabled={companyOptions.length === 0}
          className={`${control} min-w-0 flex-1 disabled:opacity-50 sm:flex-none`}
        >
          <option value="">전체 기업</option>
          {companyOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label htmlFor={`${id}-cat`} className="sr-only">분류</label>
        <select
          id={`${id}-cat`}
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className={`${control} min-w-0 flex-1 sm:flex-none`}
        >
          <option value="">전체 분류</option>
          {Object.entries(PATENT_CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label htmlFor={`${id}-verdict`} className="sr-only">판정 (FTO)</label>
        <select
          id={`${id}-verdict`}
          value={verdict}
          onChange={(e) => setVerdict(e.target.value)}
          className={`${control} min-w-0 flex-1 sm:flex-none`}
          aria-label="판정 (FTO 검토 항목)"
        >
          <option value="">전체 판정</option>
          <option value="need">상세검토 필요</option>
          <option value="noneed">상세검토 불필요</option>
        </select>
        <label htmlFor={`${id}-country`} className="sr-only">국가 (신규 출원)</label>
        <select
          id={`${id}-country`}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className={`${control} min-w-0 flex-1 sm:flex-none`}
          aria-label="출원국 (신규(미검토) 항목)"
        >
          <option value="">전체 국가</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* FTO 1차 검토 DB section */}
      <div>
        <SectionHeading
          title="FTO 검토 DB"
          desc={`FTO 검토 ${ftoRecords.length}건 기준 · 판정·분류·그룹 필터 · 권리상태 자동갱신(KIPRIS)`}
        />
        {filteredFto.length === 0 ? (
          <EmptyNote>검색 결과가 없습니다.</EmptyNote>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {filteredFto.length}건 표시 중 (전체 {ftoRecords.length}건
              {filteredFto.length > MAX_RENDER ? ` · 상위 ${MAX_RENDER}건만 표시` : ''})
            </p>
            <div className="mt-2 space-y-2">
              {filteredFto.slice(0, MAX_RENDER).map((r) => (
                <FtoRow
                  key={r.no}
                  record={r}
                  autoStatus={autoStatus[normalizeAppNo(r.appNo)]}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* KIPRIS 신규(미검토) section */}
      <div>
        <CheckFailures checks={checks} />
        <SectionHeading
          title="KIPRIS 신규 특허(미검토)"
          desc={`KIPRIS 감시 검색으로 새로 발견된 출원 · 출원일 최신순 · 판정 전 (불러온 ${watchRows.length}건${watchRows.length >= max ? ` · 최신 ${max}건까지만 불러옴` : ''})`}
        />
        {filteredWatch.length === 0 ? (
          <EmptyNote>검색 결과가 없습니다.</EmptyNote>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {filteredWatch.length}건 표시 중 (전체 {watchRows.length}건)
            </p>
            <div className="mt-2 space-y-2">
              {filteredWatch.map((r) => (
                <WatchRow key={r.id} row={r} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
