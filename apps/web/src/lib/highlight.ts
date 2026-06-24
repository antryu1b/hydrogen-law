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

// Highlight keywords in text
export function highlightText(text: string, keywords: string[]): string {
  if (!keywords.length) return text;

  const patterns = keywords
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
