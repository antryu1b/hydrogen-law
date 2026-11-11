#!/usr/bin/env node
// Unit tests for the extract post-processing — run with: node --test scripts/intel/extract.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCompetitorTabs } from './merge-tabs.mjs';
import {
  dropInternalProcedure,
  neutralFtoDesc,
  regroupCompetitorTabs,
  renameLegacyText,
  transformPatentRows,
  UNMAPPED_GROUP,
} from './patent-rows.mjs';

function tabsRow(tabs = []) {
  return { id: 't', sort: 0, payload: { type: 'tabs', tabs: [...tabs] } };
}
function headingRow(title) {
  return { id: `h-${title}`, sort: 0, payload: { type: 'heading', title, desc: '' } };
}
function contentRow(type = 'card') {
  return { id: `c-${type}`, sort: 0, payload: { type } };
}

const PREFIXES = ['개별 기업 상세 — 연도별', '당사(HMC) 비교 · 결과', '글로벌 리포트 · 벤치마크'];
const LABELS = ['개별 기업 상세', '당사 결과·개선항목', '글로벌 리포트'];

function goodRows() {
  return [
    tabsRow([{ label: 'PEM', blocks: [] }]),
    headingRow(PREFIXES[0]),
    contentRow('details'),
    headingRow(PREFIXES[1]),
    contentRow('card'),
    headingRow(PREFIXES[2]),
    contentRow('card'),
  ];
}

test('no-tabs-row: returns unchanged', () => {
  const rows = [headingRow('some heading')];
  assert.deepEqual(mergeCompetitorTabs(rows), rows);
});

test('merges 3 groups into the tabs row and strips trailing rows', () => {
  const rows = goodRows();
  const result = mergeCompetitorTabs(rows);
  assert.equal(result.length, 1); // only the tabs row remains
  const tabs = result[0].payload.tabs;
  assert.equal(tabs.length, 4); // 1 pre-existing + 3 merged  assert.equal(tabs[0].divider, undefined); // pre-existing tabs are untouched
  for (let i = 0; i < 3; i++) {
    assert.equal(tabs[1 + i].label, LABELS[i]);
    assert.equal(tabs[1 + i].blocks[0].title, PREFIXES[i]);
    assert.equal(tabs[1 + i].divider, i === 0 ? true : undefined); // only the first merged tab starts the new group
  }
});

test('each group includes its heading and subsequent content blocks', () => {
  const rows = goodRows();
  const result = mergeCompetitorTabs(rows);
  const second = result[0].payload.tabs[1]; // 개별 기업 상세
  assert.equal(second.blocks.length, 2); // heading + details
  assert.equal(second.blocks[1].type, 'details');
});

test('throws on pre-heading content blocks', () => {
  const rows = [tabsRow(), contentRow('card'), headingRow(PREFIXES[0]), headingRow(PREFIXES[1]), headingRow(PREFIXES[2])];
  assert.throws(
    () => mergeCompetitorTabs(rows),
    /before the first heading would be lost/,
  );
});

test('throws when fewer than 3 groups', () => {
  const rows = [tabsRow(), headingRow(PREFIXES[0]), headingRow(PREFIXES[1])];
  assert.throws(
    () => mergeCompetitorTabs(rows),
    /expected exactly 3 heading groups, found 2/,
  );
});

test('throws when more than 3 groups', () => {
  const rows = [tabsRow(), headingRow(PREFIXES[0]), headingRow(PREFIXES[1]), headingRow(PREFIXES[2]), headingRow('extra heading')];
  assert.throws(
    () => mergeCompetitorTabs(rows),
    /expected exactly 3 heading groups, found 4/,
  );
});

test('throws when group heading does not match expected prefix', () => {
  const rows = [tabsRow(), headingRow(PREFIXES[0]), headingRow('잘못된 제목'), headingRow(PREFIXES[2])];
  assert.throws(
    () => mergeCompetitorTabs(rows),
    /does not start with expected prefix "당사\(HMC\) 비교"/,
  );
});

test('throws for wrong order of otherwise correct headings', () => {
  const rows = [tabsRow(), headingRow(PREFIXES[2]), headingRow(PREFIXES[0]), headingRow(PREFIXES[1])];
  assert.throws(
    () => mergeCompetitorTabs(rows),
    /group 1 heading.*does not start with expected prefix "개별 기업 상세"/,
  );
});


