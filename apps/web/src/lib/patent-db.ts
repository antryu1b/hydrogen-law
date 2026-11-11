/**
 * Pure helpers for the unified 특허 종합 DB view.
 * No React, no I/O — fully testable.
 */

import type { FtoRecord } from '@/lib/intel';
import {
  COMPETITOR_GROUPS,
  COUNTRIES,
  OTHER_APPLICANT_GROUP,
  PATENT_CATEGORY_LABEL,
  companiesForApplicant,
  groupOf,
  normalizeAppNo,
  rowCountry,
  type WatchListRow,
} from '@/lib/patent-watch';

// ── Rights status bucketing ──────────────────────────────────────────────────

export type RightsStatusBucket = '등록' | '공개·심사중' | '거절·취하·소멸' | '상태없음';

export const RIGHTS_STATUS_OPTIONS: RightsStatusBucket[] = [
  '등록',
  '공개·심사중',
  '거절·취하·소멸',
  '상태없음',
];

/**
 * Maps a raw KIPRIS registerStatus string (or recorded FTO status) to one of 4 display buckets.
 * - starts with '등록' (등록, 등록결정, …)  → '등록'
 * - 거절 / 취하 / 소멸 / 포기 / 무효        → '거절·취하·소멸'
 * - 공개 / 심사 / 출원                      → '공개·심사중'
 * - empty / null / '-' / unknown            → '상태없음'
 */
export function rightsStatusBucket(status: string | null | undefined): RightsStatusBucket {
  if (!status || status === '-') return '상태없음';
  if (/^등록/.test(status)) return '등록';
  if (/거절|취하|소멸|포기|무효/.test(status)) return '거절·취하·소멸';
  if (/공개|심사|출원/.test(status)) return '공개·심사중';
  return '상태없음';
}

// ── Combined row type ────────────────────────────────────────────────────────

export type PatentDbRow =
  | {
      source: 'fto';
      sortKey: string; // ISO date or '' for unknown — used for sort
      record: FtoRecord;
      autoStatus?: { registerStatus: string; checkedAt: string };
    }
  | {
      source: 'watch';
      sortKey: string;
      row: WatchListRow;
    };

/**
 * Builds the combined rows array sorted by filedDate descending; unknown dates last.
 * Pass an empty {} for autoStatus when only building for counting.
 */
export function buildDbRows(
  ftoRecords: FtoRecord[],
  autoStatus: Record<string, { registerStatus: string; checkedAt: string }>,
  watchRows: WatchListRow[],
): PatentDbRow[] {
  const ftoDbRows: PatentDbRow[] = ftoRecords.map((record) => ({
    source: 'fto' as const,
    sortKey: record.filedDate ?? '',
    record,
    autoStatus: autoStatus[normalizeAppNo(record.appNo)],
  }));

  const watchDbRows: PatentDbRow[] = watchRows.map((row) => ({
    source: 'watch' as const,
    sortKey: row.filedDate ?? '',
    row,
  }));

  return [...ftoDbRows, ...watchDbRows].sort((a, b) => {
    if (!a.sortKey && !b.sortKey) return 0;
    if (!a.sortKey) return 1; // unknown dates last
    if (!b.sortKey) return -1;
    return b.sortKey.localeCompare(a.sortKey); // newest first
  });
}

// ── Filter ───────────────────────────────────────────────────────────────────

export interface PatentDbFilter {
  /** 'fto' | 'watch' | '' for all */
  source: string;
  group: string;
  company: string;
  cat: string;
  /** 'need' | 'noneed' | '' — when set, watch (unreviewed) rows are hidden */
  verdict: string;
  /**
   * Country filter. When set:
   * - FTO rows are hidden (they have no country dimension)
   * - watch rows are filtered by rowCountry(row.country)
   */
  country: string;
  /** RightsStatusBucket value or '' for all */
  rights: string;
  q: string;
}

/** Returns the rights status string for a combined row (auto-collected preferred for FTO). */
function rowRightsStatus(row: PatentDbRow): string {
  if (row.source === 'fto') {
    return row.autoStatus?.registerStatus ?? row.record.status ?? '';
  }
  return row.row.status ?? '';
}

