"""Gera o catálogo deduplicado do export do Telegram (result.json).

Uso: python3 -I build_catalog.py <result.json> <saida_dir>
Duplicatas: mesmo tamanho de arquivo (mesmo conteúdo) ou mesmo nome.
Autores só quando constam no nome do arquivo (nada inventado).
"""
import csv, json, os, sys, unicodedata, re
from collections import OrderedDict

src, out = sys.argv[1], sys.argv[2]
msgs = [m for m in json.load(open(src, encoding="utf-8"))["messages"] if "file_name" in m]

F, H, O, L, E, M, T, X = (
    "Fundamentos e história", "Fundamentos e história", "Orixás", "Linhas de trabalho",
    "Estudos e práticas", "Materiais educacionais", "Tradições de matriz africana", "A identificar")

# id -> (titulo, autor, tipo, categoria, subcategoria, tradicao, idioma, observacao)
META = {
 1622: ("Iniciação à Umbanda", "Ronaldo Linhares", "Livro", F, "Fundamentos da Umbanda", "Umbanda", "pt", ""),
 1639: ("Umbanda Sagrada", "", "Livro", F, "Fundamentos da Umbanda", "Umbanda", "pt", "Autor a confirmar"),
 1716: ("O Espiritismo, a Magia e as Sete Linhas de Umbanda", "Leal de Souza", "Livro", H, "História da Umbanda", "Umbanda", "pt", "Há outro arquivo da mesma obra (271 KB) — mantido o maior"),
 1749: ("História da Umbanda: uma religião brasileira", "", "Livro", H, "História da Umbanda", "Umbanda", "pt", "Autor a confirmar"),
 1750: ("7 Linhas na Umbanda", "", "Livro", F, "Fundamentos da Umbanda", "Umbanda", "pt", "Autor a confirmar"),
 1710: ("Ensinamentos Básicos de Umbanda", "", "Livro", F, "Fundamentos da Umbanda", "Umbanda", "pt", "Autor a confirmar"),
 1729: ("Umbanda Descomplicada", "", "Livro", F, "Fundamentos da Umbanda", "Umbanda", "pt", "Autor a confirmar"),
 1730: ("Umbanda para Iniciantes", "", "Livro", F, "Fundamentos da Umbanda", "Umbanda", "pt", "Autor a confirmar"),
 1731: ("Umbanda, Simplesmente Umbanda", "", "Livro", F, "Fundamentos da Umbanda", "Umbanda", "pt", "Autor a confirmar"),
 1732: ("Umbandas", "", "Livro", F, "Escolas e vertentes", "Umbanda", "pt", "Autor e conteúdo a confirmar"),
 1748: ("Aruanda", "", "Livro", F, "Fundamentos da Umbanda", "Umbanda", "pt", "Título e autor a confirmar"),
 1728: ("Um Velho Novo na Umbanda", "", "Livro", F, "Fundamentos da Umbanda", "Umbanda", "pt", "Autor a confirmar"),
 1727: ("Turma de Aruanda — Teologia e Sacerdócio", "", "Livro", F, "Ética e prática religiosa", "Umbanda", "pt", "Autor a confirmar"),
 1753: ("Conhecendo Crenças e Religiões — Umbanda", "", "Apostila", F, "Fundamentos da Umbanda", "Umbanda", "pt", "Autor a confirmar"),
 # Orixás
 1735: ("Características dos Filhos e Filhas de Iansã", "", "Apostila", O, "Iansã", "Umbanda", "pt", ""),
 1736: ("Características dos Filhos e Filhas de Iemanjá", "", "Apostila", O, "Iemanjá", "Umbanda", "pt", ""),
 1737: ("Características dos Filhos e Filhas de Nanã", "", "Apostila", O, "Nanã", "Umbanda", "pt", ""),
 1738: ("Características dos Filhos e Filhas de Obaluaiê", "", "Apostila", O, "Obaluaiê e Omolu", "Umbanda", "pt", ""),
 1740: ("Características dos Filhos e Filhas de Omolu", "", "Apostila", O, "Obaluaiê e Omolu", "Umbanda", "pt", ""),
 1739: ("Características dos Filhos e Filhas de Ogum", "", "Apostila", O, "Ogum", "Umbanda", "pt", ""),
 1741: ("Características dos Filhos e Filhas de Oxalá", "", "Apostila", O, "Oxalá", "Umbanda", "pt", ""),
 1742: ("Características dos Filhos e Filhas de Oxóssi", "", "Apostila", O, "Oxóssi", "Umbanda", "pt", ""),
 1743: ("Características dos Filhos e Filhas de Oxum", "", "Apostila", O, "Oxum", "Umbanda", "pt", ""),
 1744: ("Características dos Filhos e Filhas de Xangô", "", "Apostila", O, "Xangô", "Umbanda", "pt", ""),
 1745: ("Características dos Filhos e Filhas dos Orixás — Coletânea", "", "Apostila", O, "Orixás (geral)", "Umbanda", "pt", ""),
 1724: ("Sob o Olhar do seu Orixá", "", "Livro", O, "Orixás (geral)", "Umbanda", "pt", "Autor a confirmar"),
 # Linhas de trabalho
 1636: ("Saravá Linha das Almas", "N. A. Molina", "Livro", L, "Pretos-velhos", "Umbanda", "pt", ""),
 1637: ("Preto-Velho", "", "Livro", L, "Pretos-velhos", "Umbanda", "pt", "Título e autor a confirmar"),
 1634: ("Feitiços de Preto-Velho", "", "Livro", L, "Pretos-velhos", "Umbanda", "pt", "Autor a confirmar"),
 1723: ("Sabedoria de Preto-Velho", "", "Livro", L, "Pretos-velhos", "Umbanda", "pt", "Autor a confirmar"),
 1651: ("De Exu a Preto-Velho", "Daniel Luconi", "Livro", L, "Exus", "Umbanda", "pt", "Também: Pretos-velhos"),
 1635: ("Diálogo com um Executor", "Rubens Saraceni", "Livro", L, "Exus", "Umbanda", "pt", ""),
 1711: ("Exu na Umbanda", "", "Livro", L, "Exus", "Umbanda", "pt", "Autor a confirmar"),
 1712: ("Exu te Ama", "", "Livro", L, "Exus", "Umbanda", "pt", "Autor a confirmar"),
 1713: ("Lendas de Exu", "", "Livro", L, "Exus", "Umbanda", "pt", "Autor a confirmar"),
 1715: ("No Reino de Exu — A Retificação do Destino", "", "Livro", L, "Exus", "Umbanda", "pt", "Autor a confirmar"),
 1717: ("O Livro da Esquerda na Umbanda", "", "Livro", L, "Exus", "Umbanda", "pt", "Autor a confirmar"),
 1726: ("Turma de Aruanda — Parte III: Povo da Calunga", "", "Livro", L, "Exus", "Umbanda", "pt", "Autor a confirmar"),
 1746: ("Ciganos na Umbanda", "", "Livro", L, "Ciganos", "Umbanda", "pt", "Autor a confirmar"),
 1733: ("Zé do Laço", "", "Livro", L, "Boiadeiros", "Umbanda", "pt", "Classificação e autor a confirmar"),
 # Estudos e práticas
 1616: ("Origem da Pemba", "Autor desconhecido", "Apostila", E, "Pontos riscados e pemba", "Umbanda", "pt", "Material de cambono"),
 1617: ("Pemba — A Grafia Sagrada", "", "Livro", E, "Pontos riscados e pemba", "Umbanda", "pt", "Autor a confirmar"),
 1642: ("Pontos Riscados na Umbanda", "Manoel Lopes", "Livro", E, "Pontos riscados e pemba", "Umbanda", "pt", "Arquivo 32"),
 1645: ("Pontos Riscados na Umbanda (2)", "Manoel Lopes", "Livro", E, "Pontos riscados e pemba", "Umbanda", "pt", "Arquivo 38 — conferir se é outra parte/edição"),
 1643: ("Entrevista sobre Pontos Riscados feita com Entidade", "Mãe Lucília", "Artigo", E, "Pontos riscados e pemba", "Umbanda", "pt", "Nome da autora truncado no arquivo"),
 1644: ("A Magia do Ponto Riscado na Umbanda Esotérica", "Osvaldo Olavo Ortiz Solera", "Pesquisa", E, "Pontos riscados e pemba", "Umbanda Esotérica", "pt", "TCC; 5 cópias com nomes diferentes"),
 1647: ("400 Pontos Riscados", "Editora Eco", "Livro", E, "Pontos riscados e pemba", "Umbanda", "pt", ""),
 1650: ("Estudo sobre Pontos Riscados", "Centro Espírita João Vicente", "Apostila", E, "Pontos riscados e pemba", "Umbanda", "pt", ""),
 1719: ("As Ervas na Umbanda", "", "Livro", E, "Ervas e folhas", "Umbanda", "pt", "Autor a confirmar"),
 1718: ("A Floresta Sagrada de Ossaim", "", "Livro", E, "Ervas e folhas", "", "pt", "Autor e tradição a confirmar"),
 1722: ("Rituais de Saúde na Umbanda: Ervas, Benzimentos, Elementos Naturais", "", "Livro", E, "Ervas e folhas", "Umbanda", "pt", "Autor a confirmar"),
 1752: ("Aprendendo Botânica com as Plantas Medicinais", "", "Livro", E, "Ervas e folhas", "", "pt", "Autor a confirmar"),
 1747: ("Banhos de Umbanda", "", "Livro", E, "Banhos e defumações", "Umbanda", "pt", "Autor a confirmar"),
 1734: ("Cantigas de Umbanda e Candomblé", "", "Livro", E, "Pontos cantados", "", "pt", "Autor a confirmar"),
 1725: ("Tambores de Angola", "", "Livro", E, "Toques e instrumentos", "", "pt", "Classificação e autor a confirmar"),
 1721: ("Orações Umbandistas", "", "Livro", E, "Orações e benzimentos", "Umbanda", "pt", "Autor a confirmar"),
 1709: ("Diário de uma Benzedeira", "", "Livro", E, "Orações e benzimentos", "", "pt", "Autor a confirmar"),
 1720: ("As Propriedades Curativas dos Cristais e das Pedras Preciosas", "", "Livro", E, "Elementos ritualísticos", "", "pt", "Autor a confirmar"),
 1630: ("Piromancia", "Cedrec", "Apostila", E, "Elementos ritualísticos", "", "pt", ""),
 1708: ("Técnica da Mediunidade", "Torres Pastorino", "Livro", E, "Mediunidade e desenvolvimento", "Espiritismo", "pt", ""),
 1714: ("Mediunidade na Umbanda", "", "Livro", E, "Mediunidade e desenvolvimento", "Umbanda", "pt", "Autor a confirmar"),
 1751: ("Não Chuta que é Macumba: o desenvolvimento mediúnico na Umbanda", "", "Pesquisa", E, "Mediunidade e desenvolvimento", "Umbanda", "pt", "Autor a confirmar"),
 # Materiais educacionais
 1648: ("Apostila TEO 2.0 — Aula 06 (C)", "", "Apostila", M, "Curso TEO 2.0", "", "pt", "Agrupar como curso"),
 1623: ("Apostila TEO 2.0 — Aula 10", "", "Apostila", M, "Curso TEO 2.0", "", "pt", "Agrupar como curso"),
 1624: ("Apostila TEO 2.0 — Aula 11", "", "Apostila", M, "Curso TEO 2.0", "", "pt", "Agrupar como curso"),
 1625: ("Apostila TEO 2.0 — Aula 15", "", "Apostila", M, "Curso TEO 2.0", "", "pt", "Agrupar como curso"),
 1626: ("Apostila TEO 2.0 — Aula 16", "", "Apostila", M, "Curso TEO 2.0", "", "pt", "Agrupar como curso"),
 1628: ("Apostila TEO 2.0 — Aula 17", "", "Apostila", M, "Curso TEO 2.0", "", "pt", "Agrupar como curso"),
 1627: ("Apostila TEO 2.0 — Aula 18", "", "Apostila", M, "Curso TEO 2.0", "", "pt", "Agrupar como curso"),
 1629: ("Apostila TEO 2.0 — Aula 19", "", "Apostila", M, "Curso TEO 2.0", "", "pt", "Agrupar como curso"),
 1640: ("Dicionário Banto-Iorubá-Português — Vol. 1", "", "Glossário", M, "Dicionários e glossários", "", "pt", "Arquivo de 9 KB — provavelmente corrompido ou incompleto"),
 1631: ("Diáspora Africana, Ancestralidade e a Tradição Religiosa dos Candomblés", "", "Artigo", M, "Artigos e pesquisas", "Candomblé", "pt", "Autor a confirmar"),
 1632: ("Dossiê (9213)", "", "Artigo", M, "Artigos e pesquisas", "", "pt", "Título e tema a identificar"),
 1633: ("Ancestralidade", "", "Livro", M, "Artigos e pesquisas", "", "pt", "Autor a confirmar"),
 1682: ("As Religiões no Rio", "", "Livro", M, "Artigos e pesquisas", "", "pt", "Autor a confirmar"),
 # Tradições de matriz africana (contexto próprio, não Umbanda)
 1678: ("Awo — O Mistério dos Orixás", "", "Livro", T, "Iorubá e Ifá", "Tradição iorubá", "pt", "Autor a confirmar"),
 1677: ("Oriki", "", "Livro", T, "Iorubá e Ifá", "Tradição iorubá", "pt", "Autor a confirmar"),
 1679: ("History of Yoruba Land", "", "Livro", T, "Iorubá e Ifá", "Tradição iorubá", "en", "Autor a confirmar"),
 1681: ("Guía Práctica de la Lengua Yorubá", "", "Glossário", T, "Iorubá e Ifá", "Tradição iorubá", "es", "Autor a confirmar"),
 1680: ("Ifá e a Prática do Jogo de Búzios", "Babá King", "Livro", T, "Oráculos e jogo de búzios", "Candomblé", "pt", ""),
 1684: ("Jogo de Búzios: a mensagem dos Orixás", "Bergson Garcia", "Livro", T, "Oráculos e jogo de búzios", "Candomblé Ketu", "pt", ""),
 1696: ("Jogo de Búzios — Nível 1", "Babalawo Bergson Garcia", "Apostila", T, "Oráculos e jogo de búzios", "Candomblé Ketu", "pt", ""),
 1685: ("Jogo de Búzios: fala do Orisá", "Montieh Alaara", "Livro", T, "Oráculos e jogo de búzios", "Candomblé Ketu", "pt", ""),
 1686: ("Oráculos Yorubá: dos Búzios ao Obi", "Marcos Arino", "Livro", T, "Oráculos e jogo de búzios", "Candomblé Ketu", "pt", ""),
 1688: ("Jogo de Búzios Tradicional Nigeriano", "Wagner Barreto", "Livro", T, "Oráculos e jogo de búzios", "Tradição nigeriana", "pt", ""),
 1690: ("Jogo de Búzios no Ritual de Almas", "Giovani Martins", "Livro", T, "Oráculos e jogo de búzios", "Candomblé Angola", "pt", "3 cópias com nomes diferentes"),
 1687: ("Jogo de Búzios en Kimbanda", "T. Mundele", "Livro", T, "Kimbanda", "Kimbanda", "es", "Idioma a confirmar"),
 1691: ("Curso Completo de Búzios — Merindilogun", "Autor desconhecido", "Curso", T, "Oráculos e jogo de búzios", "", "pt", ""),
 1689: ("Búzios", "", "Livro", T, "Oráculos e jogo de búzios", "", "pt", "Título e autor a confirmar"),
 1694: ("Búzios — Odus", "", "Apostila", T, "Oráculos e jogo de búzios", "", "pt", "Autor a confirmar"),
 1695: ("Jogo de Búzios — Um Breve Ensaio", "Autor desconhecido", "Artigo", T, "Oráculos e jogo de búzios", "", "pt", ""),
 # A identificar
 1619: ("Documento digitalizado (SKM_C258…)", "", "PDF", X, "Revisar", "", "pt", "Digitalização sem título — abrir e identificar"),
 1621: ("Documento sem título (3d186eab…)", "", "PDF", X, "Revisar", "", "pt", "Nome de arquivo aleatório — abrir e identificar"),
}

