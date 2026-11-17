-- Testes das regras de acesso (RLS) com usuários anônimo, membro não aprovado,
-- membro aprovado e administrador. Qualquer falha interrompe o script.
\set ON_ERROR_STOP on
\set QUIET on

-- ------------------------------------------------------------ dados de teste
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@teste'),
  ('00000000-0000-0000-0000-00000000000b', 'membro@teste'),
  ('00000000-0000-0000-0000-00000000000c', 'novo@teste');
update public.profiles set role = 'admin', approved = true where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set approved = true where id = '00000000-0000-0000-0000-00000000000b';

insert into public.materials (id, slug, title, type, status, visibility, publication_authorized, cover_path, description) values
  ('10000000-0000-0000-0000-000000000001', 'publico', 'Material público de teste', 'book', 'published', 'public', true, 'p.jpg', 'ervas e folhas'),
  ('10000000-0000-0000-0000-000000000002', 'restrito', 'Iniciação à Umbanda', 'book', 'published', 'restricted', true, 'r.jpg', 'fundamentos'),
  ('10000000-0000-0000-0000-000000000003', 'rascunho', 'Rascunho interno', 'book', 'draft', 'public', false, 'd.jpg', null);
insert into public.authors (id, name, slug) values ('20000000-0000-0000-0000-000000000001', 'Ronaldo Linhares', 'ronaldo-linhares');
insert into public.material_authors (material_id, author_id) values ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001');
insert into public.material_internal (material_id, internal_notes) values ('10000000-0000-0000-0000-000000000002', 'nota secreta');
insert into public.files (id, material_id, role, path, mime_type) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'main', 'pub.pdf', 'application/pdf'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'main', 'res.pdf', 'application/pdf'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'main', 'draft.pdf', 'application/pdf');
insert into storage.objects (bucket_id, name) values
  ('covers', 'p.jpg'), ('covers', 'r.jpg'), ('covers', 'd.jpg'),
  ('materials', 'pub.pdf'), ('materials', 'res.pdf'), ('materials', 'draft.pdf');

create function public.t_expect_error(sql text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  return true;
end $$;
grant execute on function public.t_expect_error(text) to anon, authenticated;

\echo '== anônimo'
begin;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from public.materials) = 1, 'anônimo deve ver só o material público publicado';
  assert (select count(*) from public.files) = 1, 'anônimo vê só arquivos do material público';
  assert (select count(*) from public.profiles) = 0, 'anônimo não lê perfis';
  assert (select count(*) from public.material_internal) = 0, 'anônimo não lê notas internas';
  assert (select count(*) from storage.objects where bucket_id = 'covers') = 1, 'anônimo vê só a capa pública';
  assert (select count(*) from storage.objects where bucket_id = 'materials') = 0, 'anônimo não acessa arquivos';
  assert (select count(*) from public.search_materials(null)) = 1, 'busca anônima só retorna público';
  assert (select count(*) from public.search_materials('Iniciação')) = 0, 'busca anônima não revela restrito';
  assert public.t_expect_error($q$insert into public.materials (slug, title, type) values ('x', 'x', 'book')$q$), 'anônimo não cria material';
  assert public.t_expect_error($q$insert into public.reading_progress (user_id, material_id, location) values ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '1')$q$), 'anônimo não grava progresso';
end $$;
rollback;

\echo '== membro não aprovado'
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from public.materials) = 1, 'não aprovado vê só o público';
  assert (select count(*) from public.profiles) = 1, 'não aprovado vê só o próprio perfil';
  assert public.t_expect_error($q$update public.profiles set role = 'admin' where id = auth.uid()$q$), 'não pode se promover a admin';
  assert public.t_expect_error($q$update public.profiles set approved = true where id = auth.uid()$q$), 'não pode se autoaprovar';
  assert public.t_expect_error($q$select public.admin_set_access(auth.uid(), 'admin', true)$q$), 'RPC de permissão exige admin';
  update public.profiles set display_name = 'Novo Membro' where id = auth.uid();
  assert (select display_name from public.profiles where id = auth.uid()) = 'Novo Membro', 'pode editar o próprio nome';
  insert into public.reading_progress (user_id, material_id, location, percent) values (auth.uid(), '10000000-0000-0000-0000-000000000001', '3', 10);
  assert public.t_expect_error($q$insert into public.reading_progress (user_id, material_id, location) values (auth.uid(), '10000000-0000-0000-0000-000000000002', '1')$q$), 'não grava progresso em restrito';
  assert public.t_expect_error($q$insert into public.favorites (user_id, material_id) values (auth.uid(), '10000000-0000-0000-0000-000000000002')$q$), 'não favorita restrito';
  assert (select count(*) from storage.objects where bucket_id = 'materials') = 1, 'não aprovado só acessa arquivo público';
