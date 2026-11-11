#!/usr/bin/env node
// Extract the statically embedded 수전해 인텔리전스 content from the legacy
// single-file HTML dashboard into JSON seed files for the /intel section.
//
// Usage:
//   node scripts/intel/extract.mjs [path/to/source.html] [outDir]
//
// Defaults: source = $INTEL_SOURCE_HTML, outDir = scripts/intel/out (gitignored —
// the output contains internal material and the repo is public; never commit it).
//
// Only content embedded in the HTML is migrated. Anything the page loaded at
// runtime from its internal KG API (knowledge graph panel, issue tracker, …)
// is intentionally skipped.
//
// Output shape (same shape the /intel/admin upload accepts):
//   { "table": "intel_competitors" | "intel_patents" | "intel_news",
//     "generated_at": ISO string, "source": file name, "rows": [...] }

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mergeCompetitorTabs } from './merge-tabs.mjs';
import { transformPatentRows } from './patent-rows.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
// jsdom is already a devDependency of apps/web — reuse it instead of adding deps.
const requireFromWeb = createRequire(path.join(repoRoot, 'apps/web/package.json'));
const { JSDOM } = requireFromWeb('jsdom');

const src = process.argv[2] || process.env.INTEL_SOURCE_HTML;
const outDir = path.resolve(process.argv[3] || path.join(here, 'out'));
if (!src) {
  console.error('usage: node scripts/intel/extract.mjs <source.html> [outDir]  (or set INTEL_SOURCE_HTML)');
  process.exit(1);
}

const html = fs.readFileSync(src, 'utf8');
const doc = new JSDOM(html).window.document;

