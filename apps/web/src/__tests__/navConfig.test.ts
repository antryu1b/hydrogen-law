import { describe, it, expect } from 'vitest';
import {
  NAV_MAIN,
  NAV_ADMIN,
  isSectionActive,
  isSubItemActive,
} from '@/components/nav/navConfig';

describe('navConfig', () => {
  it('exports 4 main sections', () => {
    expect(NAV_MAIN).toHaveLength(4);
    const labels = NAV_MAIN.map((s) => s.label);
    expect(labels).toContain('수전해 동향');
    expect(labels).toContain('경쟁사 비교');
    expect(labels).toContain('법령 검색');
    expect(labels).toContain('특허 분석');
  });

  it('법령 검색 section has 6 sub-items', () => {
    const law = NAV_MAIN.find((s) => s.label === '법령 검색');
    expect(law?.subItems).toHaveLength(6);
  });

  it('exports 2 admin items', () => {
    expect(NAV_ADMIN).toHaveLength(2);
  });
});

describe('isSectionActive', () => {
  const news = NAV_MAIN.find((s) => s.label === '수전해 동향')!;
  const competitors = NAV_MAIN.find((s) => s.label === '경쟁사 비교')!;
  const law = NAV_MAIN.find((s) => s.label === '법령 검색')!;
  const patents = NAV_MAIN.find((s) => s.label === '특허 분석')!;

  it('intel tab section active when pathname=/intel and tab matches', () => {
    expect(isSectionActive(news, '/intel', 'news')).toBe(true);
    expect(isSectionActive(competitors, '/intel', 'competitors')).toBe(true);
    expect(isSectionActive(patents, '/intel', 'patents')).toBe(true);
  });

  it('intel tab section inactive when tab does not match', () => {
    expect(isSectionActive(news, '/intel', 'competitors')).toBe(false);
    expect(isSectionActive(news, '/intel', null)).toBe(false);
    expect(isSectionActive(news, '/', 'news')).toBe(false);
  });

  it('법령 검색 section active on any sub-item path', () => {
    expect(isSectionActive(law, '/', null)).toBe(true);
    expect(isSectionActive(law, '/kgs-compare', null)).toBe(true);
    expect(isSectionActive(law, '/integrate', null)).toBe(true);
    expect(isSectionActive(law, '/kgs-family', null)).toBe(true);
    expect(isSectionActive(law, '/forms/industrial-convergence', null)).toBe(true);
    expect(isSectionActive(law, '/compliance-check', null)).toBe(true);
  });

  it('법령 검색 section inactive on intel or unknown path', () => {
    expect(isSectionActive(law, '/intel', 'news')).toBe(false);
    expect(isSectionActive(law, '/upload', null)).toBe(false);
  });
});

describe('isSubItemActive', () => {
  it('root "/" item active only at exactly "/"', () => {
    expect(isSubItemActive({ label: '검색', href: '/' }, '/')).toBe(true);
    expect(isSubItemActive({ label: '검색', href: '/' }, '/kgs-compare')).toBe(false);
  });

  it('nested paths match correctly', () => {
    expect(isSubItemActive({ label: '본문 비교', href: '/kgs-compare' }, '/kgs-compare')).toBe(true);
    expect(isSubItemActive({ label: '본문 비교', href: '/kgs-compare' }, '/kgs-compare/detail')).toBe(true);
    expect(isSubItemActive({ label: '본문 비교', href: '/kgs-compare' }, '/kgs')).toBe(false);
  });
});
