-- Mascote da ofensiva: dados para o nível cair 1 degrau a cada dia sem estudar.
-- last_day: último dia estudado; last_run: dias seguidos que terminavam nele;
-- last_week: quantos dos 7 dias até ele foram estudados.
create or replace function public.streak_of(uid uuid)
returns json language sql stable security definer set search_path = public as $$
  with d as (select day from public.study_days where user_id = uid and day <= public.today_br()),
  runs as (select day, day - (row_number() over (order by day))::int as grp from d),
  islands as (select min(day) as first_day, max(day) as last_day, count(*)::int as len from runs group by grp),
  last as (select max(day) as day from d)
  select json_build_object(
    'current', coalesce((select len from islands where last_day >= public.today_br() - 1 order by last_day desc limit 1), 0),
    'best', coalesce((select max(len) from islands), 0),
    'today', exists (select 1 from d where day = public.today_br()),
    'week', (select json_agg(json_build_object('day', g::date, 'done', exists (select 1 from d where day = g::date)) order by g)
             from generate_series(public.today_br() - 6, public.today_br(), interval '1 day') g),
    'last_day', (select day from last),
    'last_run', coalesce((select len from islands where last_day = (select day from last)), 0),
    'last_week', (select count(*)::int from d where day between (select day from last) - 6 and (select day from last))
  )
$$;
revoke all on function public.streak_of(uuid) from public, anon, authenticated;
grant execute on function public.streak_of(uuid) to service_role;
