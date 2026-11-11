/**
 * Post-processing for the 특허 분석 rows produced by extract.mjs.
 *
 *  - dropInternalProcedure: removes the internal review-procedure blocks (①–④) from
 *    the fto-review section and strips team names from its overview heading.
 *  - regroupCompetitorTabs: rebuilds the competitor portfolio tabs (formerly
 *    경쟁사1/경쟁사2) on the KIPRIS watch groups, recomputing every count from the table rows.
 *  - renameLegacyGroups: renames remaining 경쟁사1/경쟁사2 mentions to descriptive names.
 *
 * The company→group mapping is the KIPRIS alias map itself (apps/web/src/lib/patent-watch.ts),
 * imported directly so the two can never drift. Importing .ts needs Node type stripping
 * (Node >= 22.18 / 23.6).
 *
 * Every transform throws when the source structure is not what it expects, instead of
 * silently dropping content.
 */
import { COMPETITOR_GROUPS, competitorGroupFor } from '../../apps/web/src/lib/patent-watch.ts';

/** Display names for the earlier FTO grouping (used where analysis was done on it). */
export const LEGACY_GROUP_NAMES = ['자동차 계열', '수전해 전문·에너지 기업'];

const PROCEDURE_HEADING = /^[①②③④]/;

/** Removes rows after the overview (heading, text, stats) of the fto-review section. */
export function dropInternalProcedure(rows, { ftoCount, categoryCounts }) {
  const fto = rows.filter((r) => r.section === 'fto-review');
  const firstProc = fto.findIndex((r) => r.payload.type === 'heading' && PROCEDURE_HEADING.test(r.payload.title));
  if (firstProc !== 3) {
    throw new Error(`dropInternalProcedure: expected the procedure blocks to start at fto-review:003, found index ${firstProc}`);
  }
  const dropped = fto.slice(firstProc);
  const procHeadings = dropped.filter((r) => r.payload.type === 'heading').map((r) => r.payload.title);
  if (procHeadings.length !== 4 || !procHeadings.every((t) => PROCEDURE_HEADING.test(t))) {
    throw new Error(`dropInternalProcedure: unexpected headings in the dropped range: ${JSON.stringify(procHeadings)}`);
  }
  const droppedIds = new Set(dropped.map((r) => r.id));
  const out = rows.filter((r) => !droppedIds.has(r.id));
  const head = out.find((r) => r.section === 'fto-review');
  if (head?.payload.type !== 'heading') throw new Error('dropInternalProcedure: fto-review must start with a heading');
  head.payload = { ...head.payload, desc: neutralFtoDesc(head.payload.desc ?? '', ftoCount) };
  const summary = out.filter((r) => r.section === 'fto-review')[1];
  if (summary?.payload.type !== 'text') throw new Error('dropInternalProcedure: fto-review:001 must be a text block');
  summary.payload = { ...summary.payload, text: neutralFtoSummary(summary.payload.text, ftoCount, categoryCounts) };
  return { rows: out, droppedIds: [...droppedIds] };
}

/**
 * Keeps only the sentence with the 총 N건 count breakdown (drops review schedule, external firm
 * and assessment sentences) and checks its numbers against the FTO records.
 */
export function neutralFtoSummary(text, ftoCount, categoryCounts) {
  const sentence = text.split(/(?<=\.)\s+/).find((x) => x.includes(`총 ${ftoCount}건`));
  if (!sentence) throw new Error(`neutralFtoSummary: no sentence with "총 ${ftoCount}건"`);
  for (const n of categoryCounts) {
    if (!sentence.includes(`(${n}건)`)) throw new Error(`neutralFtoSummary: count ${n}건 missing from "${sentence}"`);
  }
  return sentence;
}

/** Drops team mentions ("…팀 주관" segments, "(…팀…)" groups) and prefixes the FTO basis label. */
export function neutralFtoDesc(desc, ftoCount) {
  const body = desc
    .replace(/\s*\([^)]*팀[^)]*\)/g, '')
    .split(' · ')
    .filter((seg) => !/팀/.test(seg))
    .join(' · ')
    .trim();
  return [`FTO 검토 ${ftoCount}건 기준`, body].filter(Boolean).join(' · ');
}

// ── competitor regrouping ───────────────────────────────────────────────────
const TABLE_HEADERS = ['No', null, '출원번호', '발명의 명칭', '출원인', '분류', '출원일', '등록일', '판단'];
const NEED = '필요';

function pct(n, d) {
  return d ? `${((n / d) * 100).toFixed(1)}%` : '0.0%';
}

