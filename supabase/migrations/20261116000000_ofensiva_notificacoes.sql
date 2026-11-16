-- Ofensiva de estudos (dias seguidos estudando, como no Duolingo) e notificação diária.
-- Um dia conta como estudado quando a pessoa lê, ouve, assiste ou anota algo na biblioteca.
-- A notificação chega 1x por dia, no horário que a pessoa escolher, com uma frase motivacional.

-- ---------------------------------------------------------------- dias estudados
create table public.study_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
alter table public.study_days enable row level security;
create policy study_days_own on public.study_days for select using (user_id = auth.uid());
revoke insert, update, delete on public.study_days from anon, authenticated;

-- O "hoje" é o de Brasília, para a virada do dia bater com o relógio do terreiro
create or replace function public.today_br() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function public.touch_study_day() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then
    insert into public.study_days (user_id, day) values (new.user_id, public.today_br()) on conflict do nothing;
  end if;
  return new;
end $$;

create trigger study_day_reading after insert or update on public.reading_progress for each row execute function public.touch_study_day();
create trigger study_day_pages after insert on public.reading_pages for each row execute function public.touch_study_day();
create trigger study_day_media after insert or update on public.media_progress for each row execute function public.touch_study_day();
create trigger study_day_listening after insert or update on public.listening_time for each row execute function public.touch_study_day();
create trigger study_day_notes after insert on public.annotations for each row execute function public.touch_study_day();
create trigger study_day_bookmarks after insert on public.bookmarks for each row execute function public.touch_study_day();

-- Ofensiva atual, recorde e os últimos 7 dias de uma pessoa.
-- A ofensiva continua viva até o fim do dia seguinte ao último estudo (dá tempo de estudar hoje).
create or replace function public.streak_of(uid uuid)
returns json language sql stable security definer set search_path = public as $$
  with d as (select day from public.study_days where user_id = uid),
  runs as (select day, day - (row_number() over (order by day))::int as grp from d),
  islands as (select min(day) as first_day, max(day) as last_day, count(*)::int as len from runs group by grp)
  select json_build_object(
    'current', coalesce((select len from islands where last_day >= public.today_br() - 1 order by last_day desc limit 1), 0),
    'best', coalesce((select max(len) from islands), 0),
    'today', exists (select 1 from d where day = public.today_br()),
    'week', (select json_agg(json_build_object('day', g::date, 'done', exists (select 1 from d where day = g::date)) order by g)
             from generate_series(public.today_br() - 6, public.today_br(), interval '1 day') g)
  )
$$;
revoke all on function public.streak_of(uuid) from public, anon, authenticated;
grant execute on function public.streak_of(uuid) to service_role;

create or replace function public.my_streak()
returns json language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else public.streak_of(auth.uid()) end
$$;
revoke all on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated;

-- ---------------------------------------------------------------- notificações (Web Push)
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  hour smallint not null default 19 check (hour between 0 and 23),
  last_sent_on date,
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (hour);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.push_subscriptions from anon, authenticated;
grant update (hour) on public.push_subscriptions to authenticated;

-- Quantos aparelhos ligaram o lembrete (só o número, para a equipe)
create or replace function public.push_subscriber_count()
returns integer language sql stable security definer set search_path = public as $$
  select case when public.is_staff() then (select count(*)::int from public.push_subscriptions) end
$$;
revoke all on function public.push_subscriber_count() from public, anon;
grant execute on function public.push_subscriber_count() to authenticated;

-- ---------------------------------------------------------------- frases da notificação (editáveis pela equipe)
create table public.streak_phrases (
  id uuid primary key default gen_random_uuid(),
  text text not null check (length(text) between 10 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.streak_phrases enable row level security;
create policy streak_phrases_read on public.streak_phrases for select using (auth.uid() is not null and (active or public.is_staff()));
create policy streak_phrases_write on public.streak_phrases for all using (public.is_staff()) with check (public.is_staff());

insert into public.streak_phrases (text) values
  ('Fé que não se alimenta de estudo vira só costume.'),
  ('A raiz que bebe todo dia não teme a seca.'),
  ('Quem estuda o fundamento firma o próprio ponto.'),
  ('Vela acesa sem cuidado apaga com o primeiro vento.'),
  ('O saber dos antigos só chega a quem senta para ouvir.'),
  ('Caminho que não é andado, o mato toma conta.'),
  ('A pemba risca no chão o que o estudo firmou no coração.'),
  ('Um pouco por dia enche o balaio da sabedoria.'),
  ('Quem conhece a mironga não se perde na demanda.'),
  ('A curiosidade é a primeira guia de quem quer aprender.'),
  ('O congá se sustenta com devoção, e a devoção se sustenta com entendimento.'),
  ('Folha guardada sem uso seca; saber guardado sem estudo esquece.'),
  ('A água mole do estudo diário fura a pedra da ignorância.'),
  ('Quem não pergunta ao livro fica preso no achismo.'),
  ('Médium que estuda trabalha com os pés no chão e a cabeça no alto.'),
  ('A corrente fica forte quando cada elo se prepara.'),
  ('Ninguém aprende a nadar olhando o rio da margem.'),
  ('O tambor só toca bonito para quem ensaiou o toque.'),
  ('A preguiça é a poeira que cobre a imagem do altar.'),
  ('Cada página lida é um tijolo na casa da sua fé.'),
  ('Quem planta conhecimento hoje colhe firmeza na hora da gira.'),
  ('A luz do saber não queima: aquece quem chega perto.'),
  ('Dúvida respondida é passo dado; dúvida esquecida é passo perdido.'),
  ('A sabedoria do Preto Velho veio de muito tempo de escuta.'),
  ('Fundamento não se compra: se conquista estudando.'),
  ('Quem para de aprender começa a repetir sem entender.'),
  ('O rio só chega ao mar porque não para de correr.'),
  ('Cinco minutos de estudo hoje valem mais que uma hora prometida amanhã.'),
  ('A fé que entende o porquê não balança com qualquer vento.'),
  ('Sua ofensiva é a sua defumação diária: mantém o caminho limpo.');
