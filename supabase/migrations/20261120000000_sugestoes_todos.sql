-- Sugestões de materiais abertas a todas as pessoas com conta (inclusive quem aguarda aprovação),
-- para a equipe saber o que o público quer estudar. Continua: só a própria pessoa e a equipe veem,
-- no máximo 10 por dia, e visitantes sem conta não sugerem.
drop policy if exists suggestions_insert on public.material_suggestions;
create policy suggestions_insert on public.material_suggestions for insert
  with check (auth.uid() is not null and user_id = auth.uid() and status = 'nova' and admin_note is null);