def norm(s):
    s = unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode()
    s = re.sub(r"\.pdf", "", s); s = re.sub(r"\(\d+\)|_\d{5,}$", "", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

first_by_size, first_by_name, groups = {}, {}, OrderedDict()
for m in msgs:
    key = first_by_size.get(m["file_size"]) or first_by_name.get(norm(m["file_name"]))
    if key is None:
        key = m["id"]; groups[key] = []
    first_by_size.setdefault(m["file_size"], key); first_by_name.setdefault(norm(m["file_name"]), key)
    groups[key].append(m)

# Mesma obra em arquivos diferentes (decidido manualmente)
MERGE = {1641: 1716}
for dup, keep in MERGE.items():
    groups[keep] += groups.pop(dup)

# O mantido de cada grupo é o id que tem metadados
rows, missing = [], []
for key, ms in groups.items():
    keep = next((m for m in ms if m["id"] in META), None)
    if keep is None:
        missing.append(ms); continue
    t, a, ty, cat, sub, trad, lang, obs = META[keep["id"]]
    others = [m["file_name"] for m in ms if m is not keep]
    rows.append({
        "telegram_id": keep["id"], "titulo": t, "autor": a, "tipo": ty, "formato": "PDF",
        "categoria": cat, "subcategoria": sub, "tradicao_perspectiva": trad, "idioma": lang,
        "arquivo": keep["file_name"], "tamanho_mb": round(keep["file_size"] / 1048576, 2),
        "status": "rascunho", "visibilidade": "restrito", "direitos": "uso interno do terreiro",
        "duplicatas_ignoradas": len(others), "arquivos_duplicados": " | ".join(others),
        "observacoes": obs,
    })
assert not missing, missing

os.makedirs(out, exist_ok=True)
order = [F, O, L, E, M, T, X]
rows.sort(key=lambda r: (order.index(r["categoria"]), r["subcategoria"], r["titulo"]))
with open(os.path.join(out, "acervo-telegram.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
json.dump(rows, open(os.path.join(out, "acervo-telegram.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print("arquivos no export:", len(msgs), "| únicos:", len(rows), "| duplicatas ignoradas:", len(msgs) - len(rows))
from collections import Counter
for (c, s), n in sorted(Counter((r["categoria"], r["subcategoria"]) for r in rows).items(), key=lambda x: (order.index(x[0][0]), x[0][1])):
    print(f"{c} › {s}: {n}")
