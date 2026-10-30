-- Sincronizar a agenda com o Google Agenda, o Calendário do iPhone e outros apps.
-- Cada pessoa pode gerar um link secreto de assinatura (formato iCalendar). Os apps de
-- calendário não enviam a sessão do site, então o link leva um token aleatório e a leitura
-- passa por uma função que devolve apenas a agenda do dono desse token.

create table public.calendar_feeds (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique check (length(token) >= 40),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
create policy calendar_feeds_read_own on public.calendar_feeds for select using (user_id = auth.uid());
create policy calendar_feeds_delete_own on public.calendar_feeds for delete using (user_id = auth.uid());

-- Cria ou troca o link da pessoa (o link antigo deixa de funcionar na hora).
create or replace function public.rotate_calendar_feed()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'é preciso entrar na conta'; end if;
  insert into public.calendar_feeds (user_id, token) values (auth.uid(), t)
    on conflict (user_id) do update set token = excluded.token, created_at = now();
  return t;
end $$;
revoke all on function public.rotate_calendar_feed() from public, anon;
grant execute on function public.rotate_calendar_feed() to authenticated;

-- Conteúdo do link: compromissos da pessoa (do ano passado em diante) e as datas da religião.
create or replace function public.calendar_feed(t text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'events', coalesce((
      select json_agg(json_build_object('id', e.id, 'day', e.day, 'title', e.title, 'notes', e.notes, 'created_at', e.created_at) order by e.day)
      from public.agenda_events e
      where e.user_id = f.user_id and e.day >= (current_date - interval '1 year')
    ), '[]'::json),
    'holy', coalesce((
      select json_agg(json_build_object('id', c.id, 'month', c.month, 'day', c.day, 'title', c.title, 'description', c.description, 'greeting', c.greeting) order by c.month, c.day)
      from public.calendar_dates c
    ), '[]'::json)
  )
  from public.calendar_feeds f
  where length(t) >= 40 and f.token = t;
$$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
