-- Sugestões de materiais: membros sugerem livros, audiobooks, cursos etc.; a equipe recebe no painel,
-- muda a situação e pode deixar um recado que a pessoa vê.

create table public.material_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 200),
  author text check (length(author) <= 200),
  kind text not null default 'livro' check (kind in ('livro', 'audiobook', 'curso', 'video', 'apostila', 'ponto', 'outro')),
  link text check (link is null or (length(link) <= 500 and link ~* '^https?://')),
  reason text check (length(reason) <= 2000),
  status text not null default 'nova' check (status in ('nova', 'analisando', 'adicionada', 'recusada')),
  admin_note text check (length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.material_suggestions (status, created_at desc);
create index on public.material_suggestions (user_id, created_at desc);
alter table public.material_suggestions enable row level security;

create policy suggestions_read on public.material_suggestions for select
  using (user_id = auth.uid() or public.is_staff());
create policy suggestions_insert on public.material_suggestions for insert
  with check (user_id = auth.uid() and status = 'nova' and admin_note is null and (public.is_member() or public.is_staff()));
create policy suggestions_staff_update on public.material_suggestions for update
  using (public.is_staff()) with check (public.is_staff());
-- A pessoa pode retirar a própria sugestão enquanto ninguém analisou; a equipe pode apagar qualquer uma
create policy suggestions_delete on public.material_suggestions for delete
  using ((user_id = auth.uid() and status = 'nova') or public.is_staff());
revoke update on public.material_suggestions from anon, authenticated;
grant update (status, admin_note, updated_at) on public.material_suggestions to authenticated;

-- No máximo 10 sugestões por pessoa em 24 horas (evita abuso)
create or replace function public.limit_suggestions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.material_suggestions
      where user_id = new.user_id and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'limite de sugestões por dia atingido';
  end if;
  return new;
end $$;
create trigger suggestions_limit before insert on public.material_suggestions
  for each row execute function public.limit_suggestions();
