#!/usr/bin/env node
// Unit tests for mergeCompetitorTabs — run with: node scripts/intel/extract.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCompetitorTabs } from './merge-tabs.mjs';

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
  assert.equal(tabs.length, 4); // 1 pre-existing + 3 merged
  for (let i = 0; i < 3; i++) {
    assert.equal(tabs[1 + i].label, LABELS[i]);
    assert.equal(tabs[1 + i].blocks[0].title, PREFIXES[i]);
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

console.log('All tests passed.');
