-- ---------------------------------------------------------------- cursos e trilhas
-- Um curso (material do tipo "course") é uma sequência ordenada de outros materiais.
create table public.course_items (
  course_id uuid not null references public.materials (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  position int not null default 0,
  section text,
  primary key (course_id, material_id),
  check (course_id <> material_id)
);
create index on public.course_items (course_id, position);
alter table public.course_items enable row level security;

-- Quem vê o curso vê a lista de aulas; cada aula continua protegida pela própria regra do material.
create policy course_items_read on public.course_items for select using (public.can_view_material(course_id));
create policy course_items_write on public.course_items for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------- miniaturas das capas
-- Miniatura em covers/thumbs/<caminho da capa>.webp, com a mesma regra de leitura da capa.
drop policy if exists storage_covers_read on storage.objects;
create policy storage_covers_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'covers' and exists (
    select 1 from public.materials m
    where (m.cover_path = storage.objects.name or 'thumbs/' || m.cover_path || '.webp' = storage.objects.name)
      and public.can_view_material(m.id)));

-- ---------------------------------------------------------------- estatísticas (só equipe)
create or replace function public.admin_stats(days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(days, 365)));
  result jsonb;
begin
  if not public.is_staff() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'members', (select count(*) from profiles),
    'approved', (select count(*) from profiles where approved),
    'pending', (select count(*) from profiles where not approved and role = 'member'),
    'published', (select count(*) from materials where status = 'published'),
    'events', (select coalesce(jsonb_object_agg(event, n), '{}'::jsonb)
               from (select event, count(*) n from access_events where created_at >= since group by event) e),
    'active_users', (select count(distinct user_id) from (
        select user_id from reading_progress where updated_at >= since
        union all select user_id from media_progress where updated_at >= since) a),
    'top', (select coalesce(jsonb_agg(t order by t.total desc), '[]'::jsonb) from (
        select m.id, m.slug, m.title, m.type, count(*) total,
               count(distinct ae.user_id) people
        from access_events ae join materials m on m.id = ae.material_id
        where ae.created_at >= since and ae.event in ('read', 'listen', 'watch')
        group by m.id order by total desc limit 10) t),
    'daily', (select coalesce(jsonb_agg(d order by d.day), '[]'::jsonb) from (
        select to_char(date_trunc('day', created_at at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD') as day, count(*) total
        from access_events where created_at >= since and event in ('read', 'listen', 'watch')
        group by 1) d)
  ) into result;
  return result;
end $$;
revoke all on function public.admin_stats(int) from public, anon;
grant execute on function public.admin_stats(int) to authenticated;