end $$;
select (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000c') = 'member' as still_member \gset
\if :still_member
\else
  \echo 'FALHA: papel mudou'
  \quit 1
\endif
rollback;

\echo '== membro aprovado'
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.materials) = 2, 'aprovado vê público e restrito, não rascunho';
  assert (select count(*) from public.files) = 2, 'aprovado vê arquivos dos dois';
  assert (select count(*) from storage.objects where bucket_id = 'materials') = 2, 'aprovado acessa arquivos publicados';
  assert (select count(*) from storage.objects where name = 'draft.pdf') = 0, 'aprovado não acessa rascunho';
  assert (select count(*) from public.material_internal) = 0, 'aprovado não lê notas internas';
  assert (select count(*) from public.search_materials('Linhares')) = 1, 'busca encontra pelo autor';
  assert (select count(*) from public.search_materials('iniciacao')) = 1, 'busca ignora acentos';
  insert into public.reading_progress (user_id, material_id, location, percent) values (auth.uid(), '10000000-0000-0000-0000-000000000002', '42', 38);
  insert into public.favorites (user_id, material_id) values (auth.uid(), '10000000-0000-0000-0000-000000000002');
  assert public.t_expect_error($q$insert into public.reading_progress (user_id, material_id, location) values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', '1')$q$), 'não grava progresso em nome de outro';
  assert public.t_expect_error($q$insert into public.materials (slug, title, type) values ('y', 'y', 'book')$q$), 'membro não cria material';
  assert public.t_expect_error($q$insert into storage.objects (bucket_id, name) values ('materials', 'hack.pdf')$q$), 'membro não faz upload';
  assert public.t_expect_error($q$update public.profiles set role = 'editor' where id = auth.uid()$q$), 'membro não muda o papel';
  update public.materials set title = 'alterado' where id = '10000000-0000-0000-0000-000000000002';
  assert (select title from public.materials where id = '10000000-0000-0000-0000-000000000002') <> 'alterado', 'membro não edita material';
end $$;
rollback;

\echo '== isolamento de dados pessoais'
insert into public.reading_progress (user_id, material_id, location) values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', '9');
insert into public.annotations (user_id, material_id, location, note) values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', '9', 'privada');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.reading_progress) = 0, 'não vê progresso de outro usuário';
  assert (select count(*) from public.annotations) = 0, 'não vê anotações de outro usuário';
end $$;
rollback;

\echo '== administrador'
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.materials) = 3, 'admin vê tudo';
  assert (select internal_notes from public.material_internal limit 1) = 'nota secreta', 'admin lê notas internas';
  insert into public.materials (slug, title, type) values ('novo', 'Novo', 'pdf');
  insert into storage.objects (bucket_id, name) values ('materials', 'upload.pdf');
  perform public.admin_set_access('00000000-0000-0000-0000-00000000000c', 'member', true);
  assert (select approved from public.profiles where id = '00000000-0000-0000-0000-00000000000c'), 'admin aprova membro';
  assert public.t_expect_error($q$update public.materials set status = 'published' where slug = 'novo'$q$), 'publicar exige autorização registrada';
  assert public.t_expect_error($q$select public.admin_set_access(auth.uid(), 'member', true)$q$), 'admin não remove o próprio acesso';
end $$;
rollback;