function countBy(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function joinCounts(map) {
  return [...map].map(([k, n]) => `${k} ${n}건`).join(' · ');
}

/** Splits one legacy tab into its table rows and the analysis blocks that follow the table. */
function splitLegacyTab(tab) {
  const tIdx = tab.blocks.findIndex((b) => b.type === 'table');
  if (tIdx === -1) throw new Error(`regroupCompetitorTabs: tab "${tab.label}" has no table`);
  const pre = tab.blocks.slice(0, tIdx);
  if (!pre.every((b) => b.type === 'heading' || b.type === 'stats')) {
    throw new Error(`regroupCompetitorTabs: tab "${tab.label}" has unexpected blocks before its table`);
  }
  const table = tab.blocks[tIdx];
  TABLE_HEADERS.forEach((h, i) => {
    if (h !== null && table.headers[i] !== h) {
      throw new Error(`regroupCompetitorTabs: tab "${tab.label}" column ${i} is "${table.headers[i]}", expected "${h}"`);
    }
  });
  if (table.headers.length !== TABLE_HEADERS.length) {
    throw new Error(`regroupCompetitorTabs: tab "${tab.label}" has ${table.headers.length} columns`);
  }
  if (tab.blocks.slice(tIdx + 1).some((b) => b.type === 'table')) {
    throw new Error(`regroupCompetitorTabs: tab "${tab.label}" has more than one table`);
  }
  return { rows: table.rows, analysis: tab.blocks.slice(tIdx + 1) };
}

/**
 * "No.47·48" in a legacy 참고 note pointed at the old table numbering; replace it with the
 * application numbers so the reference survives renumbering.
 */
function replaceLegacyNos(text, legacyRows) {
  return text.replace(/No\.(\d+(?:·\d+)*)/g, (_, list) =>
    list
      .split('·')
      .map((n) => {
        const row = legacyRows.find((r) => r[0].t === n);
        if (!row) throw new Error(`regroupCompetitorTabs: 참고 note references missing No.${n}`);
        return row[2].t;
      })
      .join('·'),
  );
}

function statsBlock(entries, companyOrder) {
  const need = entries.filter((e) => e.need);
  const needCats = countBy(need.flatMap((e) => e.cells[5].t.split(/\s+/).filter(Boolean)));
  const byCompany = countBy(entries.map((e) => e.company));
  const items = [
    { label: '전체 건수', value: `${entries.length}건`, desc: joinCounts(byCompany) },
    {
      label: '상세검토 필요',
      value: `${need.length}건 (${pct(need.length, entries.length)})`,
      desc: need.length ? `${joinCounts(needCats)}${needCats.size > 1 ? ' (중복 포함)' : ''}` : '해당 없음',
    },
  ];
  for (const c of companyOrder) {
    const n = byCompany.get(c) ?? 0;
    const k = entries.filter((e) => e.company === c && e.need).length;
    items.push({ label: c, value: `${n}건`, desc: n ? `상세검토 필요 ${k}건` : 'FTO 검토 DB 내 출원 없음' });
  }
  return { type: 'stats', items };
}

/**
 * Rebuilds the competitor:002 tabs on the KIPRIS groups. Returns the new payload plus a
 * summary (group counts) for the overview heading and reporting. Throws on an applicant
 * missing from the alias map.
 */
export function regroupCompetitorTabs(payload, { ftoCount }) {
  if (payload.type !== 'tabs' || payload.tabs.length !== LEGACY_GROUP_NAMES.length) {
    throw new Error(`regroupCompetitorTabs: expected a tabs block with ${LEGACY_GROUP_NAMES.length} tabs`);
  }
  const legacy = payload.tabs.map(splitLegacyTab);
  const entries = legacy.flatMap((l, li) =>
    l.rows.map((cells, i) => {
      const hit = competitorGroupFor(cells[4].t);
      // No fallback bucket: every applicant must be in the KIPRIS alias map (patent-watch.ts).
      if (!hit) throw new Error(`regroupCompetitorTabs: applicant "${cells[4].t}" is not in the KIPRIS alias map`);
      return {
        cells,
        legacy: li,
        order: i,
        group: hit?.group,
        company: hit?.company,
        need: cells[8].t === NEED,
      };
    }),
  );
  // Filing date ascending (YYYY.MM.DD compares as text); legacy order breaks ties.
  entries.sort((a, b) => a.cells[6].t.localeCompare(b.cells[6].t) || a.legacy - b.legacy || a.order - b.order);

  const groupNames = COMPETITOR_GROUPS.map((g) => g.group);
  const byGroup = new Map(groupNames.map((g) => [g, entries.filter((e) => e.group === g)]));
  const tabs = [];
  for (const g of groupNames) {
    const list = byGroup.get(g);
    if (!list.length) continue;
    // The 당사 entry (현대차) is never a competitor in the FTO portfolio.
    const companyOrder = COMPETITOR_GROUPS.find((x) => x.group === g).companies.filter((c) => c !== '현대차');
    const blocks = [statsBlock(list, companyOrder)];
    blocks.push(
      {
        type: 'heading',
        title: `전체 목록 (${list.length}건)`,
        desc: `FTO 검토 ${ftoCount}건 기준 · 출원일 오름차순 정렬 · 동일 appNo가 기액분리기/시스템 양 카테고리에서 평가된 경우 분류란에 병기`,
      },
      {
        type: 'table',
        headers: ['No', '기업', ...TABLE_HEADERS.slice(2)],
        rows: list.map((e, i) => [{ t: String(i + 1) }, { ...e.cells[1], t: e.company }, ...e.cells.slice(2)]),
      },
    );
    tabs.push({ group: g, label: `${g} (${list.length}건)`, blocks });
  }

  // Legacy analysis: attach to the new tab holding all but a few of that legacy group's
  // rows (>= 90%); otherwise it gets its own tab. Either way it carries a note.
  legacy.forEach((l, li) => {
    const name = LEGACY_GROUP_NAMES[li];
    const where = countBy(entries.filter((e) => e.legacy === li).map((e) => e.group));
    const analysis = l.analysis.map((b) =>
      b.type === 'text' && b.text.startsWith('참고') ? { ...b, text: replaceLegacyNos(b.text, l.rows) } : b,
    );
    const note = {
      type: 'text',
      tone: 'info',
      text:
        `※ 아래 참고·공백 분석은 이전 분류(${name} ${l.rows.length}건) 기준입니다. ` +
        (where.size === 1
          ? `해당 ${l.rows.length}건은 모두 현재 ${[...where.keys()][0]} 탭에 있습니다.`
          : `해당 ${l.rows.length}건은 현재 ${joinCounts(where)}으로 나뉩니다.`),
    };
    const [topGroup, topN] = [...where].sort((a, b) => b[1] - a[1])[0];
    const home = topN / l.rows.length >= 0.9 ? tabs.find((t) => t.group === topGroup) : null;
    if (home) home.blocks.push(note, ...analysis);
    else tabs.push({ group: null, label: `공백 분석 — ${name} (이전 분류)`, blocks: [note, ...analysis] });
  });

  const counts = groupNames.map((g) => [g, byGroup.get(g).length]).filter(([, n]) => n);
  return {
    payload: { type: 'tabs', tabs: tabs.map(({ label, blocks }) => ({ label, blocks })) },
    summary: { total: entries.length, counts, legacyCounts: legacy.map((l) => l.rows.length) },
  };
}

// ── legacy group renaming ───────────────────────────────────────────────────
const [L1, L2] = LEGACY_GROUP_NAMES;
// Specific phrasings first, bare labels last. 치요다 is dropped: it has 0 filings (see competitor:001).
const RENAMES = [
  ['자동차 계열(경쟁사1)', L1],
  ['경쟁사1(도요타·혼다·치요다 계열)', `${L1}(도요타·혼다)`],
  ['경쟁사1(도요타·혼다 계열)', `${L1}(도요타·혼다)`],
  ['경쟁사2(그 외 수전해 전문기업)', L2],
  ['경쟁사2(전문 수전해 기업)', L2],
  ['경쟁사2 (전문 수전해기업)', L2],
  ['경쟁사1', L1],
  ['경쟁사2', L2],
];

export function renameLegacyText(s) {
  return RENAMES.reduce((acc, [from, to]) => acc.split(from).join(to), s);
}

/** Applies renameLegacyText to every string inside a payload. */
export function renameLegacyGroups(value) {
  if (typeof value === 'string') return renameLegacyText(value);
  if (Array.isArray(value)) return value.map(renameLegacyGroups);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameLegacyGroups(v)]));
  }
  return value;
}

