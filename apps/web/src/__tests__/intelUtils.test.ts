import { describe, it, expect } from 'vitest';
import { stripSectionWords } from '@/lib/intel-utils';

const COMP_WORDS = ['경쟁사', '비교'];

describe('stripSectionWords', () => {
  it('removes both words from a heading that repeats the section name', () => {
    expect(stripSectionWords('경쟁사 상세 스펙 비교', COMP_WORDS)).toBe('상세 스펙');
  });

  it('strips from tab labels — PEM 경쟁사 비교 → PEM', () => {
    expect(stripSectionWords('PEM 경쟁사 비교', COMP_WORDS)).toBe('PEM');
  });

  it('strips from tab labels — ALK 경쟁사 비교 → ALK', () => {
    expect(stripSectionWords('ALK 경쟁사 비교', COMP_WORDS)).toBe('ALK');
  });

  it('strips trailing word only — PEM vs ALK 기술 비교 → PEM vs ALK 기술', () => {
    expect(stripSectionWords('PEM vs ALK 기술 비교', COMP_WORDS)).toBe('PEM vs ALK 기술');
  });

  it('strips — 中 경쟁사 비교 → 中', () => {
    expect(stripSectionWords('中 경쟁사 비교', COMP_WORDS)).toBe('中');
  });

  it('no-ops when no words match', () => {
    expect(stripSectionWords('수전해 PEM 기술 현황', COMP_WORDS)).toBe('수전해 PEM 기술 현황');
  });

  it('handles empty words array', () => {
    expect(stripSectionWords('경쟁사 비교', [])).toBe('경쟁사 비교');
  });

  it('collapses extra whitespace', () => {
    expect(stripSectionWords('경쟁사  상세   스펙  비교', COMP_WORDS)).toBe('상세 스펙');
  });
});
