// Shared search-query parser for both search paths (law search + KGS recommend).
//
// Grammar (intuitive AND / OR):
//   • Space  = AND  — "연료 가스" matches docs containing BOTH 연료 AND 가스.
//   • OR     = OR   — an explicit `OR` token (case-insensitive) or Korean `또는`
//                     between terms means either side. The query is parsed into
//                     OR-groups; within a group, space-separated terms are ANDed.
//                     A doc matches if ANY group is fully satisfied.
//   • "..."  = exact phrase — a double-quoted span is one literal term (spaces
//                     inside preserved, NOT whitespace-collapsed when matched).
//
// Each non-quoted term is matched whitespace-insensitively elsewhere (term
// "연료가스" matches stored "연료 가스" and vice versa). This subsumes the old
// "collapse the whole query to one compound" hack: "연료 가스" = 연료 AND 가스,
// both present in "연료가스"; a doc with only 연료 is correctly excluded.

export interface QueryTerm {
  // The user-facing text of the term (what to show in chips / highlight).
  text: string;
  // Whether this term came from a "quoted" span (exact phrase, spaces preserved).
  quoted: boolean;
}

// One OR-group: its terms are ANDed together.
export type OrGroup = QueryTerm[];

// Tokenize a query into a flat list of tokens, honoring "double quotes" as a
// single token and treating OR / 또는 as explicit separators. Returns tokens in
// order, with an `isOr` marker for OR separators so the grouping step can split.
interface RawToken { value: string; quoted: boolean; isOr: boolean; }

function tokenize(query: string): RawToken[] {
  const tokens: RawToken[] = [];
  let i = 0;
  const n = query.length;
  while (i < n) {
    const ch = query[i];
    // Skip whitespace between tokens.
    if (/\s/.test(ch)) { i++; continue; }
    // Quoted span: consume until the closing quote (or end of string).
    if (ch === '"') {
      let j = i + 1;
      let buf = '';
      while (j < n && query[j] !== '"') { buf += query[j]; j++; }
      // j now points at the closing quote or end. Skip the closing quote.
      i = j < n ? j + 1 : j;
      if (buf.trim().length > 0) tokens.push({ value: buf, quoted: true, isOr: false });
      continue;
    }
    // Bare token: consume until next whitespace or quote.
    let j = i;
    let buf = '';
    while (j < n && !/\s/.test(query[j]) && query[j] !== '"') { buf += query[j]; j++; }
    i = j;
    if (buf.length === 0) continue;
    // OR separators (case-insensitive `or`, or Korean `또는`).
    if (buf.toLowerCase() === 'or' || buf === '또는') {
      tokens.push({ value: buf, quoted: false, isOr: true });
    } else {
      tokens.push({ value: buf, quoted: false, isOr: false });
    }
  }
  return tokens;
}

// Parse a raw query string into OR-groups of AND-terms.
//   "연료 가스"          -> [[연료, 가스]]                      (one group, ANDed)
//   "수소 OR 산소"        -> [[수소], [산소]]                   (two groups)
//   "연료 가스 OR 수소"   -> [[연료, 가스], [수소]]
//   "수소 또는 산소"      -> [[수소], [산소]]
//   '"연료 가스" 안전'    -> [[{연료 가스, quoted}, 안전]]
// Empty / OR-only queries yield [].
export function parseSearchQuery(query: string): OrGroup[] {
  const tokens = tokenize(query ?? '');
  const groups: OrGroup[] = [];
  let current: OrGroup = [];
  for (const t of tokens) {
    if (t.isOr) {
      if (current.length > 0) { groups.push(current); current = []; }
      continue;
    }
    current.push({ text: t.value, quoted: t.quoted });
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

// Flatten OR-groups to the distinct term texts (for chips / highlighting), in
// first-seen order. Useful when a route only needs the surface terms.
export function allTerms(groups: OrGroup[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of groups) {
    for (const term of g) {
      if (!seen.has(term.text)) { seen.add(term.text); out.push(term.text); }
    }
  }
  return out;
}

// Collapse whitespace in a string (for whitespace-insensitive comparison).
function collapse(s: string): string {
  return s.replace(/\s+/g, '');
}

// Does `haystack` contain `term`?
//   • Non-quoted: whitespace-insensitive — collapse spaces on BOTH sides so
//     "연료가스" matches "연료 가스" and vice versa.
//   • Quoted: literal substring (case-insensitive), spaces preserved.
export function termMatches(haystack: string, term: QueryTerm): boolean {
  const hay = haystack.toLowerCase();
  if (term.quoted) {
    return hay.includes(term.text.toLowerCase());
  }
  return collapse(hay).includes(collapse(term.text.toLowerCase()));
}

// Does `haystack` satisfy the parsed query? True if ANY OR-group has ALL its
// AND-terms present (each via termMatches). An empty group list matches nothing.
export function matchesQuery(haystack: string, groups: OrGroup[]): boolean {
  if (groups.length === 0) return false;
  return groups.some((group) => group.every((term) => termMatches(haystack, term)));
}
