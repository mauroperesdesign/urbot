-- Avaliações dos materiais: nota de 1 a 5 estrelas e resenha opcional.
-- Uma avaliação por pessoa em cada material (pode editar ou apagar a sua).
-- Só membros aprovados (e a equipe) leem e escrevem; a equipe pode apagar qualquer uma.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (length(body) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_id, user_id)
);
create index on public.reviews (material_id, updated_at desc);
alter table public.reviews enable row level security;

create policy reviews_read on public.reviews for select
  using ((public.is_member() or public.is_staff()) and public.can_view_material(material_id));
create policy reviews_insert on public.reviews for insert
  with check (user_id = auth.uid() and (public.is_member() or public.is_staff()) and public.can_view_material(material_id));
create policy reviews_update_own on public.reviews for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_material(material_id));
create policy reviews_delete on public.reviews for delete
  using (user_id = auth.uid() or public.is_staff());
revoke update on public.reviews from anon, authenticated;
grant update (rating, body, updated_at) on public.reviews to authenticated;

-- Lista com o nome de quem avaliou (os perfis não são legíveis entre membros)
create or replace function public.material_reviews(m uuid)
returns table (id uuid, rating smallint, body text, created_at timestamptz, updated_at timestamptz, author text, mine boolean)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.rating, r.body, r.created_at, r.updated_at,
         coalesce(nullif(trim(p.display_name), ''), 'Membro') as author,
         r.user_id = auth.uid() as mine
  from public.reviews r
  left join public.profiles p on p.id = r.user_id
  where r.material_id = m
    and (public.is_member() or public.is_staff())
    and public.can_view_material(m)
  order by (r.user_id = auth.uid()) desc, r.updated_at desc
$$;
revoke all on function public.material_reviews(uuid) from public, anon;
grant execute on function public.material_reviews(uuid) to authenticated;
