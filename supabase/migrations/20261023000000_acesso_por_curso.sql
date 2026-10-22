-- ---------------------------------------------------------------- acesso por curso
-- Cada curso tem a sua lista de pessoas liberadas. Membros aprovados veem que o curso existe
-- (capa e descrição), mas as aulas só aparecem para quem foi liberado naquele curso.
create table public.course_access (
  course_id uuid not null references public.materials (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (course_id, user_id)
);
create index on public.course_access (user_id);

create table public.course_requests (
  course_id uuid not null references public.materials (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

-- Material exclusivo de curso: some do acervo geral e só abre para quem está liberado
-- em algum curso que o contém.
alter table public.materials add column course_only boolean not null default false;

create or replace function public.has_course_access(course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_staff() or (public.is_member() and exists (
    select 1 from public.course_access ca where ca.course_id = course and ca.user_id = auth.uid()))
$$;

create or replace function public.can_view_material(m_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.materials m
    where m.id = m_id
      and (public.is_staff()
           or (m.status = 'published'
               and (m.visibility = 'public' or public.is_member())
               and (not m.course_only or exists (
                 select 1 from public.course_items ci
                 join public.course_access ca on ca.course_id = ci.course_id and ca.user_id = auth.uid()
                 where ci.material_id = m.id))))
  )
$$;

-- A leitura de materiais passa a usar a mesma regra (uma fonte só)
drop policy if exists materials_read on public.materials;
create policy materials_read on public.materials for select using (public.can_view_material(id));

drop policy if exists course_items_read on public.course_items;
create policy course_items_read on public.course_items for select
  using (public.can_view_material(course_id) and public.has_course_access(course_id));

alter table public.course_access enable row level security;
create policy course_access_read on public.course_access for select using (user_id = auth.uid() or public.is_staff());
create policy course_access_write on public.course_access for all using (public.is_staff()) with check (public.is_staff());

alter table public.course_requests enable row level security;
create policy course_requests_read on public.course_requests for select using (user_id = auth.uid() or public.is_staff());
create policy course_requests_insert on public.course_requests for insert
  with check (user_id = auth.uid() and public.is_member() and public.can_view_material(course_id)
              and exists (select 1 from public.materials m where m.id = course_id and m.type = 'course'));
create policy course_requests_delete on public.course_requests for delete using (user_id = auth.uid() or public.is_staff());

-- Quantas aulas o curso tem (mostrado também para quem ainda não foi liberado)
create or replace function public.course_lesson_count(course uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when public.can_view_material(course)
    then (select count(*)::int from public.course_items ci join public.materials m on m.id = ci.material_id
          where ci.course_id = course and m.status = 'published')
    else 0 end
$$;
grant execute on function public.course_lesson_count(uuid) to anon, authenticated;