// ── patent-rows.mjs ─────────────────────────────────────────────────────────
const HEADERS = ['No', '그룹', '출원번호', '발명의 명칭', '출원인', '분류', '출원일', '등록일', '판단'];
function prow(no, label, appNo, applicant, cat, filed, verdict) {
  return [no, label, appNo, 'title', applicant, cat, filed, '2025.01.01', verdict].map((t) => ({ t: String(t) }));
}
function legacyTabs() {
  return {
    type: 'tabs',
    tabs: [
      {
        label: '경쟁사1 — 도요타·혼다·치요다 계열 (3건)',
        blocks: [
          { type: 'stats', items: [] },
          { type: 'heading', title: '전체 목록 (3건)' },
          {
            type: 'table',
            headers: HEADERS,
            rows: [
              prow(1, 'Honda', 'H1', 'HONDA MOTOR CO., LTD.', '기액분리기 시스템', '2011.01.17', '필요'),
              prow(2, 'Toyota그룹', 'T1', 'TOYOTA JIDOSHA KABUSHIKI KAISHA | AISIN CORPORATION', '기액분리기', '2015.11.09', '불필요'),
              prow(3, 'Toyota그룹', 'A1', 'AISIN CORPORATION', '기액분리기', '2019.01.03', '필요'),
            ],
          },
          { type: 'text', tone: 'info', text: '참고 — 최근 건(No.1·3) 확인' },
          { type: 'card', blocks: [{ type: 'line', text: '당사 No.2·4 특허 — 경쟁사1 공백' }] },
        ],
      },
      {
        label: '경쟁사2 — 그 외 수전해 전문기업 (2건)',
        blocks: [
          { type: 'heading', title: '경쟁사2 — 그 외' },
          { type: 'stats', items: [] },
          {
            type: 'table',
            headers: ['No', '기업', ...HEADERS.slice(2)],
            rows: [
              prow(1, 'Siemens', 'S1', 'SIEMENS ENERGY GLOBAL GMBH & CO. KG', '시스템', '2018.09.21', '필요'),
              prow(2, 'Ohmium', 'O1', 'Ohmium International, Inc.', '시스템', '2010.05.01', '불필요'),
            ],
          },
          { type: 'text', tone: 'info', text: '종합 제언 — 경쟁사2 분석' },
        ],
      },
    ],
  };
}

test('neutralFtoDesc strips team mentions and adds the FTO basis label', () => {
  assert.equal(
    neutralFtoDesc('사업화IP팀 주관 · 기액분리기/시스템 관련 KR·US 특허 1차 검토 결과 (수전해스택개발팀·수소인프라개발팀)', 400),
    'FTO 검토 400건 기준 · 기액분리기/시스템 관련 KR·US 특허 1차 검토 결과',
  );
});

function ftoReviewRows() {
  const p = (i, payload) => ({ id: `fto-review:${String(i).padStart(3, '0')}`, section: 'fto-review', sort: i, payload });
  return [
    p(0, { type: 'heading', title: '특허 검토', desc: '사업화IP팀 주관 · 1차 검토 (수전해스택개발팀)' }),
    p(1, { type: 'text', text: 'overview' }),
    p(2, { type: 'stats', items: [] }),
    p(3, { type: 'heading', title: '① 프로세스' }),
    p(4, { type: 'table', headers: [], rows: [] }),
    p(5, { type: 'heading', title: '② 체크리스트' }),
    p(6, { type: 'heading', title: '③ 검색식' }),
    p(7, { type: 'heading', title: '④ V&V' }),
    p(8, { type: 'stats', items: [] }),
    { id: 'own:000', section: 'own', sort: 100, payload: { type: 'heading', title: 'own' } },
  ];
}

test('dropInternalProcedure keeps the overview and drops ①–④ only', () => {
  const { rows, droppedIds } = dropInternalProcedure(ftoReviewRows(), { ftoCount: 400 });
  assert.deepEqual(rows.map((r) => r.id), ['fto-review:000', 'fto-review:001', 'fto-review:002', 'own:000']);
  assert.equal(droppedIds.length, 6);
  assert.equal(rows[0].payload.desc, 'FTO 검토 400건 기준 · 1차 검토');
});

test('dropInternalProcedure throws when the procedure blocks move', () => {
  const rows = ftoReviewRows().filter((r) => r.id !== 'fto-review:002');
  assert.throws(() => dropInternalProcedure(rows, { ftoCount: 400 }), /start at fto-review:003/);
});

