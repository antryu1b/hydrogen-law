// Keyword highlighting for search results.
// Whitespace-insensitive: a query "연료전지" highlights stored text "연료 전지"
// and vice versa, by allowing optional whitespace between each keyword char.

// Escape regex special chars
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a whitespace-insensitive pattern for a keyword: allow optional whitespace
// between each (escaped) character so a query "연료전지" still matches stored text
// "연료 전지", and a spaced query "연료 전지" still matches "연료전지". Internal
// whitespace in the keyword itself is collapsed first so it doesn't force a space.
export function whitespaceInsensitivePattern(keyword: string): string {
  const chars = [...keyword.replace(/\s+/g, '')];
  return chars.map(escapeRegex).join('\\s*');
}

// FIX 2: component-word fallback for a multi-word (quoted) keyword that is NOT
// present verbatim in `text`. A quoted phrase can match a result via the broader
// index yet not appear contiguously in the displayed body/snippet — in that case
// highlighting the full phrase marks nothing, so we fall back to its component
// words (split on whitespace) so the user still sees the relevant words.
//
// A keyword is expanded ONLY when it contains internal whitespace (i.e. a phrase)
// AND its whitespace-insensitive form does not occur in `text`. Single-word
// keywords (the common case after particle-stripping) pass through unchanged.
export function expandKeywordsForText(keywords: string[], text: string): string[] {
  const out: string[] = [];
  for (const k of keywords) {
    const trimmed = k.trim();
    if (!trimmed) continue;
    const hasSpace = /\s/.test(trimmed);
    if (!hasSpace) { out.push(trimmed); continue; }
    const pat = whitespaceInsensitivePattern(trimmed);
    const present = pat.length > 0 && new RegExp(pat, 'i').test(text);
    if (present) {
      out.push(trimmed);
    } else {
      for (const w of trimmed.split(/\s+/)) if (w.length > 0) out.push(w);
    }
  }
  return out;
}

// Build a display snippet centered on the FIRST matched query term in `text`.
// Mirrors KGS `matchedSectionsFor`: find the earliest whitespace-insensitive
// match across `keywords`, take ~40 chars before to ~80 after the match, collapse
// internal whitespace, and prefix/suffix with "…" when truncated. Returns null
// when NO keyword appears in `text` (caller then keeps a lead excerpt).
export function centeredSnippet(
  text: string,
  keywords: string[],
  before = 40,
  after = 80
): string | null {
  if (!text) return null;
  // Fall back to component words for any quoted phrase not present verbatim, so the
  // snippet can still center on a component word when the full phrase is absent.
  const cleaned = expandKeywordsForText(keywords, text)
    .map((k) => k.replace(/\s+/g, ''))
    .filter((k) => k.length > 0);
  if (!cleaned.length) return null;

  // Earliest match across all terms (whitespace-insensitive).
  let best: { idx: number; len: number } | null = null;
  for (const k of cleaned) {
    const re = new RegExp(whitespaceInsensitivePattern(k), 'i');
    const m = re.exec(text);
    if (m && (best === null || m.index < best.idx)) best = { idx: m.index, len: m[0].length };
  }
  if (!best) return null;

  const start = Math.max(0, best.idx - before);
  const end = Math.min(text.length, best.idx + best.len + after);
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + body + (end < text.length ? '…' : '');
}

// Highlight keywords in text
export function highlightText(text: string, keywords: string[]): string {
  if (!keywords.length) return text;

  // Component-word fallback: a quoted phrase not present verbatim in `text` would
  // otherwise highlight nothing — expand it to its component words instead.
  const patterns = expandKeywordsForText(keywords, text)
    .map((k) => k.replace(/\s+/g, ''))
    .filter((k) => k.length > 0)
    .map(whitespaceInsensitivePattern);
  if (!patterns.length) return text;

  const keywordRegex = new RegExp(`(${patterns.join('|')})`, 'gi');
  let highlighted = text.replace(
    keywordRegex,
    '<mark style="background-color: #fef08a; padding: 2px 4px; border-radius: 2px;">$1</mark>'
  );

  // Format newlines for display
  highlighted = highlighted.replace(/\n\n+/g, '<br><br>');
  highlighted = highlighted.replace(/\n/g, ' ');

  return highlighted;
}
