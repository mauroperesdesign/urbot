-- Estrutura inicial de categorias (editável pelo painel administrativo)
with tree(parent_slug, slug, name, position) as (values
  (null, 'fundamentos-e-historia', 'Fundamentos e história', 1),
    ('fundamentos-e-historia', 'historia-da-umbanda', 'História da Umbanda', 1),
    ('fundamentos-e-historia', 'fundamentos-da-umbanda', 'Fundamentos da Umbanda', 2),
    ('fundamentos-e-historia', 'escolas-e-vertentes', 'Escolas e vertentes', 3),
    ('fundamentos-e-historia', 'linhagens-e-tradicoes', 'Linhagens e tradições', 4),
    ('fundamentos-e-historia', 'etica-e-pratica-religiosa', 'Ética e prática religiosa', 5),
  (null, 'orixas', 'Orixás', 2),
    ('orixas', 'orixas-geral', 'Orixás (geral)', 0),
    ('orixas', 'oxala', 'Oxalá', 1), ('orixas', 'ogum', 'Ogum', 2), ('orixas', 'oxossi', 'Oxóssi', 3),
    ('orixas', 'xango', 'Xangô', 4), ('orixas', 'iemanja', 'Iemanjá', 5), ('orixas', 'oxum', 'Oxum', 6),
    ('orixas', 'iansa', 'Iansã', 7), ('orixas', 'obaluaie-e-omolu', 'Obaluaiê e Omolu', 8),
    ('orixas', 'nana', 'Nanã', 9), ('orixas', 'exu-orixa', 'Exu e demais temas relacionados', 10),
  (null, 'linhas-de-trabalho', 'Linhas de trabalho', 3),
    ('linhas-de-trabalho', 'caboclos', 'Caboclos', 1), ('linhas-de-trabalho', 'pretos-velhos', 'Pretos-velhos', 2),
    ('linhas-de-trabalho', 'eres-e-criancas', 'Erês e crianças', 3), ('linhas-de-trabalho', 'exus', 'Exus', 4),
    ('linhas-de-trabalho', 'pombagiras', 'Pombagiras', 5), ('linhas-de-trabalho', 'malandros', 'Malandros', 6),
    ('linhas-de-trabalho', 'marinheiros', 'Marinheiros', 7), ('linhas-de-trabalho', 'boiadeiros', 'Boiadeiros', 8),
    ('linhas-de-trabalho', 'baianos', 'Baianos', 9), ('linhas-de-trabalho', 'ciganos', 'Ciganos', 10),
    ('linhas-de-trabalho', 'outras-linhas', 'Outras linhas e manifestações', 11),
  (null, 'estudos-e-praticas', 'Estudos e práticas', 4),
    ('estudos-e-praticas', 'ervas-e-folhas', 'Ervas e folhas', 1),
    ('estudos-e-praticas', 'banhos-e-defumacoes', 'Banhos e defumações', 2),
    ('estudos-e-praticas', 'pontos-cantados', 'Pontos cantados', 3),
    ('estudos-e-praticas', 'pontos-riscados-e-pemba', 'Pontos riscados e pemba', 4),
    ('estudos-e-praticas', 'toques-e-instrumentos', 'Toques e instrumentos', 5),
    ('estudos-e-praticas', 'oferendas-e-fundamentos', 'Oferendas e fundamentos', 6),
    ('estudos-e-praticas', 'elementos-ritualisticos', 'Elementos ritualísticos', 7),
    ('estudos-e-praticas', 'guias-e-firmezas', 'Guias e firmezas', 8),
    ('estudos-e-praticas', 'oracoes-e-benzimentos', 'Orações e benzimentos', 9),
    ('estudos-e-praticas', 'mediunidade-e-desenvolvimento', 'Mediunidade e desenvolvimento', 10),
    ('estudos-e-praticas', 'umbanda-no-lar', 'Umbanda no lar', 11),
    ('estudos-e-praticas', 'historia-oral', 'História oral e memória religiosa', 12),
  (null, 'materiais-educacionais', 'Materiais educacionais', 5),
    ('materiais-educacionais', 'cursos', 'Cursos', 1),
    ('materiais-educacionais', 'curso-teo-2-0', 'Curso TEO 2.0', 2),
    ('materiais-educacionais', 'apostilas', 'Apostilas', 3),
    ('materiais-educacionais', 'videoaulas', 'Videoaulas', 4),
    ('materiais-educacionais', 'audiobooks', 'Audiobooks', 5),
    ('materiais-educacionais', 'dicionarios-e-glossarios', 'Dicionários e glossários', 6),
    ('materiais-educacionais', 'artigos-e-pesquisas', 'Artigos e pesquisas', 7),
    ('materiais-educacionais', 'romances-e-narrativas', 'Romances e narrativas', 8),
    ('materiais-educacionais', 'documentarios', 'Documentários', 9),
    ('materiais-educacionais', 'materiais-de-referencia', 'Materiais de referência', 10),
  (null, 'tradicoes-de-matriz-africana', 'Tradições de matriz africana', 6),
    ('tradicoes-de-matriz-africana', 'oraculos-e-jogo-de-buzios', 'Oráculos e jogo de búzios', 1),
    ('tradicoes-de-matriz-africana', 'ioruba-e-ifa', 'Iorubá e Ifá', 2),
    ('tradicoes-de-matriz-africana', 'kimbanda', 'Kimbanda', 3),
  (null, 'a-identificar', 'A identificar', 99),
    ('a-identificar', 'revisar', 'Revisar', 1)
)
, roots as (
  insert into public.categories (slug, name, position)
  select slug, name, position from tree where parent_slug is null
  on conflict (slug) do nothing
  returning id, slug
)
insert into public.categories (parent_id, slug, name, position)
select r.id, t.slug, t.name, t.position
from tree t join roots r on r.slug = t.parent_slug
on conflict (slug) do nothing;

update public.categories set description = 'Candomblé, Ifá, tradição iorubá, Kimbanda e Quimbanda — identificados como tradições próprias, não como Umbanda.'
where slug = 'tradicoes-de-matriz-africana';
