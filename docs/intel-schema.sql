-- /intel section storage (수전해 동향 · 경쟁사 비교 · 특허 분석)
-- Paste into the Supabase SQL Editor once, then run:
--   node scripts/intel/extract.mjs <source.html>
--   node scripts/intel/seed.mjs
--
-- RLS is enabled with NO policies: only the service-role key (server side)
-- can read or write. The anon key gets nothing.

-- News articles. One row per URL (dedupe key). Seed rows carry the original
-- category/company; RSS rows are added daily by /api/cron/intel-news.
create table if not exists public.intel_news (
  url          text primary key,
  title        text not null,
  published_at date,
  category     text,
  company      text,
  source       text not null default 'seed',          -- 'seed' | 'rss' | 'upload'
  payload      jsonb not null default '{}'::jsonb,     -- e.g. { variants: [...], publisher }
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists intel_news_published_at_idx on public.intel_news (published_at desc nulls last);

-- Competitor comparison content blocks (tables, cards, per-company details).
create table if not exists public.intel_competitors (
  id          text primary key,                        -- e.g. 'compare:002'
  section     text not null,
  sort        integer not null default 0,
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
);
create index if not exists intel_competitors_sort_idx on public.intel_competitors (sort);

-- Patent analysis content blocks + FTO review records (section = 'fto').
create table if not exists public.intel_patents (
  id          text primary key,                        -- e.g. 'triz:004', 'fto:0001'
  section     text not null,
  sort        integer not null default 0,
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
);
create index if not exists intel_patents_section_sort_idx on public.intel_patents (section, sort);

alter table public.intel_news        enable row level security;
alter table public.intel_competitors enable row level security;
alter table public.intel_patents     enable row level security;
