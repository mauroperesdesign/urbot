-- Biblioteca Umbandista — esquema inicial (Etapa 1 e base da Etapa 2)
-- Modelo de acesso:
--   anon        : vê apenas materiais publicados e públicos (metadados)
--   member      : usuário autenticado; vê conteúdo restrito só se aprovado
--   editor/admin: equipe; vê e edita tudo. Só admin altera papéis e aprovações.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- tipos
create type public.app_role as enum ('member', 'editor', 'admin');
create type public.material_status as enum ('draft', 'published', 'archived');
create type public.material_visibility as enum ('public', 'restricted');
create type public.material_type as enum (
  'book', 'pdf', 'handout', 'document', 'audiobook', 'audio', 'video',
  'video_lesson', 'course', 'article', 'research', 'glossary', 'external_link');
create type public.file_role as enum ('main', 'cover', 'supplementary', 'track', 'subtitle', 'transcript');
create type public.processing_status as enum ('pending', 'processing', 'ready', 'failed');

-- ---------------------------------------------------------------- perfis
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  role public.app_role not null default 'member',
  approved boolean not null default false,
  reading_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), new.email);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Funções de permissão (security definer: leem profiles sem recursão de RLS)
create or replace function public.current_role_name()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('editor', 'admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select approved or role in ('editor', 'admin') from public.profiles where id = auth.uid()), false)
$$;

-- Mudança de papel/aprovação só por admin, via RPC auditável
create or replace function public.admin_set_access(target uuid, new_role public.app_role, new_approved boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'apenas administradores podem alterar permissões' using errcode = '42501';
  end if;
  if target = auth.uid() and new_role <> 'admin' then
    raise exception 'um administrador não pode remover o próprio acesso' using errcode = '42501';
  end if;
  update public.profiles set role = new_role, approved = new_approved, updated_at = now() where id = target;
end $$;

-- ---------------------------------------------------------------- taxonomia
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  constraint categories_not_self check (parent_id is distinct from id)
);
create index on public.categories (parent_id, position);

create table public.authors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  bio text,
  created_at timestamptz not null default now()
);

create table public.publishers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

-- ---------------------------------------------------------------- materiais
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  description text,
  type public.material_type not null,
  language text not null default 'pt',
  year int check (year between 1000 and 2100),
  isbn text,
  publisher_id uuid references public.publishers (id) on delete set null,
  organizer text,
  tradition text,
  source_reference text,
  keywords text[] not null default '{}',
  toc jsonb,
  page_count int check (page_count > 0),
  duration_seconds int check (duration_seconds >= 0),
  status public.material_status not null default 'draft',
  visibility public.material_visibility not null default 'restricted',
  featured boolean not null default false,
  featured_rank int,
  rights_holder text,
  license text,
  original_source text,
  publication_authorized boolean not null default false,
  access_conditions text,
  rights_verified_at date,
  allow_download boolean not null default false,
  cover_path text,
  legacy_ref text unique,
  search tsvector,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint publish_requires_authorization check (status <> 'published' or publication_authorized)
);
create index materials_search_idx on public.materials using gin (search);
create index materials_title_trgm on public.materials using gin (title extensions.gin_trgm_ops);
create index on public.materials (status, visibility);
create index on public.materials (featured, featured_rank) where featured;

-- Notas internas ficam numa tabela só da equipe (nunca vazam para membros)
create table public.material_internal (
  material_id uuid primary key references public.materials (id) on delete cascade,
  internal_notes text,
  review_notes text,
  updated_at timestamptz not null default now()
);

create table public.material_authors (
  material_id uuid references public.materials (id) on delete cascade,
  author_id uuid references public.authors (id) on delete restrict,
  role text not null default 'author',
  position int not null default 0,
  primary key (material_id, author_id, role)
);

create table public.material_categories (
  material_id uuid references public.materials (id) on delete cascade,
  category_id uuid references public.categories (id) on delete restrict,
  primary key (material_id, category_id)
);
create index on public.material_categories (category_id);

create table public.material_tags (
  material_id uuid references public.materials (id) on delete cascade,
  tag_id uuid references public.tags (id) on delete cascade,
  primary key (material_id, tag_id)
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials (id) on delete cascade,
  role public.file_role not null,
  bucket text not null default 'materials',
  path text,
  external_url text,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  sha256 text,
  original_name text,
  title text,
  position int not null default 0,
  duration_seconds int,
  page_count int,
  drive_id text,
  processing_status public.processing_status not null default 'pending',
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint file_has_location check (path is not null or external_url is not null or drive_id is not null),
  unique (bucket, path)
);
create index on public.files (material_id, role, position);
create index on public.files (sha256);