// ── entry point ─────────────────────────────────────────────────────────────
/** Applies all patent-row transforms. Returns rows plus a report for the console. */
export function transformPatentRows(rows, { ftoCount, categoryCounts }) {
  const { rows: kept, droppedIds } = dropInternalProcedure(rows, { ftoCount, categoryCounts });
  const tabsRow = kept.find((r) => r.section === 'competitor' && r.payload.type === 'tabs');
  if (!tabsRow) throw new Error('transformPatentRows: competitor tabs row not found');
  const { payload, summary } = regroupCompetitorTabs(tabsRow.payload, { ftoCount });

  const out = kept.map((r) => {
    if (r === tabsRow) return { ...r, payload: renameLegacyGroups(payload) };
    if (r.section !== 'competitor' && r.section !== 'triz') return r;
    return { ...r, payload: renameLegacyGroups(r.payload) };
  });

  const overview = out.find((r) => r.section === 'competitor');
  if (overview?.payload.type !== 'heading') throw new Error('transformPatentRows: competitor must start with a heading');
  overview.payload = {
    ...overview.payload,
    desc:
      `FTO 검토 ${ftoCount}건 기준 · DB 내 경쟁사 출원 ${summary.total}건을 KIPRIS 감시 그룹으로 재분류 — ` +
      `${joinCounts(new Map(summary.counts))} · 공백 분석은 이전 분류(${L1} ${summary.legacyCounts[0]}건 · ` +
      `${L2} ${summary.legacyCounts[1]}건) 기준`,
  };
  const leftover = out.filter((r) => /경쟁사[12]/.test(JSON.stringify(r.payload))).map((r) => r.id);
  if (leftover.length) throw new Error(`transformPatentRows: 경쟁사1/2 still present in ${leftover.join(', ')}`);
  return { rows: out, droppedIds, summary };
}
