import { describe, it, expect } from 'vitest';
import {
  parseSearchQuery,
  allTerms,
  termMatches,
  matchesQuery,
} from '@/lib/search-query';

describe('parseSearchQuery — AND (space)', () => {
  it('splits space-separated terms into one ANDed group', () => {
    const groups = parseSearchQuery('연료 가스');
    expect(groups).toHaveLength(1);
    expect(groups[0].map((t) => t.text)).toEqual(['연료', '가스']);
    expect(groups[0].every((t) => !t.quoted)).toBe(true);
  });

  it('treats a single word as one group of one term', () => {
    const groups = parseSearchQuery('수소');
    expect(groups).toEqual([[{ text: '수소', quoted: false }]]);
  });

  it('collapses repeated whitespace', () => {
    const groups = parseSearchQuery('수소   충전소');
    expect(groups[0].map((t) => t.text)).toEqual(['수소', '충전소']);
  });
});

describe('parseSearchQuery — OR', () => {
  it('splits on uppercase OR into separate groups', () => {
    const groups = parseSearchQuery('수소 OR 산소');
    expect(groups.map((g) => g.map((t) => t.text))).toEqual([['수소'], ['산소']]);
  });

  it('splits on lowercase or (case-insensitive)', () => {
    const groups = parseSearchQuery('수소 or 산소');
    expect(groups.map((g) => g.map((t) => t.text))).toEqual([['수소'], ['산소']]);
  });

  it('ANDs within a group, ORs across groups', () => {
    const groups = parseSearchQuery('연료 가스 OR 수소');
    expect(groups.map((g) => g.map((t) => t.text))).toEqual([
      ['연료', '가스'],
      ['수소'],
    ]);
  });

  it('does not treat the substring "or" inside a word as a separator', () => {
    const groups = parseSearchQuery('senor 산소');
    expect(groups.map((g) => g.map((t) => t.text))).toEqual([['senor', '산소']]);
  });
});

describe('parseSearchQuery — 또는', () => {
  it('splits on Korean 또는 into separate groups', () => {
    const groups = parseSearchQuery('수소 또는 산소');
    expect(groups.map((g) => g.map((t) => t.text))).toEqual([['수소'], ['산소']]);
  });
});

describe('parseSearchQuery — quotes', () => {
  it('treats a double-quoted span as one term (spaces kept in the surface text)', () => {
    const groups = parseSearchQuery('"연료 가스"');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual([{ text: '연료 가스', quoted: true }]);
  });

  it('mixes a quoted phrase with bare terms', () => {
    const groups = parseSearchQuery('"연료 가스" 안전');
    expect(groups[0]).toEqual([
      { text: '연료 가스', quoted: true },
      { text: '안전', quoted: false },
    ]);
  });

  it('handles an unterminated quote by taking the rest of the string', () => {
    const groups = parseSearchQuery('"연료 가스');
    expect(groups[0]).toEqual([{ text: '연료 가스', quoted: true }]);
  });
});

describe('parseSearchQuery — edge cases', () => {
  it('returns [] for empty / whitespace-only input', () => {
    expect(parseSearchQuery('')).toEqual([]);
    expect(parseSearchQuery('   ')).toEqual([]);
  });

  it('returns [] for an OR-only query', () => {
    expect(parseSearchQuery('OR')).toEqual([]);
    expect(parseSearchQuery('또는')).toEqual([]);
  });
});

describe('allTerms', () => {
  it('flattens groups to distinct surface terms in order', () => {
    const groups = parseSearchQuery('연료 가스 OR 수소 가스');
    expect(allTerms(groups)).toEqual(['연료', '가스', '수소']);
  });
});

describe('termMatches — whitespace-insensitive', () => {
  it('matches a no-space term against spaced stored text', () => {
    expect(termMatches('수소 연료 가스 자동차', { text: '연료가스', quoted: false })).toBe(true);
  });

  it('matches a spaced term against joined stored text', () => {
    expect(termMatches('수소 연료가스 자동차', { text: '연료 가스', quoted: false })).toBe(true);
  });

  it('matches an exact term', () => {
    expect(termMatches('연료', { text: '연료', quoted: false })).toBe(true);
  });

  it('does not match an absent term', () => {
    expect(termMatches('수소 자동차', { text: '연료가스', quoted: false })).toBe(false);
  });

  it('quoted term is a contiguous unit matched whitespace-insensitively', () => {
    // New contract: "로크 아웃" matches stored "로크아웃" AND "로크 아웃".
    expect(termMatches('비상 로크아웃 장치', { text: '로크 아웃', quoted: true })).toBe(true);
    expect(termMatches('비상 로크 아웃 장치', { text: '로크 아웃', quoted: true })).toBe(true);
    // But it stays one contiguous unit: a doc with the chars split far apart
    // (가스 ... 연료, not adjacent) does NOT match the quoted phrase "연료 가스".
    expect(termMatches('가스 안전 연료', { text: '연료 가스', quoted: true })).toBe(false);
  });
});

describe('matchesQuery — AND / OR semantics', () => {
  it('"연료 가스" requires BOTH terms present', () => {
    const groups = parseSearchQuery('연료 가스');
    expect(matchesQuery('연료 가스 설비', groups)).toBe(true);
    expect(matchesQuery('연료가스 설비', groups)).toBe(true); // whitespace-insensitive
    expect(matchesQuery('연료 설비', groups)).toBe(false); // 가스 absent
  });

  it('"수소 OR 산소" matches docs with either', () => {
    const groups = parseSearchQuery('수소 OR 산소');
    expect(matchesQuery('수소 충전소', groups)).toBe(true);
    expect(matchesQuery('산소 탱크', groups)).toBe(true);
    expect(matchesQuery('질소 탱크', groups)).toBe(false);
  });

  it('"연료 가스 OR 수소" = (연료 AND 가스) OR 수소', () => {
    const groups = parseSearchQuery('연료 가스 OR 수소');
    expect(matchesQuery('연료 가스 설비', groups)).toBe(true); // group 1 satisfied
    expect(matchesQuery('수소 설비', groups)).toBe(true); // group 2 satisfied
    expect(matchesQuery('연료 설비', groups)).toBe(false); // neither fully satisfied
  });

  it('"연료가스" matches docs storing "연료 가스"', () => {
    const groups = parseSearchQuery('연료가스');
    expect(matchesQuery('연료 가스 설비', groups)).toBe(true);
  });

  it('quoted "로크 아웃" matches docs storing "로크아웃" (whitespace-insensitive)', () => {
    const groups = parseSearchQuery('"로크 아웃"');
    expect(matchesQuery('비상 로크아웃 장치 작동', groups)).toBe(true);
    expect(matchesQuery('비상 로크 아웃 장치 작동', groups)).toBe(true);
    expect(matchesQuery('비상 정지 장치 작동', groups)).toBe(false);
  });

  it('empty query matches nothing', () => {
    expect(matchesQuery('anything', parseSearchQuery(''))).toBe(false);
  });
});
