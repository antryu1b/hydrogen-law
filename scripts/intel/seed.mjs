#!/usr/bin/env node
// Upsert the JSON seed files produced by extract.mjs into Supabase via PostgREST.
// Run AFTER docs/intel-schema.sql has been applied in the Supabase SQL Editor.
//
// Usage:
//   node scripts/intel/seed.mjs [seedDir]        (default: scripts/intel/out)
//
// Credentials are read from apps/web/.env.local (NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY) unless already set in the environment. Values are
// never printed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const seedDir = path.resolve(process.argv[2] || path.join(here, 'out'));

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadEnvFile(path.join(repoRoot, 'apps/web/.env.local'));

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (apps/web/.env.local)');
  process.exit(1);
}

const CONFLICT_COL = { intel_news: 'url', intel_competitors: 'id', intel_patents: 'id' };
const CHUNK = 200;

async function upsert(table, rows) {
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: now }));
    const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${CONFLICT_COL[table]}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      throw new Error(`${table} chunk ${i / CHUNK}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
  }
}

let failed = false;
for (const file of ['news.json', 'competitors.json', 'patents.json']) {
  const p = path.join(seedDir, file);
  if (!fs.existsSync(p)) {
    console.warn(`skip ${file} (not found in ${seedDir}) — run extract.mjs first`);
    continue;
  }
  const { table, rows } = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!CONFLICT_COL[table] || !Array.isArray(rows)) {
    console.error(`${file}: unexpected table/rows`);
    failed = true;
    continue;
  }
  try {
    await upsert(table, rows);
    console.log(`${table}: upserted ${rows.length} rows`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
