-- Quantas vezes cada material foi iniciado e concluído (leitura, audição ou vídeo).
-- Cada linha é uma "vez": começa quando a pessoa abre o leitor ou dá play e termina quando
-- chega ao fim. Enquanto a vez anterior não terminou, abrir de novo não conta outra vez
-- (é só continuar); depois de concluir, recomeçar conta como nova leitura.

create table public.material_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  kind text not null check (kind in ('read', 'listen', 'watch')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index on public.material_reads (material_id, kind);
create unique index material_reads_one_open on public.material_reads (user_id, material_id, kind) where completed_at is null;
alter table public.material_reads enable row level security;
create policy material_reads_own on public.material_reads for select using (user_id = auth.uid() or public.is_staff());
-- Sem insert/update direto: só pelas funções abaixo
revoke insert, update, delete on public.material_reads from anon, authenticated;

create or replace function public.start_material(m uuid, k text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or k not in ('read', 'listen', 'watch') or not public.can_view_material(m) then return; end if;
  insert into public.material_reads (user_id, material_id, kind) values (auth.uid(), m, k)
    on conflict (user_id, material_id, kind) where completed_at is null do nothing;
end $$;

create or replace function public.complete_material(m uuid, k text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or k not in ('read', 'listen', 'watch') or not public.can_view_material(m) then return; end if;
  update public.material_reads set completed_at = now()
    where user_id = auth.uid() and material_id = m and kind = k and completed_at is null;
  -- Chegou ao fim sem um início registrado (ex.: leitura anterior a esta função)
  if not found and not exists (
    select 1 from public.material_reads
    where user_id = auth.uid() and material_id = m and kind = k and completed_at > now() - interval '1 hour'
  ) then
    insert into public.material_reads (user_id, material_id, kind, completed_at) values (auth.uid(), m, k, now());
  end if;
end $$;

-- Totais do material (números agregados, sem dizer quem leu)
create or replace function public.material_read_counts(m uuid)
returns table (kind text, started bigint, completed bigint)
language sql
stable
security definer
set search_path = public
as $$
  select r.kind, count(*), count(r.completed_at)
  from public.material_reads r
  where r.material_id = m and public.can_view_material(m)
  group by r.kind
$$;

revoke all on function public.start_material(uuid, text) from public, anon;
revoke all on function public.complete_material(uuid, text) from public, anon;
revoke all on function public.material_read_counts(uuid) from public;
grant execute on function public.start_material(uuid, text) to authenticated;
grant execute on function public.complete_material(uuid, text) to authenticated;
grant execute on function public.material_read_counts(uuid) to anon, authenticated;
