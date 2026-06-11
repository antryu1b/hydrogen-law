#!/usr/bin/env node
/**
 * 산업융합 촉진법 시행령·시행규칙 별표·서식 스냅샷 생성기
 *
 * 국가법령정보센터 DRF API(law.go.kr)에서 별표·서식 목록을 받아
 * src/data/industrial-convergence-forms.json 으로 저장한다.
 *
 * DRF API 가 간헐적으로 빈 응답을 주므로 법령별로 최대 N회 재시도한다.
 * 데이터를 한 건도 못 받으면 기존 스냅샷을 보존(덮어쓰지 않음)한다.
 *
 * 실행: node scripts/fetch-industrial-convergence-forms.mjs
 */

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'src', 'data', 'industrial-convergence-forms.json');

const OC = 'Hydrogen';
const LAW_BASE = 'https://www.law.go.kr';
const MAX_RETRIES = 6;

/** @type {{ key: string, lawName: string, mst: string }[]} */
const LAWS = [
  { key: 'enforcementDecree', lawName: '산업융합 촉진법 시행령', mst: '286329' },
  { key: 'enforcementRule', lawName: '산업융합 촉진법 시행규칙', mst: '278729' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decode(raw) {
  if (raw == null) return '';
  // CDATA 제거 후 트림
  return raw.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1]) : '';
}

/** XML 문자열에서 별표·서식 엔트리 배열을 추출 */
function parseForms(xml) {
  const forms = [];
  const unitRe = /<별표단위[^>]*>([\s\S]*?)<\/별표단위>/g;
  let m;
  while ((m = unitRe.exec(xml)) !== null) {
    const block = m[1];
    const link = pick(block, '별표서식파일링크');
    if (!link) continue; // HWP 다운로드 링크 없는 항목은 제외
    forms.push({
      number: pick(block, '별표번호'),
      branchNumber: pick(block, '별표가지번호'),
      kind: pick(block, '별표구분'), // 별표 / 서식
      title: pick(block, '별표제목'),
      hwpFileName: pick(block, '별표HWP파일명'),
      downloadUrl: LAW_BASE + link,
    });
  }
  return forms;
}

async function fetchLawForms(law) {
  const url = `${LAW_BASE}/DRF/lawService.do?OC=${OC}&target=law&MST=${law.mst}&type=XML`;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      const xml = await res.text();
      if (xml.length > 5000 && xml.includes('별표단위')) {
        const forms = parseForms(xml);
        if (forms.length > 0) {
          console.log(`[OK] ${law.lawName} (MST ${law.mst}) → ${forms.length} 건 (시도 ${attempt})`);
          return forms;
        }
      }
      console.log(`[retry ${attempt}/${MAX_RETRIES}] ${law.lawName}: 빈/불완전 응답 (size=${xml.length})`);
    } catch (err) {
      console.log(`[retry ${attempt}/${MAX_RETRIES}] ${law.lawName}: ${err.message}`);
    }
    if (attempt < MAX_RETRIES) await sleep(2000);
  }
  return [];
}

async function main() {
  const groups = [];
  for (const law of LAWS) {
    const forms = await fetchLawForms(law);
    groups.push({ key: law.key, lawName: law.lawName, mst: law.mst, forms });
  }

  const total = groups.reduce((acc, g) => acc + g.forms.length, 0);

  if (total === 0) {
    console.error('[FAIL] 모든 법령에서 데이터를 받지 못했습니다.');
    if (existsSync(OUT_PATH)) {
      console.error('       기존 스냅샷을 보존합니다 (덮어쓰지 않음).');
      process.exit(0);
    }
    process.exit(1);
  }

  const snapshot = {
    source: '국가법령정보센터 (law.go.kr)',
    fetchedAt: new Date().toISOString(),
    laws: groups,
  };

  // 기존 스냅샷보다 적게 받았으면(부분 실패) 보존
  if (existsSync(OUT_PATH)) {
    try {
      const prev = JSON.parse(readFileSync(OUT_PATH, 'utf-8'));
      const prevTotal = (prev.laws || []).reduce((a, g) => a + (g.forms || []).length, 0);
      if (total < prevTotal) {
        console.error(
          `[WARN] 새 데이터(${total})가 기존(${prevTotal})보다 적습니다. 기존 스냅샷 보존.`,
        );
        process.exit(0);
      }
    } catch {
      /* 기존 파일 파싱 실패 시 그냥 새로 씀 */
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
  console.log(`[WROTE] ${OUT_PATH}`);
  console.log(`        총 ${total} 건 (` + groups.map((g) => `${g.lawName} ${g.forms.length}`).join(' / ') + ')');
}

main();
