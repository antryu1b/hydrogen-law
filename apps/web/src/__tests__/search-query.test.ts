import { describe, it, expect } from 'vitest';
import {
  parseSearchQuery,
  allTerms,
  termMatches,
  matchesQuery,
  stripKoreanParticle,
  stemForMatch,
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

describe('stripKoreanParticle — conservative 조사/어미 stripping', () => {
  it('strips a trailing 조사 leaving a ≥2-char stem', () => {
    expect(stripKoreanParticle('배기가스가')).toBe('배기가스'); // 가
    expect(stripKoreanParticle('수소를')).toBe('수소'); // 를
    expect(stripKoreanParticle('연료의')).toBe('연료'); // 의
    expect(stripKoreanParticle('설비에서')).toBe('설비'); // 에서 (multi-char wins over 에)
    expect(stripKoreanParticle('가스으로')).toBe('가스'); // 으로 wins over 로
  });

  it('strips light verb/adjective endings when stem stays ≥2 chars', () => {
    expect(stripKoreanParticle('연결되는')).toBe('연결'); // 되는
    expect(stripKoreanParticle('설치하여')).toBe('설치'); // 하여
    expect(stripKoreanParticle('작동하고')).toBe('작동'); // 하고
  });

  it('falls through a guard-failing long suffix to a shorter valid one', () => {
    // "통하는": 하는 → stem "통" (1 char) FAILS guard → loop continues → 는 →
    // stem "통하" (2 chars) PASSES. Result "통하" matches both "통하는" and the
    // "통하여" stem in the corpus.
    expect(stripKoreanParticle('통하는')).toBe('통하');
  });

  it('does NOT strip when EVERY candidate stem would be < 2 Korean chars', () => {
    // short word legitimately ending in 는 / 가 — stem too short, keep verbatim.
    expect(stripKoreanParticle('나는')).toBe('나는'); // stem "나" < 2 chars
    expect(stripKoreanParticle('가가')).toBe('가가'); // stem "가" < 2 chars
    expect(stripKoreanParticle('는')).toBe('는'); // shorter than suffix
  });

  it('leaves non-Korean terms untouched', () => {
    expect(stripKoreanParticle('gas')).toBe('gas');
    expect(stripKoreanParticle('CO2')).toBe('CO2');
    expect(stripKoreanParticle('')).toBe('');
  });

  it('leaves a term without a listed trailing particle untouched', () => {
    expect(stripKoreanParticle('배기가스')).toBe('배기가스');
    expect(stripKoreanParticle('수소충전소')).toBe('수소충전소');
  });

  it('only peels one ending (single pass, conservative)', () => {
    // "통하여" → 하여 → "통" is 1 char (fails guard); no shorter listed suffix
    // matches → returns original (no recursive peeling to "통하").
    expect(stripKoreanParticle('통하여')).toBe('통하여');
  });
});

describe('stemForMatch — quoted vs non-quoted', () => {
  it('strips the particle for a non-quoted term', () => {
    expect(stemForMatch({ text: '배기가스가', quoted: false })).toBe('배기가스');
  });

  it('NEVER strips a quoted term (exact-phrase contract)', () => {
    expect(stemForMatch({ text: '배기가스가', quoted: true })).toBe('배기가스가');
    expect(stemForMatch({ text: '연료 가스', quoted: true })).toBe('연료 가스');
  });
});

describe('termMatches — particle-stripped matching for non-quoted terms', () => {
  it('"배기가스가" (non-quoted) matches stored "배기가스"', () => {
    expect(termMatches('이 설비의 배기가스 배출 기준', { text: '배기가스가', quoted: false })).toBe(true);
  });

  it('"통하는" (stem "통하") matches both "통하는" and the "통하여" stem', () => {
    // stripKoreanParticle("통하는") = "통하" → substring of both stored forms.
    expect(termMatches('수소가 통하는 부분', { text: '통하는', quoted: false })).toBe(true);
    expect(termMatches('수소가 통하여 흐르는 부분', { text: '통하는', quoted: false })).toBe(true);
  });

  it('a quoted "배기가스가" does NOT strip — only matches the exact form', () => {
    expect(termMatches('배기가스 배출', { text: '배기가스가', quoted: true })).toBe(false);
    expect(termMatches('배기가스가 배출', { text: '배기가스가', quoted: true })).toBe(true);
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
