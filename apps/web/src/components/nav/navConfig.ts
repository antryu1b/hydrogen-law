/**
 * Sidebar navigation configuration.
 * Pure data + pure helper functions — no React, fully testable.
 */

import { parsePatentSec } from '@/lib/intel-utils';

export interface NavSection {
  label: string;
  /** Full href including query string for intel tab links */
  href: string;
  /** Intel tab key when this section maps to /intel?tab=<key> */
  tab?: string;
  subItems?: SubNavItem[];
  /** Pages reachable from this section but not listed in the sidebar */
  relatedPaths?: string[];
}

export interface SubNavItem {
  label: string;
  href: string;
  /** Patent sub-view key when this item maps to /intel?tab=patents&sec=<key> */
  sec?: string;
}

export const NAV_MAIN: NavSection[] = [
  { label: '수전해 동향', href: '/intel?tab=news', tab: 'news' },
  { label: '경쟁사 비교', href: '/intel?tab=competitors', tab: 'competitors' },
  {
    label: '특허 분석',
    href: '/intel?tab=patents',
    tab: 'patents',
    subItems: [
      { label: '경쟁사', href: '/intel?tab=patents&sec=competitor', sec: 'competitor' },
      { label: 'HMG', href: '/intel?tab=patents&sec=hmg', sec: 'hmg' },
      { label: '특허제안리스트', href: '/intel?tab=patents&sec=proposals', sec: 'proposals' },
      { label: '특허 종합 DB', href: '/intel?tab=patents&sec=db', sec: 'db' },
    ],
  },
  {
    label: '법령 검색',
    href: '/search',
    subItems: [
      { label: '검색', href: '/search' },
      { label: '본문 비교', href: '/kgs-compare' },
      { label: '통합 요건', href: '/integrate' },
    ],
    relatedPaths: ['/kgs-family', '/forms/industrial-convergence'],
  },
];

export const NAV_ADMIN: SubNavItem[] = [
  { label: '법령 업로드', href: '/upload' },
];

function matchesRelatedPath(section: NavSection, pathname: string): boolean {
  return (section.relatedPaths ?? []).some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

/** True when a sub-item matches the current pathname. */
export function isSubItemActive(
  item: SubNavItem,
  pathname: string,
  tab: string | null = null,
  sec: string | null = null,
): boolean {
  if (item.sec !== undefined) {
    return pathname === '/intel' && tab === 'patents' && parsePatentSec(sec) === item.sec;
  }
  if (item.href === '/search') return pathname === '/search';
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

/**
 * True when a nav section is the active section.
 * - For intel tab sections: requires pathname === '/intel' AND tab matches.
 * - For sections with subItems: active when any sub-item or related path is active.
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
    return (
      section.subItems.some((sub) => isSubItemActive(sub, pathname)) ||
      matchesRelatedPath(section, pathname)
    );
  }
  return pathname === section.href;
}

/**
 * Returns true when the law-search section should be auto-expanded.
 * Pure helper — testable without React.
 */
export function shouldExpandLawSection(pathname: string): boolean {
  const lawSection = NAV_MAIN.find((s) => s.label === '법령 검색');
  if (!lawSection?.subItems) return false;
  return (
    lawSection.subItems.some((sub) => isSubItemActive(sub, pathname)) ||
    matchesRelatedPath(lawSection, pathname)
  );
}

/** True when the 특허 분석 section should be auto-expanded (any /intel?tab=patents view). */
export function shouldExpandPatentSection(pathname: string, tab: string | null): boolean {
  return pathname === '/intel' && tab === 'patents';
}
