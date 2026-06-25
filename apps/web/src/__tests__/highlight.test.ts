import { describe, it, expect } from 'vitest';
import { highlightText, whitespaceInsensitivePattern, centeredSnippet } from '@/lib/highlight';

// Whitespace-insensitive highlighting: searching "연료전지" must highlight
// stored text that reads "연료 전지", and searching "연료 전지" must highlight
// stored "연료전지". The mark wraps the matched span exactly as it appears.
describe('highlightText whitespace-insensitive', () => {
  it('highlights spaced text when keyword has no space', () => {
    const out = highlightText('수소 연료 전지 자동차', ['연료전지']);
    expect(out).toContain('<mark');
    expect(out).toContain('연료 전지');
    expect(out).toMatch(/<mark[^>]*>연료 전지<\/mark>/);
  });

  it('highlights joined text when keyword has a space', () => {
    const out = highlightText('수소 연료전지 자동차', ['연료 전지']);
    expect(out).toMatch(/<mark[^>]*>연료전지<\/mark>/);
  });

  it('highlights exact match (no space on either side)', () => {
    const out = highlightText('연료전지 시스템', ['연료전지']);
    expect(out).toMatch(/<mark[^>]*>연료전지<\/mark>/);
  });

  it('returns original text when no keywords', () => {
    expect(highlightText('연료 전지', [])).toBe('연료 전지');
  });

  it('escapes regex special chars in keywords', () => {
    const out = highlightText('항목 (a.b) 설명', ['(a.b)']);
    expect(out).toMatch(/<mark[^>]*>\(a\.b\)<\/mark>/);
  });

  it('does not over-match unrelated text', () => {
    const out = highlightText('수소 자동차', ['연료전지']);
    expect(out).not.toContain('<mark');
  });

  it('highlights a quoted phrase whitespace-insensitively', () => {
    // A quoted phrase "로크 아웃" is highlighted as one contiguous unit ignoring
    // spaces, so it marks stored "로크아웃" too (mirrors highlightBody using the
    // same whitespaceInsensitivePattern for ALL terms incl. quoted).
    const out = highlightText('비상 로크아웃 장치', ['로크 아웃']);
    expect(out).toMatch(/<mark[^>]*>로크아웃<\/mark>/);
  });
});

// whitespaceInsensitivePattern is what InlineBodyCompare.highlightBody uses for
// ALL terms (quoted + non-quoted) after FIX 1, so a quoted phrase highlights too.
// centeredSnippet builds a display excerpt centered on the first matched term so
// a row matched deep in its body still SHOWS (and then highlights) the match.
describe('centeredSnippet', () => {
  const lead = '가나다라마바사아자차카타파하'.repeat(8); // ~112 chars of non-match lead
  const body = `${lead}이 법에서 사용하는 용어의 정의는 다음과 같다 ${lead}`;

  it('centers on the first matched term and adds ellipses when truncated', () => {
    const snip = centeredSnippet(body, ['용어', '정의']);
    expect(snip).not.toBeNull();
    expect(snip).toContain('용어');
    expect(snip!.startsWith('…')).toBe(true);
    expect(snip!.endsWith('…')).toBe(true);
    // The matched span survives a subsequent highlight pass.
    expect(highlightText(snip!, ['용어', '정의'])).toMatch(/<mark[^>]*>용어<\/mark>/);
  });

  it('picks the EARLIEST match across multiple terms', () => {
    // 정의 appears before 용어 here → snippet should be anchored on 정의.
    const txt = `${lead}정의를 먼저 두고 ${lead} 그리고 용어를 뒤에`;
    const snip = centeredSnippet(txt, ['용어', '정의']);
    expect(snip).toContain('정의');
    expect(snip).not.toContain('용어'); // 용어 is far past the after-window
  });

  it('matches whitespace-insensitively', () => {
    const snip = centeredSnippet('앞부분 연료 전지 장치 뒷부분', ['연료전지']);
    expect(snip).toContain('연료 전지');
  });

  it('returns null when no term appears (caller keeps a lead excerpt)', () => {
    expect(centeredSnippet('이 조문은 수소 안전관리만 다룬다', ['용어', '정의'])).toBeNull();
  });

  it('returns null for empty text or empty keywords', () => {
    expect(centeredSnippet('', ['용어'])).toBeNull();
    expect(centeredSnippet('용어 정의', [])).toBeNull();
  });

  it('omits leading ellipsis when match is at the start', () => {
    const snip = centeredSnippet('용어 정의는 다음과 같다', ['용어']);
    expect(snip!.startsWith('…')).toBe(false);
  });
});

describe('whitespaceInsensitivePattern', () => {
  it('collapses internal whitespace and allows optional spaces between chars', () => {
    const pat = whitespaceInsensitivePattern('로크 아웃');
    const re = new RegExp(pat);
    expect(re.test('로크아웃')).toBe(true);
    expect(re.test('로크 아웃')).toBe(true);
    expect(re.test('로크\t아웃')).toBe(true);
    expect(re.test('로크')).toBe(false);
  });
});