// ── JS constant extraction ──────────────────────────────────────────────────
// Scan the literal after `const NAME =` with bracket matching that respects
// strings/template literals, then evaluate it in an empty sandbox.
function readConst(name) {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*`).exec(html);
  if (!m) throw new Error(`constant ${name} not found`);
  let i = m.index + m[0].length;
  const start = i;
  let depth = 0;
  let quote = null;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === '\\') { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '[' || ch === '{' || ch === '(') depth++;
    else if (ch === ']' || ch === '}' || ch === ')') {
      depth--;
      if (depth === 0) { i++; break; }
    } else if (depth === 0 && (ch === ';' || ch === '\n')) break;
  }
  return vm.runInNewContext(`(${html.slice(start, i)})`, Object.create(null), { timeout: 2000 });
}

// ── DOM → text helpers ──────────────────────────────────────────────────────
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'CANVAS', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'NOSCRIPT']);
const INLINE_TAGS = new Set(['SPAN', 'B', 'STRONG', 'EM', 'I', 'U', 'A', 'BR', 'SUP', 'SUB', 'SMALL', 'CODE', 'MARK', 'SVG']);

function textOf(el, { exclude = [] } = {}) {
  let out = '';
  const visit = (n) => {
    if (n.nodeType === 3) { out += n.textContent; return; }
    if (n.nodeType !== 1) return;
    if (n !== el && SKIP_TAGS.has(n.tagName.toUpperCase())) return;
    if (exclude.some((c) => n.classList.contains(c))) return;
    if (n.tagName === 'BR') { out += '\n'; return; }
    n.childNodes.forEach(visit);
  };
  visit(el);
  return out
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l, idx, arr) => l || (idx > 0 && arr[idx - 1]))
    .join('\n')
    .trim();
}

function linksOf(el) {
  return [...el.querySelectorAll('a[href]')]
    .map((a) => ({ label: textOf(a) || a.getAttribute('href'), url: a.getAttribute('href') }))
    .filter((l) => /^https?:\/\//i.test(l.url));
}

function withLinks(block, el) {
  const links = linksOf(el);
  if (links.length) block.links = links;
  return block;
}

function isInlineOnly(el) {
  return [...el.children].every((c) => INLINE_TAGS.has(c.tagName.toUpperCase()) && (c.tagName === 'SVG' || c.tagName === 'svg' || isInlineOnly(c)));
}

const hasClass = (el, re) => [...el.classList].some((c) => re.test(c));

// ── block builders ──────────────────────────────────────────────────────────
function parseTable(table) {
  const headRow = table.querySelector('thead tr') || [...table.querySelectorAll('tr')].find((tr) => tr.querySelector('th'));
  const headers = headRow ? [...headRow.children].map((th) => textOf(th)) : [];
  const bodyRows = [...table.querySelectorAll('tr')].filter((tr) => tr !== headRow && tr.querySelector('td'));
  const rows = bodyRows.map((tr) =>
    [...tr.children].map((td) => {
      const cell = { t: textOf(td, { exclude: ['spec-best-tag'] }) };
      if (td.classList.contains('spec-best')) {
        const tag = td.querySelector('.spec-best-tag');
        cell.best = tag ? textOf(tag) : '★';
      }
      const style = td.getAttribute('style') || '';
      if (/background:hsl\(var\(--brass\)/.test(style)) cell.hl = true;
      const span = Number(td.getAttribute('colspan') || 1);
      if (span > 1) cell.span = span;
      const links = linksOf(td);
      if (links.length) cell.links = links;
      return cell;
    }),
  );
  const hlCol = headRow ? [...headRow.children].findIndex((th) => /brass/.test(th.getAttribute('style') || '')) : -1;
  const block = { type: 'table', headers, rows };
  if (hlCol >= 0) block.hlCol = hlCol;
  return block;
}

function parseStatsGrid(el) {
  const items = [...el.children].map((c) => ({
    label: textOf(c.querySelector('.card-title, .report-stat-label') || c),
    value: textOf(c.querySelector('.card-value, .report-stat-val') || c),
    desc: c.querySelector('.card-desc') ? textOf(c.querySelector('.card-desc')) : undefined,
  }));
  return { type: 'stats', items };
}

function parseDetails(card) {
  const header = card.querySelector('.issue-header');
  const badges = header ? [...header.querySelectorAll('.badge')].map(textOf) : [];
  const title = header ? textOf(header.querySelector('.issue-title') || header) : '';
  const body = card.querySelector('.issue-body');
  const blocks = body ? walkChildren(body) : [];
  return { type: 'details', badges, title, blocks };
}

function lineBlock(el) {
  const badges = [...el.querySelectorAll('.badge')].map(textOf).filter(Boolean);
  const text = textOf(el, { exclude: ['badge'] });
  if (!text && !badges.length) return [];
  const block = { type: 'line', text };
  if (badges.length) block.badges = badges;
  if (el.classList.contains('rrr-tag') || el.classList.contains('card-title') || el.classList.contains('news-company-title')) block.strong = true;
  return [withLinks(block, el)];
}

// Special-cased dynamic charts whose data lives in JS constants.
function trizHeatmap(table) {
  const rows = readConst('TRIZ_HEATMAP_ROWS');
  const headRow = table.querySelector('thead tr');
  const headers = headRow ? [...headRow.children].map((th) => textOf(th)) : ['기술영역', '당사', '경쟁사1', '경쟁사2'];
  return {
    type: 'table',
    headers,
    rows: rows.map((r) => [{ t: r.area }, ...[r.own, r.comp1, r.comp2].map((v) => ({ t: String(v), ...(v === 0 ? { zero: true } : {}) }))]),
  };
}

function trizTimeline() {
  const years = readConst('TRIZ_TIMELINE_YEARS');
  const own = readConst('TRIZ_TIMELINE_OWN');
  const c1 = readConst('TRIZ_TIMELINE_COMP1');
  const c2 = readConst('TRIZ_TIMELINE_COMP2');
  return {
    type: 'table',
    headers: ['출원연도', '당사', '경쟁사1', '경쟁사2'],
    rows: years.map((y) => [{ t: y }, { t: String(own[y] || 0) }, { t: String(c1[y] || 0) }, { t: String(c2[y] || 0) }]),
  };
}

function walk(el) {
  const tag = el.tagName.toUpperCase();
  if (SKIP_TAGS.has(tag) || tag === 'HR') return [];
  if (el.id === 'trizHeatmapTable') return [trizHeatmap(el)];
  if (el.id === 'trizTimelineChart') return [trizTimeline()];
  if (el.classList.contains('sec-header')) {
    const title = el.querySelector('.sec-title');
    const desc = el.querySelector('.sec-desc');
    return [{ type: 'heading', title: title ? textOf(title) : textOf(el), ...(desc ? { desc: textOf(desc) } : {}) }];
  }
  if (tag === 'TABLE') return [parseTable(el)];
  if (el.classList.contains('issue-card')) return [parseDetails(el)];
  if (el.classList.contains('report-stats')) return [parseStatsGrid(el)];
  if (hasClass(el, /^grid-\d$/) && el.children.length && [...el.children].every((c) => c.querySelector(':scope > .card-value'))) {
    return [parseStatsGrid(el)];
  }
  if (el.classList.contains('card') || el.classList.contains('report-card')) {
    return [{ type: 'card', blocks: walkChildren(el) }];
  }
  if (hasClass(el, /^info-box/)) return [withLinks({ type: 'text', tone: 'info', text: textOf(el) }, el)];
  if (tag === 'UL' || tag === 'OL') {
    return [{ type: 'list', items: [...el.querySelectorAll(':scope > li')].map((li) => textOf(li)) }];
  }
  if (el.classList.contains('issue-row')) {
    const label = el.querySelector(':scope > .issue-label');
    if (label) {
      const rest = [...el.children].filter((c) => c !== label).map((c) => textOf(c)).join(' ');
      return [withLinks({ type: 'kv', label: textOf(label), text: rest }, el)];
    }
    return lineBlock(el).map((b) => ({ ...b, strong: true }));
  }
  if (tag === 'P') {
    const text = textOf(el);
    return text ? [withLinks({ type: 'text', text }, el)] : [];
  }
  if (isInlineOnly(el)) return lineBlock(el);
  return walkChildren(el);
}

function walkChildren(el) {
  const out = [];
  const kids = [...el.children];
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i];
    if (kid.classList.contains('tab-bar')) {
      // A tab bar followed by sibling panels (#…Group1, #…Group2, …) → tabs block.
      const labels = [...kid.querySelectorAll('button')].map((b) => textOf(b));
      const tabs = [];
      let j = i + 1;
      while (j < kids.length && tabs.length < labels.length) {
        if (/Group\d+$/.test(kids[j].id)) tabs.push({ label: labels[tabs.length], blocks: walkChildren(kids[j]) });
        else if (kids[j].tagName !== 'HR') break;
        j++;
      }
      if (tabs.length) {
        out.push({ type: 'tabs', tabs });
        i = j - 1;
      }
      continue;
    }
    out.push(...walk(kid));
  }
  return out;
}

// ── sections → rows ─────────────────────────────────────────────────────────
let sortSeq = 0;
function sectionRows(sectionEl, key, { label } = {}) {
  const blocks = walkChildren(sectionEl);
  if (label) blocks.unshift({ type: 'heading', title: label });
  return blocks.map((payload, idx) => ({
    id: `${key}:${String(idx).padStart(3, '0')}`,
    section: key,
    sort: (sortSeq += 10),
    payload,
  }));
}

function mustGet(id) {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`section #${id} not found`);
  return el;
}