\echo '== cursos, listas, miniaturas e estatísticas'
insert into public.materials (id, slug, title, type, status, visibility, publication_authorized) values
  ('10000000-0000-0000-0000-000000000004', 'curso', 'Curso restrito', 'course', 'published', 'restricted', true);
insert into public.materials (id, slug, title, type, status, visibility, publication_authorized, course_only) values
  ('10000000-0000-0000-0000-000000000005', 'aula-exclusiva', 'Aula exclusiva', 'handout', 'published', 'restricted', true, true);
insert into public.course_items (course_id, material_id, position) values
  ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 0),
  ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005', 1);
insert into public.course_access (course_id, user_id) values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000c');
insert into public.collections (id, user_id, name) values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Lista do membro');
insert into storage.objects (bucket_id, name) values ('covers', 'thumbs/p.jpg.webp'), ('covers', 'thumbs/r.jpg.webp');
begin;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from public.course_items) = 0, 'anônimo não vê aulas de curso restrito';
  assert (select count(*) from storage.objects where name like 'thumbs/%') = 1, 'anônimo vê só a miniatura pública';
  assert public.t_expect_error($q$select public.admin_stats(30)$q$), 'anônimo não lê estatísticas';
end $$;
rollback;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from public.course_items) = 0, 'não aprovado não vê aulas, mesmo liberado no curso';
  assert (select count(*) from public.materials where slug = 'aula-exclusiva') = 0, 'não aprovado não vê aula exclusiva';
  assert (select count(*) from public.collections) = 0, 'não vê listas de outra pessoa';
  assert public.t_expect_error($q$insert into public.collection_items (collection_id, material_id) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')$q$), 'não mexe em lista alheia';
end $$;
rollback;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.course_items) = 0, 'membro sem liberação no curso não vê as aulas';
  assert (select count(*) from public.materials where slug = 'curso') = 1, 'membro vê que o curso existe';
  assert (select count(*) from public.materials where slug = 'aula-exclusiva') = 0, 'aula exclusiva some para quem não foi liberado';
  assert not public.can_view_material('10000000-0000-0000-0000-000000000005'), 'sem acesso ao arquivo da aula exclusiva';
  assert public.course_lesson_count('10000000-0000-0000-0000-000000000004') = 2, 'vê quantas aulas o curso tem';
  assert not public.has_course_access('10000000-0000-0000-0000-000000000004'), 'sem acesso ao curso';
  insert into public.course_requests (course_id, user_id) values ('10000000-0000-0000-0000-000000000004', auth.uid());
  assert public.t_expect_error($q$insert into public.course_access (course_id, user_id) values ('10000000-0000-0000-0000-000000000004', auth.uid())$q$), 'membro não se libera sozinho';
  assert public.t_expect_error($q$insert into public.course_requests (course_id, user_id) values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000c')$q$), 'não pede acesso em nome de outra pessoa';
  assert (select count(*) from storage.objects where name like 'thumbs/%') = 2, 'membro vê as miniaturas que pode ver';
  assert public.t_expect_error($q$insert into public.course_items (course_id, material_id) values ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001')$q$), 'membro não monta curso';
  assert public.t_expect_error($q$select public.admin_stats(30)$q$), 'membro não lê estatísticas';
  assert (select count(*) from public.course_access) = 0, 'não vê quem foi liberado';
  insert into public.collection_items (collection_id, material_id) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
  assert public.t_expect_error($q$insert into public.collection_items (collection_id, material_id) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003')$q$), 'não põe rascunho na lista';
end $$;
rollback;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare st jsonb; begin
  insert into public.course_access (course_id, user_id) values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b');
  assert (select count(*) from public.course_requests) >= 0, 'equipe lê pedidos';
  st := public.admin_stats(30);
  assert (st->>'published')::int = 4, 'estatísticas contam publicados';
  assert (st->>'approved')::int = 2, 'estatísticas contam aprovados';
  insert into public.course_items (course_id, material_id, position) values ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 1);
  assert public.t_expect_error($q$insert into public.course_items (course_id, material_id) values ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004')$q$), 'curso não contém a si mesmo';
end $$;
rollback;

insert into public.course_access (course_id, user_id) values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert public.has_course_access('10000000-0000-0000-0000-000000000004'), 'liberado tem acesso ao curso';
  assert (select count(*) from public.course_items) = 2, 'liberado vê as aulas';
  assert (select count(*) from public.materials where slug = 'aula-exclusiva') = 1, 'liberado vê a aula exclusiva';
  assert (select count(*) from public.course_access) = 1, 'vê só a própria liberação';
end $$;
rollback;

\echo '== perfil, agenda, notas de voz, calendário e mensagens'
insert into public.agenda_events (user_id, day, title) values ('00000000-0000-0000-0000-00000000000c', '2026-11-15', 'compromisso de outra pessoa');
insert into public.daily_messages (entity, text, active) values ('Caboclo', 'mensagem pausada de teste', false);
insert into storage.objects (bucket_id, name) values ('notes', '00000000-0000-0000-0000-00000000000c/x/1.webm');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  insert into public.reading_pages (user_id, material_id, page) values (auth.uid(), '10000000-0000-0000-0000-000000000002', 1);
  assert public.t_expect_error($q$insert into public.reading_pages (user_id, material_id, page) values (auth.uid(), '10000000-0000-0000-0000-000000000003', 1)$q$), 'não conta página de rascunho';
  assert public.t_expect_error($q$insert into public.reading_pages (user_id, material_id, page) values ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 1)$q$), 'não conta página por outra pessoa';
  perform public.log_listening('10000000-0000-0000-0000-000000000002', 5000);
  assert (select seconds from public.listening_time) = 120, 'cada registro de escuta vale no máximo 2 minutos';
  perform public.log_listening('10000000-0000-0000-0000-000000000003', 60);
  assert (select count(*) from public.listening_time) = 1, 'não registra escuta de material sem acesso';
  assert public.t_expect_error($q$insert into public.listening_time (user_id, material_id, seconds) values (auth.uid(), '10000000-0000-0000-0000-000000000001', 99999)$q$), 'não grava minutos direto na tabela';
  assert (select count(*) from public.agenda_events) = 0, 'não vê a agenda de outra pessoa';
  insert into public.agenda_events (user_id, day, title) values (auth.uid(), '2026-11-15', 'Gira');
  assert (select count(*) from public.agenda_events) = 1, 'vê a própria agenda';
  assert (select count(*) from public.calendar_dates) > 0, 'membro lê as datas da religião';
  assert public.t_expect_error($q$insert into public.calendar_dates (month, day, title) values (1, 1, 'x')$q$), 'membro não edita datas';
  assert (select count(*) from public.daily_messages where not active) = 0, 'mensagens pausadas não aparecem';
  assert public.t_expect_error($q$insert into public.daily_messages (entity, text) values ('Exu', 'mensagem inventada pelo membro')$q$), 'membro não cria mensagem';
  assert (select count(*) from storage.objects where bucket_id = 'notes') = 0, 'não ouve nota de voz de outra pessoa';
  insert into storage.objects (bucket_id, name) values ('notes', auth.uid()::text || '/m/1.webm');
  assert public.t_expect_error($q$insert into storage.objects (bucket_id, name) values ('notes', '00000000-0000-0000-0000-00000000000c/m/2.webm')$q$), 'não grava na pasta de outra pessoa';
end $$;
rollback;
begin;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from public.daily_messages) > 0, 'visitante vê a mensagem do dia';
  assert (select count(*) from public.agenda_events) = 0, 'visitante não vê agendas';
  assert public.t_expect_error($q$select public.log_listening('10000000-0000-0000-0000-000000000001', 60)$q$), 'visitante não registra escuta';
end $$;
rollback;

\echo '== sincronizar agenda (link de calendário)'
insert into public.calendar_feeds (user_id, token) values ('00000000-0000-0000-0000-00000000000c', repeat('c', 64));
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ declare t text; t2 text; begin
  assert (select count(*) from public.calendar_feeds) = 0, 'não vê o link de outra pessoa';
  assert public.t_expect_error($q$insert into public.calendar_feeds (user_id, token) values (auth.uid(), repeat('a', 64))$q$), 'não escolhe o próprio token';
  insert into public.agenda_events (user_id, day, title) values (auth.uid(), current_date, 'Gira de teste');
  t := public.rotate_calendar_feed();
  assert length(t) = 64, 'token longo';
  assert (public.calendar_feed(t)->'events'->0->>'title') = 'Gira de teste', 'link traz os próprios compromissos';
  assert json_array_length(public.calendar_feed(t)->'events') = 1, 'link não traz compromissos de outra pessoa';
  t2 := public.rotate_calendar_feed();
  assert public.calendar_feed(t) is null, 'link antigo para de funcionar';
  assert public.calendar_feed(t2) is not null, 'link novo funciona';
  delete from public.calendar_feeds;
  assert public.calendar_feed(t2) is null, 'desligar apaga o link';
end $$;
rollback;
begin;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert json_array_length(public.calendar_feed(repeat('c', 64))->'events') = 1, 'app de calendário lê pelo token';
  assert json_array_length(public.calendar_feed(repeat('c', 64))->'holy') > 0, 'link traz as datas da religião';
  assert public.calendar_feed(repeat('d', 64)) is null, 'token errado não traz nada';
  assert public.calendar_feed('') is null, 'token vazio não traz nada';
  assert (select count(*) from public.calendar_feeds) = 0, 'visitante não lista links';
  assert public.t_expect_error($q$select public.rotate_calendar_feed()$q$), 'visitante não cria link';
end $$;
rollback;

\echo '== avaliações e resenhas'
insert into public.reviews (material_id, user_id, rating, body) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 5, 'resenha do admin');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.reviews) = 1, 'membro lê as avaliações';
  insert into public.reviews (material_id, user_id, rating, body) values ('10000000-0000-0000-0000-000000000002', auth.uid(), 4, 'boa leitura');
  assert public.t_expect_error($q$insert into public.reviews (material_id, user_id, rating) values ('10000000-0000-0000-0000-000000000002', auth.uid(), 3)$q$), 'só uma avaliação por material';
  assert public.t_expect_error($q$insert into public.reviews (material_id, user_id, rating) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 6)$q$), 'nota acima de 5';
  assert public.t_expect_error($q$insert into public.reviews (material_id, user_id, rating) values ('10000000-0000-0000-0000-000000000003', auth.uid(), 3)$q$), 'não avalia rascunho';
  assert public.t_expect_error($q$insert into public.reviews (material_id, user_id, rating) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 1)$q$), 'não avalia em nome de outra pessoa';
  update public.reviews set rating = 1 where user_id = '00000000-0000-0000-0000-00000000000a';
  assert (select rating from public.reviews where user_id = '00000000-0000-0000-0000-00000000000a') = 5, 'não altera avaliação de outra pessoa';
  delete from public.reviews where user_id = '00000000-0000-0000-0000-00000000000a';
  assert (select count(*) from public.reviews where user_id = '00000000-0000-0000-0000-00000000000a') = 1, 'não apaga avaliação de outra pessoa';
  update public.reviews set rating = 2 where user_id = auth.uid();
  assert (select rating from public.reviews where user_id = auth.uid()) = 2, 'edita a própria avaliação';
  assert public.t_expect_error($q$update public.reviews set user_id = '00000000-0000-0000-0000-00000000000c' where user_id = auth.uid()$q$), 'não troca o dono';
  assert (select author from public.material_reviews('10000000-0000-0000-0000-000000000001')) = 'admin', 'lista mostra o nome de quem avaliou';
  assert (select count(*) from public.material_reviews('10000000-0000-0000-0000-000000000002') where mine) = 1, 'marca a própria avaliação';