-- Visibilidade de um material para o usuário atual
create or replace function public.can_view_material(m_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.materials m
    where m.id = m_id
      and (public.is_staff()
           or (m.status = 'published' and (m.visibility = 'public' or public.is_member())))
  )
$$;

-- Índice de busca: título, subtítulo, autores, descrição, palavras-chave, tradição
create or replace function public.refresh_material_search(m_id uuid)
returns void language sql security definer set search_path = public, extensions as $$
  update public.materials m set search =
      setweight(to_tsvector('portuguese', extensions.unaccent(coalesce(m.title, '') || ' ' || coalesce(m.subtitle, ''))), 'A')
   || setweight(to_tsvector('portuguese', extensions.unaccent(coalesce((
          select string_agg(a.name, ' ') from public.material_authors ma
          join public.authors a on a.id = ma.author_id where ma.material_id = m.id), ''))), 'A')
   || setweight(to_tsvector('portuguese', extensions.unaccent(array_to_string(m.keywords, ' ') || ' ' || coalesce(m.tradition, ''))), 'B')
   || setweight(to_tsvector('portuguese', extensions.unaccent(coalesce(m.description, ''))), 'C')
  where m.id = m_id
$$;

create or replace function public.materials_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;
create trigger materials_touch before insert or update on public.materials
  for each row execute function public.materials_touch();

create or replace function public.materials_after_write()
returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() = 1 then perform public.refresh_material_search(new.id); end if;
  return null;
end $$;
create trigger materials_after_write after insert or update of title, subtitle, description, keywords, tradition
  on public.materials for each row execute function public.materials_after_write();

create or replace function public.material_authors_after_write()
returns trigger language plpgsql as $$
begin
  perform public.refresh_material_search(coalesce(new.material_id, old.material_id));
  return null;
end $$;
create trigger material_authors_after_write after insert or update or delete on public.material_authors
  for each row execute function public.material_authors_after_write();

-- Busca com filtros e paginação (respeita RLS porque é security invoker)
create or replace function public.search_materials(
  q text default null, category uuid default null, mtype public.material_type default null,
  lang text default null, page int default 1, page_size int default 24)
returns table (id uuid, slug text, title text, subtitle text, type public.material_type,
               cover_path text, tradition text, rank real, total bigint)
language sql stable security invoker set search_path = public, extensions as $$
  with query as (
    select case when nullif(trim(q), '') is null then null
                else websearch_to_tsquery('portuguese', extensions.unaccent(q)) end as tsq
  ), hits as (
    select m.*, (select tsq from query) as tsq
    from public.materials m
    where (category is null or exists (
             select 1 from public.material_categories mc
             where mc.material_id = m.id and mc.category_id in (
               with recursive tree as (
                 select c.id from public.categories c where c.id = category
                 union all select c.id from public.categories c join tree t on c.parent_id = t.id)
               select tree.id from tree)))
      and (mtype is null or m.type = mtype)
      and (lang is null or m.language = lang)
      and ((select tsq from query) is null
           or m.search @@ (select tsq from query)
           or m.title ilike '%' || q || '%')
  )
  select h.id, h.slug, h.title, h.subtitle, h.type, h.cover_path, h.tradition,
         coalesce(ts_rank(h.search, h.tsq), 0)::real as rank, count(*) over () as total
  from hits h
  order by rank desc, h.title
  limit greatest(1, least(page_size, 100)) offset greatest(0, page - 1) * greatest(1, least(page_size, 100))
$$;

-- ---------------------------------------------------------------- consumo
create table public.reading_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  location text not null,
  percent numeric(5, 2) check (percent between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, material_id)
);

create table public.media_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  position_seconds numeric(10, 2) not null default 0 check (position_seconds >= 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, file_id)
);
create index on public.media_progress (user_id, material_id, updated_at desc);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  location text not null,
  label text,
  created_at timestamptz not null default now()
);

create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  location text not null,
  quote text,
  note text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, material_id)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  position int not null default 0,
  added_at timestamptz not null default now(),
  primary key (collection_id, material_id)
);

