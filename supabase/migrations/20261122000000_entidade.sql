-- Entidade do ponto cantado (ex.: Pai Joaquim de Angola, Caboclo Sete Flechas, Seu Tranca Rua).
-- Aparece na página e nos cartões do ponto e entra na busca do acervo com peso alto.
alter table public.materials add column entity text check (length(entity) <= 200);

create or replace function public.refresh_material_search(m_id uuid)
returns void language sql security definer set search_path = public, extensions as $$
  update public.materials m set search =
      setweight(to_tsvector('portuguese', extensions.unaccent(coalesce(m.title, '') || ' ' || coalesce(m.subtitle, '') || ' ' || coalesce(m.entity, ''))), 'A')
   || setweight(to_tsvector('portuguese', extensions.unaccent(coalesce((
          select string_agg(a.name, ' ') from public.material_authors ma
          join public.authors a on a.id = ma.author_id where ma.material_id = m.id), ''))), 'A')
   || setweight(to_tsvector('portuguese', extensions.unaccent(array_to_string(m.keywords, ' ') || ' ' || coalesce(m.tradition, ''))), 'B')
   || setweight(to_tsvector('portuguese', extensions.unaccent(coalesce(m.description, ''))), 'C')
  where m.id = m_id
$$;

drop trigger if exists materials_after_write on public.materials;
create trigger materials_after_write after insert or update of title, subtitle, description, keywords, tradition, entity
  on public.materials for each row execute function public.materials_after_write();