end $$;
rollback;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from public.reviews) = 0, 'não aprovado não lê avaliações';
  assert (select count(*) from public.material_reviews('10000000-0000-0000-0000-000000000001')) = 0, 'não aprovado não lista avaliações';
  assert public.t_expect_error($q$insert into public.reviews (material_id, user_id, rating) values ('10000000-0000-0000-0000-000000000001', auth.uid(), 1)$q$), 'não aprovado não avalia';
end $$;
rollback;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  delete from public.reviews where user_id = '00000000-0000-0000-0000-00000000000a';
  assert (select count(*) from public.reviews) = 0, 'equipe pode remover avaliações';
end $$;
rollback;
begin;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from public.reviews) = 0, 'visitante não lê avaliações';
  assert public.t_expect_error($q$select * from public.material_reviews('10000000-0000-0000-0000-000000000001')$q$), 'visitante não chama a lista';
end $$;
rollback;

\echo '== leituras iniciadas e concluídas'
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  perform public.start_material('10000000-0000-0000-0000-000000000001', 'read');
  perform public.start_material('10000000-0000-0000-0000-000000000001', 'read');
  assert (select started from public.material_read_counts('10000000-0000-0000-0000-000000000001') where kind = 'read') = 1, 'reabrir sem concluir não conta outra vez';
  perform public.complete_material('10000000-0000-0000-0000-000000000001', 'read');
  perform public.complete_material('10000000-0000-0000-0000-000000000001', 'read');
  assert (select completed from public.material_read_counts('10000000-0000-0000-0000-000000000001') where kind = 'read') = 1, 'conclusão repetida não conta duas vezes';
  perform public.start_material('10000000-0000-0000-0000-000000000001', 'read');
  assert (select started from public.material_read_counts('10000000-0000-0000-0000-000000000001') where kind = 'read') = 2, 'reler depois de concluir conta nova vez';
  perform public.start_material('10000000-0000-0000-0000-000000000003', 'read');
  perform public.start_material('10000000-0000-0000-0000-000000000001', 'hack');
  assert (select count(*) from public.material_reads) = 2, 'não conta rascunho nem tipo inválido';
  assert public.t_expect_error($q$insert into public.material_reads (user_id, material_id, kind) values (auth.uid(), '10000000-0000-0000-0000-000000000001', 'read')$q$), 'não grava contagem direto na tabela';
  assert public.t_expect_error($q$update public.material_reads set completed_at = now()$q$), 'não marca conclusão direto';