test('regroupCompetitorTabs regroups rows on the KIPRIS alias map and recomputes counts', () => {
  const { payload, summary } = regroupCompetitorTabs(legacyTabs(), { ftoCount: 400 });
  assert.deepEqual(summary.counts, [['자동차 업체', 2], ['에너지·플랜트(EPC)', 1], [UNMAPPED_GROUP, 2]]);
  assert.deepEqual(summary.legacyCounts, [3, 2]);
  assert.deepEqual(summary.unmappedApplicants, ['Ohmium International, Inc.', 'AISIN CORPORATION']);
  const labels = payload.tabs.map((t) => t.label);
  assert.deepEqual(labels, [
    '자동차 업체 (2건)',
    '에너지·플랜트(EPC) (1건)',
    `${UNMAPPED_GROUP} (2건)`,
    // Only 2 of 3 legacy group-1 rows landed in one group (< 90%), so its analysis gets its own tab.
    '공백 분석 — 자동차 계열 (이전 분류)',
    '공백 분석 — 수전해 전문·에너지 기업 (이전 분류)',
  ]);
  const auto = payload.tabs[0].blocks;
  const stats = auto[0].items;
  assert.equal(stats[0].value, '2건');
  assert.equal(stats[1].value, '1건 (50.0%)');
  assert.equal(stats[1].desc, '기액분리기 1건 · 시스템 1건 (중복 포함)');
  const table = auto.find((b) => b.type === 'table');
  // Renumbered; joint Toyota|Aisin filing maps to Toyota, Aisin-only does not.
  assert.deepEqual(table.rows.map((r) => [r[0].t, r[1].t, r[2].t]), [['1', 'Honda', 'H1'], ['2', 'Toyota', 'T1']]);
  const unmapped = payload.tabs[2].blocks.find((b) => b.type === 'table');
  assert.equal(unmapped.headers[1], '원 분류');
  assert.deepEqual(unmapped.rows.map((r) => r[2].t), ['O1', 'A1']); // filing date ascending
});

test('regroupCompetitorTabs rewrites old No. references in 참고 notes to application numbers', () => {
  const { payload } = regroupCompetitorTabs(legacyTabs(), { ftoCount: 400 });
  const texts = JSON.stringify(payload);
  assert.match(texts, /최근 건\(H1·A1\)/);
  assert.match(texts, /당사 No\.2·4 특허/); // own-patent references in cards are untouched
  assert.match(texts, /이전 분류\(자동차 계열 3건\) 기준/);
});

test('regroupCompetitorTabs attaches legacy analysis to the tab holding >= 90% of its rows', () => {
  const tabs = legacyTabs();
  const t1 = tabs.tabs[0].blocks;
  t1[2].rows.pop(); // drop the Aisin-only row → both remaining rows map to 자동차 업체
  t1[3].text = '참고 — 최근 건(No.1·2) 확인';
  const { payload } = regroupCompetitorTabs(tabs, { ftoCount: 400 });
  assert.equal(payload.tabs.length, 4);
  const auto = payload.tabs[0];
  assert.equal(auto.label, '자동차 업체 (2건)');
  const after = auto.blocks.slice(auto.blocks.findIndex((b) => b.type === 'table') + 1);
  assert.deepEqual(after.map((b) => b.type), ['text', 'text', 'card']);
  assert.match(after[0].text, /이전 분류\(자동차 계열 2건\) 기준.*자동차 업체 2건/);
  assert.equal(after[1].text, '참고 — 최근 건(H1·T1) 확인');
});

test('regroupCompetitorTabs throws on unexpected table columns', () => {
  const tabs = legacyTabs();
  tabs.tabs[1].blocks[2].headers[4] = '권리자';
  assert.throws(() => regroupCompetitorTabs(tabs, { ftoCount: 400 }), /column 4 is "권리자"/);
});

test('renameLegacyText renames specific phrasings before bare labels', () => {
  assert.equal(renameLegacyText('경쟁사1(도요타·혼다·치요다 계열) 52건'), '자동차 계열(도요타·혼다) 52건');
  assert.equal(renameLegacyText('자동차 계열(경쟁사1)뿐 아니라'), '자동차 계열뿐 아니라');
  assert.equal(renameLegacyText('경쟁사1①+경쟁사2①'), '자동차 계열①+수전해 전문·에너지 기업①');
  assert.equal(renameLegacyText('경쟁사2 (전문 수전해기업)'), '수전해 전문·에너지 기업');
});

test('transformPatentRows leaves no 경쟁사1/2 mention and rewrites the overview', () => {
  const rows = [
    ...ftoReviewRows(),
    { id: 'competitor:000', section: 'competitor', sort: 200, payload: { type: 'heading', title: '경쟁사 특허', desc: 'old' } },
    { id: 'competitor:001', section: 'competitor', sort: 210, payload: legacyTabs() },
    { id: 'triz:000', section: 'triz', sort: 300, payload: { type: 'table', headers: ['당사', '경쟁사1', '경쟁사2'], rows: [] } },
  ];
  const { rows: out } = transformPatentRows(rows, { ftoCount: 400 });
  assert.doesNotMatch(JSON.stringify(out), /경쟁사[12]/);
  const overview = out.find((r) => r.id === 'competitor:000').payload.desc;
  assert.match(overview, /^FTO 검토 400건 기준 · DB 내 경쟁사 출원 5건을 KIPRIS 감시 그룹으로 재분류/);
  assert.deepEqual(out.find((r) => r.id === 'triz:000').payload.headers, ['당사', '자동차 계열', '수전해 전문·에너지 기업']);
});
