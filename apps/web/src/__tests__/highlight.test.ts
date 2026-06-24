import { describe, it, expect } from 'vitest';
import { highlightText } from '@/lib/highlight';

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
});
