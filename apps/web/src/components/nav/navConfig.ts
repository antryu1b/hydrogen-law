/**
 * Sidebar navigation configuration.
 * Pure data + pure helper functions — no React, fully testable.
 */

export interface NavSection {
  label: string;
  /** Full href including query string for intel tab links */
  href: string;
  /** Intel tab key when this section maps to /intel?tab=<key> */
  tab?: string;
  subItems?: SubNavItem[];
}

export interface SubNavItem {
  label: string;
  href: string;
}

export const NAV_MAIN: NavSection[] = [
  { label: '수전해 동향', href: '/intel?tab=news', tab: 'news' },
  { label: '경쟁사 비교', href: '/intel?tab=competitors', tab: 'competitors' },
  {
    label: '법령 검색',
    href: '/',
    subItems: [
      { label: '검색', href: '/' },
      { label: '본문 비교', href: '/kgs-compare' },
      { label: '통합 요건', href: '/integrate' },
      { label: '기술기준 분류', href: '/kgs-family' },
      { label: '별표·서식', href: '/forms/industrial-convergence' },
      { label: '컴플라이언스 체크', href: '/compliance-check' },
    ],
  },
  { label: '특허 분석', href: '/intel?tab=patents', tab: 'patents' },
];

export const NAV_ADMIN: SubNavItem[] = [
  { label: '법령 업로드', href: '/upload' },
  { label: '인텔 업로드', href: '/intel/admin' },
];

/** True when a sub-item matches the current pathname. */
export function isSubItemActive(item: SubNavItem, pathname: string): boolean {
  if (item.href === '/') return pathname === '/';
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

/**
 * True when a nav section is the active section.
 * - For intel tab sections: requires pathname === '/intel' AND tab matches.
 * - For sections with subItems: active when any sub-item is active.
 * - For plain href sections: pathname equality.
 */
export function isSectionActive(
  section: NavSection,
  pathname: string,
  tab: string | null,
): boolean {
  if (section.tab !== undefined) {
    return pathname === '/intel' && tab === section.tab;
  }
  if (section.subItems) {
    return section.subItems.some((sub) => isSubItemActive(sub, pathname));
  }
  return pathname === section.href;
}
