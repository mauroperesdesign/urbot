-- Transcrição automática dos áudios: letra dos pontos cantados e notas de voz das anotações.
-- Um processo no servidor (scripts/transcrever.mjs, de minuto em minuto) pega o que está "pendente".

alter table public.files
  add column transcript text check (length(transcript) <= 20000),
  add column transcript_status text check (transcript_status in ('pendente', 'processando', 'pronto', 'erro')),
  add column transcript_error text,
  add column transcript_at timestamptz;

alter table public.annotations
  add column transcript text check (length(transcript) <= 4000),
  add column transcript_status text check (transcript_status in ('pendente', 'processando', 'pronto', 'erro')),
  add column transcript_at timestamptz;
create index annotations_transcript_pending on public.annotations (transcript_status) where transcript_status in ('pendente', 'processando');
create index files_transcript_pending on public.files (transcript_status) where transcript_status in ('pendente', 'processando');

-- Pontos cantados: toda faixa nova de um material da categoria "Pontos cantados" entra na fila
create or replace function public.is_ponto(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select id from public.categories where slug = 'pontos-cantados'
    union all select c.id from public.categories c join tree t on c.parent_id = t.id)
  select exists (select 1 from public.material_categories mc where mc.material_id = m and mc.category_id in (select id from tree))
$$;

create or replace function public.queue_track_transcript() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.role = 'track' and new.path is not null and new.transcript_status is null and public.is_ponto(new.material_id) then
    new.transcript_status := 'pendente';
  end if;
  return new;
end $$;
create trigger files_queue_transcript before insert on public.files
  for each row execute function public.queue_track_transcript();

-- Notas de voz: ao gravar (ou trocar) o áudio, a transcrição vai para a fila
create or replace function public.queue_note_transcript() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.audio_path is null then
    new.transcript := null; new.transcript_status := null;
  elsif tg_op = 'INSERT' or new.audio_path is distinct from old.audio_path then
    new.transcript := null; new.transcript_status := 'pendente';
  end if;
  return new;
end $$;
create trigger annotations_queue_transcript before insert or update of audio_path on public.annotations
  for each row execute function public.queue_note_transcript();

-- Notas de voz que já existiam também são transcritas
update public.annotations set transcript_status = 'pendente' where audio_path is not null and transcript_status is null;
