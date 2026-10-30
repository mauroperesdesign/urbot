-- ---------------------------------------------------------------- pontos cantados por orixá e por linha
with base as (select id from public.categories where slug = 'pontos-cantados'),
groups(slug, name, position) as (values
  ('pontos-cantados-orixas', 'Pontos de Orixás', 1),
  ('pontos-cantados-linhas', 'Pontos das Linhas de trabalho', 2),
  ('pontos-de-gira', 'Abertura, defumação e encerramento', 3))
insert into public.categories (parent_id, slug, name, position)
select base.id, g.slug, g.name, g.position from base, groups g
on conflict (slug) do nothing;

with items(parent_slug, slug, name, position) as (values
  ('pontos-cantados-orixas', 'pontos-de-oxala', 'Oxalá', 1),
  ('pontos-cantados-orixas', 'pontos-de-iemanja', 'Iemanjá', 2),
  ('pontos-cantados-orixas', 'pontos-de-oxum', 'Oxum', 3),
  ('pontos-cantados-orixas', 'pontos-de-ogum', 'Ogum', 4),
  ('pontos-cantados-orixas', 'pontos-de-oxossi', 'Oxóssi', 5),
  ('pontos-cantados-orixas', 'pontos-de-xango', 'Xangô', 6),
  ('pontos-cantados-orixas', 'pontos-de-iansa', 'Iansã', 7),
  ('pontos-cantados-orixas', 'pontos-de-nana', 'Nanã', 8),
  ('pontos-cantados-orixas', 'pontos-de-obaluaie-e-omolu', 'Obaluaiê e Omolu', 9),
  ('pontos-cantados-orixas', 'pontos-de-ibeji', 'Ibeji', 10),
  ('pontos-cantados-linhas', 'pontos-de-preto-velho', 'Preto Velho', 1),
  ('pontos-cantados-linhas', 'pontos-de-caboclo', 'Caboclo', 2),
  ('pontos-cantados-linhas', 'pontos-de-ere', 'Erês e Crianças', 3),
  ('pontos-cantados-linhas', 'pontos-de-baiano', 'Baiano', 4),
  ('pontos-cantados-linhas', 'pontos-de-boiadeiro', 'Boiadeiro', 5),
  ('pontos-cantados-linhas', 'pontos-de-marinheiro', 'Marinheiro', 6),
  ('pontos-cantados-linhas', 'pontos-de-cigano', 'Cigano', 7),
  ('pontos-cantados-linhas', 'pontos-de-malandro', 'Malandro', 8),
  ('pontos-cantados-linhas', 'pontos-de-exu', 'Exu', 9),
  ('pontos-cantados-linhas', 'pontos-de-pombagira', 'Pombagira', 10))
insert into public.categories (parent_id, slug, name, position)
select c.id, i.slug, i.name, i.position from items i join public.categories c on c.slug = i.parent_slug
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- páginas lidas e tempo de escuta
-- Cada página é contada uma vez por pessoa e material (reler não infla o número).
create table public.reading_pages (
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  page int not null check (page > 0),
  read_at timestamptz not null default now(),
  primary key (user_id, material_id, page)
);
alter table public.reading_pages enable row level security;
create policy reading_pages_own on public.reading_pages for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_material(material_id));

create table public.listening_time (
  user_id uuid not null references auth.users (id) on delete cascade,
  material_id uuid not null references public.materials (id) on delete cascade,
  seconds int not null default 0 check (seconds >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, material_id)
);
alter table public.listening_time enable row level security;
create policy listening_time_read on public.listening_time for select using (user_id = auth.uid());

