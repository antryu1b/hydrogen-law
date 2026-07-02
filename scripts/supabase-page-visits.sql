-- Visitor counter storage for the site header (today + cumulative).
-- Run once in the Supabase SQL editor.

create table if not exists page_visits (
  day   date   primary key,
  views bigint not null default 0
);

-- Atomically bump today's row and return { today, total }.
create or replace function increment_visit()
returns table(today bigint, total bigint)
language plpgsql
as $$
begin
  insert into page_visits (day, views) values (current_date, 1)
  on conflict (day) do update set views = page_visits.views + 1;

  return query
    select
      (select views from page_visits where day = current_date)         as today,
      (select coalesce(sum(views), 0)::bigint from page_visits)        as total;
end;
$$;