end $$;
rollback;
insert into public.material_reads (user_id, material_id, kind, completed_at) values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'read', now());
begin;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from public.material_read_counts('10000000-0000-0000-0000-000000000001')) = 0, 'visitante vê totais do material público (zero)';
  assert (select count(*) from public.material_read_counts('10000000-0000-0000-0000-000000000002')) = 0, 'visitante não vê totais de material restrito';
  assert (select count(*) from public.material_reads) = 0, 'visitante não lê as linhas';
  assert public.t_expect_error($q$select public.start_material('10000000-0000-0000-0000-000000000001', 'read')$q$), 'visitante não registra leitura';
end $$;
rollback;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select completed from public.material_read_counts('10000000-0000-0000-0000-000000000002')) = 1, 'membro vê os totais';
  assert (select count(*) from public.material_reads) = 0, 'membro não vê quem leu';
end $$;
rollback;

\echo '== ofensiva e lembrete diário'
delete from public.study_days;
insert into public.study_days (user_id, day) values
  ('00000000-0000-0000-0000-00000000000c', public.today_br()),
  ('00000000-0000-0000-0000-00000000000b', public.today_br() - 1), ('00000000-0000-0000-0000-00000000000b', public.today_br() - 2),
  ('00000000-0000-0000-0000-00000000000b', public.today_br() - 5), ('00000000-0000-0000-0000-00000000000b', public.today_br() - 6),
  ('00000000-0000-0000-0000-00000000000b', public.today_br() - 7);
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-00000000000c', 'https://push.example/outro', 'k', 'a');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ declare s json; begin
  s := public.my_streak();
  assert (s->>'current')::int = 2, 'ofensiva continua viva até o fim de hoje (estudou ontem e anteontem)';
  assert (s->>'best')::int = 3, 'recorde de 3 dias';
  assert not (s->>'today')::boolean, 'ainda não estudou hoje';
  assert json_array_length(s->'week') = 7, 'mostra 7 dias';
  assert (s->>'last_day')::date = public.today_br() - 1, 'último dia estudado';
  assert (s->>'last_run')::int = 2, 'dias seguidos até o último estudo';
  assert (s->>'last_week')::int = 5, 'dias estudados nos 7 dias até o último estudo';
  insert into public.reading_progress (user_id, material_id, location) values (auth.uid(), '10000000-0000-0000-0000-000000000001', '1')
    on conflict (user_id, material_id) do update set location = excluded.location;
  s := public.my_streak();
  assert (s->>'current')::int = 3 and (s->>'today')::boolean, 'ler hoje soma um dia na ofensiva';
  assert (select count(*) from public.study_days) = 6, 'vê só os próprios dias';
  assert public.t_expect_error($q$insert into public.study_days (user_id, day) values (auth.uid(), public.today_br() - 3)$q$), 'não marca dia estudado à mão';
  assert public.t_expect_error($q$select public.streak_of('00000000-0000-0000-0000-00000000000c')$q$), 'não consulta a ofensiva de outra pessoa';
  assert (select count(*) from public.push_subscriptions) = 0, 'não vê inscrições de outra pessoa';
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, hour) values (auth.uid(), 'https://push.example/meu', 'k', 'a', 8);
  update public.push_subscriptions set hour = 21 where user_id = auth.uid();
  assert (select hour from public.push_subscriptions) = 21, 'muda o próprio horário';
  assert public.t_expect_error($q$update public.push_subscriptions set last_sent_on = current_date$q$), 'não mexe no controle de envio';
  assert public.t_expect_error($q$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-00000000000c', 'https://push.example/x', 'k', 'a')$q$), 'não inscreve outra pessoa';
  assert public.t_expect_error($q$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), 'http://inseguro', 'k', 'a')$q$), 'só endereço https';
  assert (select count(*) from public.streak_phrases) >= 30, 'lê as 30 frases';
  assert public.t_expect_error($q$insert into public.streak_phrases (text) values ('frase inventada pelo membro')$q$), 'membro não cria frase';
  assert public.push_subscriber_count() is null, 'membro não vê o total de inscritos';