-- O player soma o tempo realmente tocado; cada chamada aceita no máximo 2 minutos
create or replace function public.log_listening(m uuid, secs int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_view_material(m) then return; end if;
  insert into public.listening_time (user_id, material_id, seconds)
  values (auth.uid(), m, greatest(0, least(secs, 120)))
  on conflict (user_id, material_id)
  do update set seconds = public.listening_time.seconds + excluded.seconds, updated_at = now();
end $$;
revoke all on function public.log_listening(uuid, int) from public, anon;
grant execute on function public.log_listening(uuid, int) to authenticated;

-- ---------------------------------------------------------------- notas de voz
alter table public.annotations add column audio_path text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('notes', 'notes', false, 2097152, array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac'])
on conflict (id) do nothing;
-- Cada pessoa só mexe na própria pasta: notes/<id da pessoa>/...
create policy storage_notes_own on storage.objects for all to authenticated
  using (bucket_id = 'notes' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'notes' and split_part(name, '/', 1) = auth.uid()::text);

-- ---------------------------------------------------------------- agenda pessoal
create table public.agenda_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  title text not null check (length(title) between 1 and 120),
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index on public.agenda_events (user_id, day);
alter table public.agenda_events enable row level security;
create policy agenda_events_own on public.agenda_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- datas da religião (editáveis pela equipe)
create table public.calendar_dates (
  id uuid primary key default gen_random_uuid(),
  month int not null check (month between 1 and 12),
  day int not null check (day between 1 and 31),
  title text not null,
  description text,
  greeting text,
  created_at timestamptz not null default now()
);
alter table public.calendar_dates enable row level security;
create policy calendar_dates_read on public.calendar_dates for select using (true);
create policy calendar_dates_write on public.calendar_dates for all using (public.is_staff()) with check (public.is_staff());

insert into public.calendar_dates (month, day, title, description, greeting) values
  (1, 20, 'Dia de Oxóssi', 'Sincretizado com São Sebastião em muitas casas.', 'Okê Arô!'),
  (1, 21, 'Dia Nacional de Combate à Intolerância Religiosa', 'Lei 11.635/2007, em memória de Mãe Gilda de Ogum.', 'Respeito a todas as crenças.'),
  (2, 2, 'Dia de Iemanjá', 'Festa de Iemanjá, celebrada sobretudo na Bahia.', 'Odoyá!'),
  (4, 23, 'Dia de Ogum', 'Sincretizado com São Jorge em muitas casas.', 'Ogunhê!'),
  (5, 13, 'Dia dos Pretos Velhos', 'Data ligada à memória da abolição e às almas dos antigos.', 'Adorei as almas!'),
  (6, 24, 'Dia de Xangô', 'Sincretizado com São João em algumas casas.', 'Kaô Kabecilê!'),
  (7, 2, 'Dia do Caboclo', 'Data da Independência da Bahia, celebrada com os caboclos.', 'Okê Caboclo!'),
  (7, 26, 'Dia de Nanã', 'Sincretizada com Sant''Ana.', 'Saluba Nanã!'),
  (8, 16, 'Dia de Obaluaiê e Omolu', 'Sincretizado com São Roque.', 'Atotô!'),
  (9, 27, 'Dia de Ibeji, Erês e Crianças', 'Sincretizados com São Cosme e São Damião.', 'Salve as crianças!'),
  (9, 30, 'Dia de Xangô', 'Sincretizado com São Jerônimo em muitas casas de Umbanda.', 'Kaô Kabecilê!'),
  (10, 12, 'Dia de Oxum', 'Celebrada junto a Nossa Senhora Aparecida em muitas casas.', 'Ora yê yê ô!'),
  (11, 2, 'Dia dos ancestrais', 'Finados: memória dos antepassados e das almas.', 'Atotô!'),
  (11, 15, 'Dia Nacional da Umbanda', 'Anúncio da Umbanda por Zélio de Moraes e o Caboclo das Sete Encruzilhadas, em 1908.', 'Saravá a Umbanda!'),
  (12, 4, 'Dia de Iansã', 'Sincretizada com Santa Bárbara.', 'Eparrey Oyá!'),
  (12, 8, 'Dia de Oxum e Iemanjá', 'Sincretizadas com Nossa Senhora da Conceição em muitas casas.', 'Ora yê yê ô! Odoyá!'),
  (12, 25, 'Dia de Oxalá', 'Celebrado no Natal em muitas casas de Umbanda.', 'Epa Babá!'),
  (12, 31, 'Oferendas a Iemanjá', 'Virada do ano com flores e pedidos ao mar.', 'Odoyá!');

-- ---------------------------------------------------------------- mensagem do dia (editáveis pela equipe)
create table public.daily_messages (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  text text not null check (length(text) between 10 and 600),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.daily_messages enable row level security;
create policy daily_messages_read on public.daily_messages for select using (active or public.is_staff());
create policy daily_messages_write on public.daily_messages for all using (public.is_staff()) with check (public.is_staff());

insert into public.daily_messages (entity, text) values
  ('Preto Velho', 'Ô meu fio, num carece de pressa não. Café se toma devagarinho, e a vida também. Quem anda ligeiro demais tropeça na própria pedra. Senta, respira, que nego véio tá aqui do lado.'),
  ('Preto Velho', 'Zifia, a dor que ocê carrega hoje é a força que ocê vai ter amanhã. Nego véio já carregou muito fardo nesse mundo, e aprendeu: Deus não dá cruz maior que o ombro.'),
  ('Preto Velho', 'Meu fio, perdoar num é esquecer não. É largar a pedra que tá machucando a mão de quem segura. Larga, fio, larga.'),
  ('Preto Velho', 'Reza com fé, mas reza também com as mão: ajuda quem tá do lado. Oração que num vira caridade fica só na boca, zifio.'),
  ('Preto Velho', 'Ô minha fia, a vela que ocê acende pros outro clareia o seu caminho também. Nego véio só pede: num deixa a chama do coração apagar.'),
  ('Caboclo', 'Okê! Filho, olhe para a mata: a árvore não briga com o vento, ela se firma na raiz. Firme sua raiz na fé e nenhuma tempestade te derruba.'),
  ('Caboclo', 'A flecha do caboclo só vai longe porque o arco foi puxado para trás. Se a vida te recuou, filho, é para te lançar mais adiante.'),
  ('Caboclo', 'Na mata ninguém tem pressa e nada fica para trás. Cada folha tem seu tempo de cair e de brotar. Confie no seu tempo.'),
  ('Caboclo', 'Okê Caboclo! Quem caminha com verdade não precisa olhar para trás. Siga em frente com o peito aberto e os pés no chão.'),
  ('Exu', 'Laroyê! Moço, caminho torto não se endireita reclamando, se endireita andando. Escolha bem a estrada, que Exu guarda a encruzilhada.'),
  ('Exu', 'Ninguém engana a lei, moça. O que você planta na encruzilhada da vida, é isso que vai colher. Plante coisa boa.'),
  ('Exu', 'Exu abre caminho, mas quem anda é você. Não espere a porta se abrir sozinha: bata, insista, entre de cabeça erguida.'),
  ('Exu', 'Laroyê! Palavra dada é palavra cumprida. Quem honra o que fala tem Exu do lado e a estrada sempre aberta.'),
  ('Pombagira', 'Ai, moça, se ame primeiro. Quem não se dá valor ensina os outros a não dar também. Levanta essa cabeça e passa batom no sorriso!'),
  ('Pombagira', 'Rosa bonita também tem espinho, minha filha. Ser doce não é ser boba: proteja o que é seu com firmeza e com carinho.'),
  ('Baiano', 'Ôxe, meu rei! Problema é igual coco: duro por fora, mas tem água doce dentro. Tenha paciência pra quebrar a casca, visse?'),
  ('Baiano', 'Ô meu pai, num se avexe não! Que alegria também é remédio, e risada boa espanta tristeza e encosto de uma vez só.'),
  ('Marinheiro', 'Ô marujo, o mar não fica calmo pra sempre, nem bravo pra sempre. Segura firme no leme e espera a maré virar, que ela vira.'),
  ('Marinheiro', 'Quem aprende a navegar no balanço não se assusta com a onda. A vida balança, camarada, mas o barco da fé não afunda.'),
  ('Boiadeiro', 'Jetuá! Boiadeiro não larga a boiada no meio do caminho. Termine o que começou, filho, que a recompensa vem na chegada.'),
  ('Boiadeiro', 'Laço firme e coração manso: assim se conduz a boiada e assim se conduz a vida. Força sem bondade só espanta o gado.'),
  ('Erê', 'Tio, tia, brinca um pouquinho hoje! Criança sabe que tudo fica mais leve com doce e com abraço. Dá um abraço em alguém?'),
  ('Erê', 'Quando a gente cai, a gente levanta e vai brincar de novo! Não fica triste muito tempo não, tá bom? Os erês tão contigo.'),
  ('Cigano', 'A roda da vida gira, viajante. O que hoje parece fim é só a curva da estrada. Siga com o coração livre e as mãos abertas.'),
  ('Malandro', 'Ô, parceiro, malandragem de verdade é ser honesto e ainda assim sair por cima. Pisa leve, fala manso e nunca passa ninguém pra trás.'),
  ('Oxalá', 'Epa Babá! Que a paz de Oxalá cubra sua cabeça como um pano branco. Silencie por um instante: a resposta que você busca mora na calma.'),
  ('Iemanjá', 'Odoyá! Entregue ao mar aquilo que pesa no seu peito. A mãe das águas acolhe todos os seus filhos e devolve a esperança na espuma das ondas.'),
  ('Ogum', 'Ogunhê! Diante da demanda, levante a espada da coragem. Quem luta com justiça nunca luta sozinho.');