create table public.access_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  material_id uuid not null references public.materials (id) on delete cascade,
  event text not null check (event in ('view', 'read', 'listen', 'watch', 'download')),
  created_at timestamptz not null default now()
);
create index on public.access_events (material_id, created_at desc);

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.authors enable row level security;
alter table public.publishers enable row level security;
alter table public.tags enable row level security;
alter table public.materials enable row level security;
alter table public.material_internal enable row level security;
alter table public.material_authors enable row level security;
alter table public.material_categories enable row level security;
alter table public.material_tags enable row level security;
alter table public.files enable row level security;
alter table public.reading_progress enable row level security;
alter table public.media_progress enable row level security;
alter table public.bookmarks enable row level security;
alter table public.annotations enable row level security;
alter table public.favorites enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.access_events enable row level security;

-- perfis: cada um lê o seu; equipe lê todos. Atualização só de colunas seguras.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (display_name, reading_prefs) on public.profiles to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

-- taxonomia: leitura livre, escrita da equipe
create policy categories_read on public.categories for select using (true);
create policy categories_write on public.categories for all using (public.is_staff()) with check (public.is_staff());
create policy authors_read on public.authors for select using (true);
create policy authors_write on public.authors for all using (public.is_staff()) with check (public.is_staff());
create policy publishers_read on public.publishers for select using (true);
create policy publishers_write on public.publishers for all using (public.is_staff()) with check (public.is_staff());
create policy tags_read on public.tags for select using (true);
create policy tags_write on public.tags for all using (public.is_staff()) with check (public.is_staff());

-- materiais
create policy materials_read on public.materials for select
  using (public.is_staff() or (status = 'published' and (visibility = 'public' or public.is_member())));
create policy materials_write on public.materials for all using (public.is_staff()) with check (public.is_staff());
create policy material_internal_staff on public.material_internal for all using (public.is_staff()) with check (public.is_staff());

create policy material_authors_read on public.material_authors for select using (public.can_view_material(material_id));
create policy material_authors_write on public.material_authors for all using (public.is_staff()) with check (public.is_staff());
create policy material_categories_read on public.material_categories for select using (public.can_view_material(material_id));
create policy material_categories_write on public.material_categories for all using (public.is_staff()) with check (public.is_staff());
create policy material_tags_read on public.material_tags for select using (public.can_view_material(material_id));
create policy material_tags_write on public.material_tags for all using (public.is_staff()) with check (public.is_staff());

-- arquivos: metadados de capa seguem o material; arquivos de conteúdo exigem membro
-- aprovado quando o material é restrito (já coberto por can_view_material)
create policy files_read on public.files for select using (public.can_view_material(material_id));
create policy files_write on public.files for all using (public.is_staff()) with check (public.is_staff());

-- dados pessoais: privados por padrão
create policy reading_progress_own on public.reading_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_material(material_id));
create policy media_progress_own on public.media_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_material(material_id));
create policy bookmarks_own on public.bookmarks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_material(material_id));
create policy annotations_own on public.annotations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_material(material_id));
create policy favorites_own on public.favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_material(material_id));
create policy collections_own on public.collections for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy collection_items_own on public.collection_items for all
  using (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
              and public.can_view_material(material_id));

-- eventos de acesso: qualquer um registra para material visível; só equipe lê
create policy access_events_insert on public.access_events for insert
  with check ((user_id is null or user_id = auth.uid()) and public.can_view_material(material_id));
create policy access_events_staff on public.access_events for select using (public.is_staff());

-- ---------------------------------------------------------------- Storage
-- Buckets privados: todo acesso passa por URL assinada gerada para quem pode ver.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('covers', 'covers', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('materials', 'materials', false, 524288000, array[
    'application/pdf', 'application/epub+zip', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav',
    'audio/ogg', 'video/mp4', 'video/webm', 'text/vtt', 'text/plain'])
on conflict (id) do nothing;

create policy storage_staff_write on storage.objects for all to authenticated
  using (bucket_id in ('covers', 'materials') and public.is_staff())
  with check (bucket_id in ('covers', 'materials') and public.is_staff());

create policy storage_covers_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'covers' and exists (
    select 1 from public.materials m where m.cover_path = storage.objects.name and public.can_view_material(m.id)));

create policy storage_materials_read on storage.objects for select to authenticated
  using (bucket_id = 'materials' and exists (
    select 1 from public.files f where f.bucket = 'materials' and f.path = storage.objects.name
      and public.can_view_material(f.material_id)));
