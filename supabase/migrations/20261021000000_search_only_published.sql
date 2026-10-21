-- O acervo (busca) mostra só materiais publicados, inclusive para a equipe;
-- rascunhos e arquivados continuam visíveis no painel administrativo.
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
    where m.status = 'published'
      and (category is null or exists (
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