// Competitors tab: comparison section + the static report cards from the news tab.
sortSeq = 0;
const competitorRows = [
  ...sectionRows(mustGet('secCompare'), 'compare'),
  ...sectionRows(mustGet('reportPanel'), 'report', { label: '글로벌 리포트 · 벤치마크' }),
];

// Patents tab: four static sections + the FTO review records (PATENTS constant).
sortSeq = 0;
const patentRows = [
  ...sectionRows(mustGet('secPatent'), 'fto-review'),
  ...sectionRows(mustGet('secOwnPatent'), 'own'),
  ...sectionRows(mustGet('secCompPatent'), 'competitor'),
  ...sectionRows(mustGet('secPatentTriz'), 'triz'),
];
const PATENTS = readConst('PATENTS');
// Drop internal procedure blocks, regroup competitor tabs on the KIPRIS groups (see patent-rows.mjs).
const patentReport = transformPatentRows(patentRows.splice(0), { ftoCount: PATENTS.length });
patentRows.push(...patentReport.rows);
for (const { reviewer: _reviewer, ...p } of PATENTS) {
  // Reviewer holds an employee's name; never publish it.
  patentRows.push({
    id: `fto:${String(p.no).padStart(4, '0')}`,
    section: 'fto',
    sort: 100000 + Number(p.no),
    payload: { type: 'fto-record', ...p },
  });
}