end $$;
rollback;
begin;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert public.t_expect_error($q$select public.my_streak()$q$), 'visitante não tem ofensiva';
  assert (select count(*) from public.streak_phrases) = 0, 'visitante não lê as frases';
  assert (select count(*) from public.push_subscriptions) = 0, 'visitante não vê inscrições';
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert public.push_subscriber_count() = 1, 'equipe vê quantos aparelhos ligaram o lembrete';
  assert (select count(*) from public.push_subscriptions) = 0, 'equipe não vê os endereços de push';
end $$;
rollback;

\echo '== caderno de estudos'
insert into public.notebook_pages (user_id, title) values ('00000000-0000-0000-0000-00000000000c', 'folha de outra pessoa');
insert into storage.objects (bucket_id, name) values ('caderno', '00000000-0000-0000-0000-00000000000c/p/1.jpg');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ declare pid uuid; begin
  assert (select count(*) from public.notebook_pages) = 0, 'não vê o caderno de outra pessoa';
  insert into public.notebook_pages (user_id, title) values (auth.uid(), 'Minha folha') returning id into pid;
  update public.notebook_pages set content = '{"items":[{"id":"a","kind":"text","x":1,"y":2,"w":200,"text":"oi","color":"amarelo"}],"links":[]}', updated_at = now() where id = pid;
  assert (select content->'items'->0->>'text' from public.notebook_pages where id = pid) = 'oi', 'salva o conteúdo da folha';
  assert public.t_expect_error($q$insert into public.notebook_pages (user_id, title) values ('00000000-0000-0000-0000-00000000000c', 'x')$q$), 'não cria folha para outra pessoa';
  assert public.t_expect_error($q$update public.notebook_pages set user_id = '00000000-0000-0000-0000-00000000000c'$q$), 'não troca o dono da folha';
  update public.notebook_pages set title = 'invadida' where user_id = '00000000-0000-0000-0000-00000000000c';
  delete from public.notebook_pages where user_id = '00000000-0000-0000-0000-00000000000c';
  assert (select count(*) from public.notebook_pages) = 1, 'só vê a própria folha';
  assert (select count(*) from storage.objects where bucket_id = 'caderno') = 0, 'não vê imagens do caderno de outra pessoa';
  insert into storage.objects (bucket_id, name) values ('caderno', auth.uid()::text || '/p/1.jpg');
  assert public.t_expect_error($q$insert into storage.objects (bucket_id, name) values ('caderno', '00000000-0000-0000-0000-00000000000c/p/2.jpg')$q$), 'não grava imagem na pasta de outra pessoa';
  assert public.t_expect_error($q$update public.notebook_pages set content = jsonb_build_object('items', (select jsonb_agg(jsonb_build_object('t', repeat(md5(g::text), 40))) from generate_series(1, 400) g), 'links', '[]'::jsonb)$q$), 'folha grande demais é recusada';