/**
 * Checks whether a row's applicant matches a group/company filter.
 *
 * Uses companiesForApplicant() so joint filings ("A | B") count under BOTH companies.
 * - company set: row passes if any matched company equals the filter value
 * - group set (not OTHER): row passes if any matched company belongs to that group
 * - OTHER_APPLICANT_GROUP: row passes if the applicant matches NO known company
 */
function rowMatchesGroupCompany(
  applicant: string | null | undefined,
  group: string,
  company: string,
): boolean {
  if (!group && !company) return true;
  const cs = companiesForApplicant(applicant);
  if (company) return cs.includes(company);
  if (group === OTHER_APPLICANT_GROUP) return cs.length === 0;
  return cs.some((c) => groupOf(c) === group);
}

/**
 * Filters the combined DB rows.
 *
 * Rules:
 * - source: exact match ('fto' or 'watch'), '' = all
 * - verdict filter set → watch rows (unreviewed) are hidden
 * - country filter set → FTO rows hidden; watch rows filtered by rowCountry
 * - rights filter: applies to both via rowRightsStatus
 * - group/company: joint-filing-aware (companiesForApplicant), same logic for both sources
 * - cat: matches category field on both
 * - q: text search over title, appNo, applicant
 */
export function filterPatentDb(rows: PatentDbRow[], f: PatentDbFilter): PatentDbRow[] {
  const needle = f.q.trim().toLowerCase();
  return rows.filter((row) => {
    // Source filter (구분)
    if (f.source && row.source !== f.source) return false;

    // Verdict filter — watch rows are always unreviewed so hide them when verdict is set
    if (f.verdict) {
      if (row.source === 'watch') return false;
      if (f.verdict === 'need' && row.record.verdict !== '상세검토 필요') return false;
      if (f.verdict === 'noneed' && row.record.verdict !== '상세검토 불필요') return false;
    }

    // Country filter — FTO rows hidden when country set; watch rows filtered by country
    if (f.country) {
      if (row.source === 'fto') return false;
      if (rowCountry(row.row.country) !== f.country) return false;
    }

    // Rights status filter
    if (f.rights) {
      if (rightsStatusBucket(rowRightsStatus(row)) !== f.rights) return false;
    }

    // Group / company filter — joint-filing-aware, same logic for both sources
    const applicant = row.source === 'fto' ? row.record.applicant : row.row.applicant;
    if (!rowMatchesGroupCompany(applicant, f.group, f.company)) return false;

    // Category filter
    const cat = row.source === 'fto' ? row.record.category : row.row.category;
    if (f.cat && cat !== f.cat) return false;

    // Text search
    if (needle) {
      const title = row.source === 'fto' ? row.record.title : row.row.title;
      const appNo = row.source === 'fto' ? row.record.appNo : row.row.appNo;
      const reason = row.source === 'fto' ? row.record.reason : undefined;
      if (![title, appNo, applicant, reason].some((v) => (v ?? '').toLowerCase().includes(needle))) {
        return false;
      }
    }

    return true;
  });
}

// ── Portfolio counts ─────────────────────────────────────────────────────────

export interface PortfolioGroupCount {
  label: string;
  total: number;
  companies: { label: string; total: number }[];
}

/** Zero-filter base used when counting across the full combined list. */
const COUNT_FILTER: Omit<PatentDbFilter, 'group' | 'company'> = {
  source: '', cat: '', verdict: '', country: '', rights: '', q: '',
};

/**
 * Computes per-group and per-company row counts using the same filterPatentDb path
 * as the DB list. Pass the same ftoRecords and watchRows the DB view receives.
 * autoStatus is not needed for counting (rights filter not applied).
 */
export function computePortfolioCounts(
  ftoRecords: FtoRecord[],
  watchRows: WatchListRow[],
): PortfolioGroupCount[] {
  const allRows = buildDbRows(ftoRecords, {}, watchRows);
  return COMPETITOR_GROUPS.map((g) => ({
    label: g.group,
    total: filterPatentDb(allRows, { ...COUNT_FILTER, group: g.group, company: '' }).length,
    companies: g.companies.map((c) => ({
      label: c,
      total: filterPatentDb(allRows, { ...COUNT_FILTER, group: '', company: c }).length,
    })),
  }));
}

