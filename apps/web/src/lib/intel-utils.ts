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