end $$;
rollback;
do $$ begin
  assert (select title from public.notebook_pages where user_id = '00000000-0000-0000-0000-00000000000c') = 'folha de outra pessoa', 'folha de outra pessoa intacta';
end $$;
begin;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from public.notebook_pages) = 0, 'visitante não vê cadernos';
  assert public.t_expect_error($q$insert into public.notebook_pages (title) values ('x')$q$), 'visitante não cria folha';
end $$;
rollback;

\echo '== sugestões de materiais'
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ declare sid uuid; begin
  insert into public.material_suggestions (user_id, title, kind, link) values (auth.uid(), 'Livro sugerido', 'livro', 'https://exemplo.org') returning id into sid;
  assert (select count(*) from public.material_suggestions) = 1, 'membro vê a própria sugestão';
  assert public.t_expect_error($q$insert into public.material_suggestions (user_id, title) values ('00000000-0000-0000-0000-00000000000c', 'x y')$q$), 'não sugere em nome de outra pessoa';
  assert public.t_expect_error($q$insert into public.material_suggestions (user_id, title, status) values (auth.uid(), 'já aprovada', 'adicionada')$q$), 'membro não marca a própria como adicionada';
  assert public.t_expect_error($q$insert into public.material_suggestions (user_id, title, link) values (auth.uid(), 'link estranho', 'javascript:alert(1)')$q$), 'só aceita link http(s)';
  for i in 2..10 loop insert into public.material_suggestions (user_id, title) values (auth.uid(), 'sugestão ' || i); end loop;
  assert public.t_expect_error($q$insert into public.material_suggestions (user_id, title) values (auth.uid(), 'a décima primeira')$q$), 'limite de 10 por dia';
  delete from public.material_suggestions where id = sid;
  assert (select count(*) from public.material_suggestions) = 9, 'retira a própria sugestão nova';
