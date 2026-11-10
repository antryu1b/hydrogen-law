/**
 * Pure helpers for intel content rendering.
 * No React dependencies — fully testable.
 */

/**
 * Removes every occurrence of each word in `words` from `title`,
 * then collapses runs of whitespace and trims.
 *
 * Used to strip section-name repetition from intel headings and
 * sub-tab labels when the stored content already contains the
 * section label that the page h1 also shows.
 *
 * @example
 * stripSectionWords('경쟁사 상세 스펙 비교', ['경쟁사', '비교'])
 * // → '상세 스펙'
 *
 * stripSectionWords('PEM 경쟁사 비교', ['경쟁사', '비교'])
 * // → 'PEM'
 *
 * stripSectionWords('PEM vs ALK 기술 비교', ['경쟁사', '비교'])
 * // → 'PEM vs ALK 기술'
 */
export function stripSectionWords(title: string, words: string[]): string {
  let result = title;
  for (const word of words) {
    result = result.split(word).join('');
  }
  return result.replace(/\s+/g, ' ').trim();
}

/** Patent sub-views selected by the `sec` query param on /intel?tab=patents. */
export type PatentSec = 'competitor' | 'hmg' | 'proposals';

/** DB `section` values shown in each patent sub-view. */
export const PATENT_SEC_SECTIONS: Record<PatentSec, string[]> = {
  competitor: ['fto-review', 'competitor'],
  hmg: ['own'],
  proposals: ['triz'],
};

/** Returns the PatentSec for a raw query value, or null (= show everything) when missing/unknown. */
export function parsePatentSec(raw: string | null | undefined): PatentSec | null {
  return raw !== null && raw !== undefined && Object.hasOwn(PATENT_SEC_SECTIONS, raw)
    ? (raw as PatentSec)
    : null;
}

/** Keeps only rows belonging to the given sub-view; null returns all rows unchanged. */
export function filterPatentRows<T extends { section: string }>(rows: T[], sec: PatentSec | null): T[] {
  if (!sec) return rows;
  const allowed = PATENT_SEC_SECTIONS[sec];
  return rows.filter((r) => allowed.includes(r.section));
}
