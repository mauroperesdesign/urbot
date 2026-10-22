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

\echo 'Todos os testes de RLS passaram.'
