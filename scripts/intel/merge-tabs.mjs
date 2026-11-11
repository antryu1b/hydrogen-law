/**
 * mergeCompetitorTabs — post-processing step for extract.mjs.
 *
 * Folds the content blocks that follow the compare:002 tabs row into three new
 * tabs appended to that row. Groups are separated by `heading` blocks; each
 * heading stays inside its tab (it carries a `desc` the tab label omits).
 *
 * Throws loudly if the source structure does not match exactly what is expected,
 * preventing silent data loss.
 */

/** Title-prefix → tab label mapping. Order matches the expected source order. */
const LABEL_MAP = [
  { prefix: '개별 기업 상세', label: '개별 기업 상세' },
  { prefix: '당사(HMC) 비교', label: '당사 결과·개선항목' },
  { prefix: '글로벌 리포트', label: '글로벌 리포트' },
];

export function mergeCompetitorTabs(rows) {
  const tabsIdx = rows.findIndex((r) => r.payload.type === 'tabs');
  if (tabsIdx === -1) return rows; // no tabs row — pass through unchanged

  const afterTabs = rows.slice(tabsIdx + 1);

  // Detect pre-heading blocks that the old code silently dropped.
  const firstHeadingIdx = afterTabs.findIndex((r) => r.payload.type === 'heading');
  if (firstHeadingIdx > 0) {
    throw new Error(
      `mergeCompetitorTabs: ${firstHeadingIdx} block(s) before the first heading would be lost. ` +
        `First dropped block type: "${afterTabs[0].payload.type}". ` +
        'Fix the source or update this transform.',
    );
  }

  // Split afterTabs into heading-delimited groups.
  const groups = [];
  let current = null;
  for (const row of afterTabs) {
    if (row.payload.type === 'heading') {
      current = { blocks: [row.payload] };
      groups.push(current);
    } else if (current) {
      current.blocks.push(row.payload);
    }
  }

  if (groups.length !== LABEL_MAP.length) {
    throw new Error(
      `mergeCompetitorTabs: expected exactly ${LABEL_MAP.length} heading groups, found ${groups.length}. ` +
        `Headings: ${groups.map((g) => JSON.stringify(g.blocks[0]?.title ?? '')).join(', ')}`,
    );
  }

  for (let i = 0; i < LABEL_MAP.length; i++) {
    const title = groups[i].blocks[0]?.title ?? '';
    const { prefix, label } = LABEL_MAP[i];
    if (!title.startsWith(prefix)) {
      throw new Error(
        `mergeCompetitorTabs: group ${i + 1} heading "${title}" does not start with ` +
          `expected prefix "${prefix}" (expected label "${label}"). ` +
          'Check source order or update LABEL_MAP.',
      );
    }
  }

  const tabsRow = rows[tabsIdx];
  for (let i = 0; i < LABEL_MAP.length; i++) {
    // divider marks where the merged tabs start, so the UI can separate them from the originals.
    tabsRow.payload.tabs.push({ label: LABEL_MAP[i].label, blocks: groups[i].blocks, ...(i === 0 ? { divider: true } : {}) });
  }
  return rows.slice(0, tabsIdx + 1);
}