// ── URL param parsing ────────────────────────────────────────────────────────

export interface PatentDbParams {
  group: string;
  company: string;
  q: string;
  cat: string;
  verdict: string;
  country: string;
  rights: string;
}

/** All valid group values (competitor groups + other). */
const VALID_GROUPS = new Set([...COMPETITOR_GROUPS.map((g) => g.group), OTHER_APPLICANT_GROUP]);
/** All valid category keys. */
const VALID_CATS = new Set(Object.keys(PATENT_CATEGORY_LABEL));
/** All valid verdict filter values. */
const VALID_VERDICTS = new Set(['need', 'noneed']);
/** All valid country values. */
const VALID_COUNTRIES = new Set(COUNTRIES as readonly string[]);
/** All valid rights status bucket values. */
const VALID_RIGHTS = new Set(RIGHTS_STATUS_OPTIONS as readonly string[]);

/** All companies indexed by their group for cross-validation. */
const COMPANY_TO_GROUP = new Map<string, string>(
  COMPETITOR_GROUPS.flatMap((g) => g.companies.map((c) => [c, g.group] as [string, string])),
);

/** Extracts the first string value from a potentially array-valued searchParam. */
function firstStr(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

/**
 * Parses raw Next.js searchParams (string | string[] | undefined per key) into validated
 * PatentDbParams. Unknown values fall back to ''; repeated params take the first value.
 *
 * Cross-validation: if both group and company are set and they don't match,
 * the group is dropped (keeping company) so the select is never blank while
 * a company filter is active.
 */
export function parseDbParams(
  raw: Record<string, string | string[] | undefined>,
): PatentDbParams {
  const rawGroup = firstStr(raw['group']);
  const rawCompany = firstStr(raw['company']);

  const group = VALID_GROUPS.has(rawGroup) ? rawGroup : '';
  // Any company in any COMPETITOR_GROUP is valid
  const companyValid = COMPANY_TO_GROUP.has(rawCompany);
  const company = companyValid ? rawCompany : '';

  // Cross-validate: drop group if company doesn't belong to it
  const companyGroup = company ? (COMPANY_TO_GROUP.get(company) ?? null) : null;
  const resolvedGroup =
    company && group && group !== OTHER_APPLICANT_GROUP && companyGroup !== group ? '' : group;

  const q = firstStr(raw['q']).trim();
  const cat = VALID_CATS.has(firstStr(raw['cat'])) ? firstStr(raw['cat']) : '';
  const verdict = VALID_VERDICTS.has(firstStr(raw['verdict'])) ? firstStr(raw['verdict']) : '';
  const country = VALID_COUNTRIES.has(firstStr(raw['country'])) ? firstStr(raw['country']) : '';
  const rights = VALID_RIGHTS.has(firstStr(raw['rights'])) ? firstStr(raw['rights']) : '';
  return { group: resolvedGroup, company, q, cat, verdict, country, rights };
}

// ── Select option helpers ────────────────────────────────────────────────────

/**
 * Builds the list of groups for the filter select.
 * Always includes all COMPETITOR_GROUPS; adds OTHER_APPLICANT_GROUP when any
 * FTO or watch row has an unmatched applicant.
 */
export function dbGroupOptions(ftoRecords: FtoRecord[], watchRows: WatchListRow[]): string[] {
  const hasOther =
    ftoRecords.some((r) => companiesForApplicant(r.applicant).length === 0) ||
    watchRows.some((r) => companiesForApplicant(r.applicant).length === 0);
  const groups = COMPETITOR_GROUPS.map((g) => g.group);
  return hasOther ? [...groups, OTHER_APPLICANT_GROUP] : groups;
}

/**
 * Builds the company options for a given group selection.
 * Returns all companies in that group (from COMPETITOR_GROUPS), or empty when
 * no group is selected or OTHER_APPLICANT_GROUP is selected.
 */
export function dbCompanyOptions(group: string): string[] {
  if (!group || group === OTHER_APPLICANT_GROUP) return [];
  const g = COMPETITOR_GROUPS.find((cg) => cg.group === group);
  return g ? g.companies : [];
}
