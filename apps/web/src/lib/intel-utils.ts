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
export type PatentSec = 'competitor' | 'hmg' | 'proposals' | 'db';

/** DB `section` values shown in each patent sub-view. */
export const PATENT_SEC_SECTIONS: Record<PatentSec, string[]> = {
  competitor: ['fto-review', 'competitor'],
  hmg: ['own'],
  proposals: ['triz'],
  /** 특허 종합 DB uses its own data sources (FTO + watch); intel_patents filtering unused. */
  db: [],
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

// ── 1차/2차 review-stage cleanup ─────────────────────────────────────────────

/**
 * Row ids in intel_patents whose purpose is describing the 1차/2차 FTO review-stage
 * split (not the patent content itself). Hidden at render time — Supabase rows are
 * never deleted or modified.
 *
 * fto-review:001 — text block: "… 총 400건 1차 검토 완료." (stage process description)
 */
export const FTO_STAGE_HIDE_IDS: ReadonlySet<string> = new Set(['fto-review:001']);

/**
 * Render-level cleanup for 1차/2차 FTO review-stage wording.
 * - Removes rows whose id is in FTO_STAGE_HIDE_IDS.
 * - Strips the "1차 검토 결과" clause from fto-review:000's heading desc.
 *
 * Uses a narrow generic so this stays importable without pulling in Supabase types.
 */
export function applyFtoStageCleanup<T extends { id: string; payload: { type: string } }>(rows: T[]): T[] {
  return rows
    .filter((r) => !FTO_STAGE_HIDE_IDS.has(r.id))
    .map((r): T => {
      if (
        r.id === 'fto-review:000' &&
        r.payload.type === 'heading' &&
        typeof (r.payload as Record<string, unknown>)['desc'] === 'string'
      ) {
        const desc = ((r.payload as Record<string, unknown>)['desc'] as string)
          .replace(/\s+1차 검토 결과/g, '')
          .trim();
        return { ...r, payload: { ...r.payload, desc } } as T;
      }
      return r;
    });
}

/** Only render http(s) links — guards against javascript: URLs in uploaded JSON. */
export function safeHref(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : undefined;
}