// News: every .news-item in the news panel, deduped by URL.
const newsPanel = mustGet('newsPanel');
const newsByUrl = new Map();
for (const item of newsPanel.querySelectorAll('.news-item')) {
  const date = textOf(item.querySelector('.news-date') || item);
  const title = textOf(item.querySelector('.news-text') || item).replace(/\s*—\s*$/, '');
  const a = item.querySelector('a.news-link[href], a[href]');
  const href = a ? a.getAttribute('href') : '';
  const catBlock = item.closest('.news-cat-block');
  const category = catBlock ? textOf(catBlock.querySelector('.news-cat-title .badge') || catBlock) : null;
  const coBlock = item.closest('.news-company-block');
  const coTitle = coBlock ? coBlock.querySelector('.news-company-title') : null;
  const company = coTitle ? [...coTitle.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim() : null;
  // Items without a usable link get a stable synthetic key so reruns stay idempotent.
  const url = /^https?:\/\//i.test(href)
    ? href
    : `seed:${crypto.createHash('sha1').update(`${date}|${title}`).digest('hex').slice(0, 16)}`;
  const published_at = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const prev = newsByUrl.get(url);
  if (prev) {
    // The source often summarises the same article on several days. Keep one row
    // per URL (latest summary as the title) and retain the others as variants.
    const older = (published_at || '') > (prev.published_at || '')
      ? { date: prev.published_at, title: prev.title }
      : { date: published_at, title };
    if ((published_at || '') > (prev.published_at || '')) {
      Object.assign(prev, { title, published_at, category, company });
    }
    if (older.title !== prev.title && !prev.payload.variants.some((v) => v.title === older.title)) {
      prev.payload.variants.push(older);
    }
    continue;
  }
  newsByUrl.set(url, { url, title, published_at, category, company, source: 'seed', payload: { variants: [] } });
}
for (const row of newsByUrl.values()) {
  if (!row.payload.variants.length) delete row.payload.variants;
}
const newsRows = [...newsByUrl.values()];

// Keyword / company map used by the daily RSS cron (kept for reference).
const meta = { KG_NEWS_KW: readConst('KG_NEWS_KW'), KG_CO_MAP: readConst('KG_CO_MAP') };

// ── post-processing ──────────────────────────────────────────────────────────
// mergeCompetitorTabs is imported from ./merge-tabs.mjs.

// ── write ───────────────────────────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true });
const generated_at = new Date().toISOString();
const source = path.basename(src);
const write = (file, table, rows) => {
  fs.writeFileSync(path.join(outDir, file), JSON.stringify({ table, generated_at, source, rows }, null, 1));
  console.log(`${file}: ${rows.length} rows`);
};
write('competitors.json', 'intel_competitors', mergeCompetitorTabs(competitorRows));
write('patents.json', 'intel_patents', patentRows);
console.log(`  dropped rows: ${patentReport.droppedIds.join(', ')}`);
console.log(`  competitor groups: ${patentReport.summary.counts.map(([g, n]) => `${g} ${n}`).join(' · ')}`);
console.log(`  unmapped applicants: ${patentReport.summary.unmappedApplicants.join(' / ') || 'none'}`);
write('news.json', 'intel_news', newsRows);
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 1));
console.log(`→ ${outDir}`);