end $$;
rollback;
insert into public.material_suggestions (user_id, title) values ('00000000-0000-0000-0000-00000000000b', 'Sugestão do membro');
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from public.material_suggestions) = 0, 'não vê sugestões de outras pessoas';
  insert into public.material_suggestions (user_id, title) values (auth.uid(), 'de quem aguarda aprovação');
  assert (select count(*) from public.material_suggestions) = 1, 'quem aguarda aprovação também sugere (e só vê a sua)';
end $$;
rollback;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.material_suggestions) = 1, 'equipe vê as sugestões';
  update public.material_suggestions set status = 'adicionada', admin_note = 'Já está no acervo!';
  assert (select status from public.material_suggestions) = 'adicionada', 'equipe muda a situação';
end $$;
rollback;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  update public.material_suggestions set status = 'analisando' where true;
exception when others then null; end $$;
do $$ begin
  assert (select status from public.material_suggestions) = 'nova', 'membro não altera a situação';
end $$;
rollback;
begin;
set local role anon;
set local request.jwt.claim.sub = '';
do $$ begin
  assert (select count(*) from public.material_suggestions) = 0, 'visitante não vê sugestões';
  assert public.t_expect_error($q$insert into public.material_suggestions (title) values ('anônima')$q$), 'visitante não sugere';
end $$;
rollback;

\echo 'Todos os testes de RLS passaram.'
