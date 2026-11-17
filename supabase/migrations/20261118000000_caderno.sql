-- Caderno de estudos: folhas livres (mapa mental) de cada pessoa, com notas, imagens coladas e ligações.
-- Fica só no perfil da pessoa (não é ligado a nenhum material) e pode ser baixado em PDF.

create table public.notebook_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Nova folha' check (length(title) between 1 and 120),
  content jsonb not null default '{"items": [], "links": []}'::jsonb check (pg_column_size(content) <= 400000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.notebook_pages (user_id, created_at);
alter table public.notebook_pages enable row level security;
create policy notebook_pages_own on public.notebook_pages for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notebook_pages from anon, authenticated;
grant update (title, content, updated_at) on public.notebook_pages to authenticated;

-- Imagens coladas no caderno (prints, fotos): pasta própria de cada pessoa, privada
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('caderno', 'caderno', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy storage_caderno_own on storage.objects for all to authenticated
  using (bucket_id = 'caderno' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'caderno' and split_part(name, '/', 1) = auth.uid()::text);
