"""Gera o catálogo de audiobooks a partir da listagem da pasta "Audiobooks" do Drive.

Uso: python3 -I build_audiobooks_drive.py <dir_com_listagens_json> <saida_dir>
Cada subpasta da pasta Audiobooks é um audiobook; cada .m4a é uma faixa.
A duração não é estimada: será lida do arquivo no processamento pós-upload.
Autores só quando aparecem nos nomes das faixas (nada inventado).
"""
import csv, glob, json, os, re, sys, unicodedata
from collections import defaultdict

src, out = sys.argv[1], sys.argv[2]
DRIVE = "https://drive.google.com/drive/folders/"

F, L, E, M, T = ("Fundamentos e história", "Linhas de trabalho", "Estudos e práticas",
                 "Materiais educacionais", "Tradições de matriz africana")

# pasta -> (titulo, autor, categoria, subcategoria, tradicao, observacao, ordem_confiavel)
BOOKS = {
 "16usgp3Lotc1Gwd_daDrnw06b5UybWPQq": ("Caboclo Tupinambá e a Aldeia", "", L, "Caboclos", "Umbanda", "Autor a confirmar (há faixa 'Sobre o Autor')", True),
 "1b8sOrWt3uSKCy_v8xJgxBUna_DINhoKQ": ("Umbanda em Casa: Prática Umbandista Familiar", "", E, "Umbanda no lar", "Umbanda", "Autor a confirmar; faixas sem numeração", False),
 "1jQLPZoggyAHqLWDlsPMsj8PAdFpElqtj": ("Coletânea — Como Praticar a Umbanda em Sua Casa (Vol. 1 a 3)", "", E, "Umbanda no lar", "Umbanda", "Autor a confirmar", True),
 "1X8mwNuABIaMecJeAqvjIfyfN0EdDLLzx": ("Incorporação na Umbanda", "", E, "Mediunidade e desenvolvimento", "Umbanda", "Autor a confirmar; faixa 'Sobre o Umbanda Eu Curto'", True),
 "1BPwxI8kd8KgIWkKfvO9FaOaFUa0d2XjT": ("Médium", "", E, "Mediunidade e desenvolvimento", "Umbanda", "Autor a confirmar", True),
 "1-UR9QPX6-zJEr1yerdSWJcfyHnUyxtpv": ("Novo Manual do Médium de Umbanda", "", E, "Mediunidade e desenvolvimento", "Umbanda", "Autor a confirmar; inclui rituais, banhos, defumações e orações", True),
 "1WfQVfVQ3dhAVHt_WgeDY8IzHkhe7oGDa": ("Mandingas de Preto-Velho", "David Veronezi", L, "Pretos-velhos", "Umbanda", "Autor conforme faixa 'Sobre David Veronezi'", True),
 "1Q2GjtaqSzz-HUOAYX_mDP2gQpFJ8V4SH": ("Zé do Laço", "", L, "Boiadeiros", "Umbanda", "Mesma obra do PDF 'Zé do Laço' do acervo (telegram_id 1733) — usar como texto alternativo", True),
 "1mprx-MNQHB8ZCf1BcxKSDy-7qpL3uAXo": ("Umbanda Preta", "Mãe Flávia Pinto", F, "Ética e prática religiosa", "Umbanda", "Autoria a confirmar (faixa 'Entrevista com a escritora Mãe Flavia Pinto'); faixas sem numeração", False),
 "1jZ0hpGs63tXDNjLflPnjyP4jrZJq9vAm": ("Fragmentos de Umbanda", "", F, "Fundamentos da Umbanda", "Umbanda", "Autor a confirmar; 91 reflexões curtas", True),
 "1djpZtf7vYvHs2bGiuyP1AlhyLFwyOzGq": ("Sob o Céu de Aruanda", "", M, "Romances e narrativas", "Umbanda", "Autor a confirmar; faixas sem numeração", False),
 "12jCwJaNFbUCjOYVn8fd7BD3arakTi_nl": ("Das Trevas ao Fogo Divino", "", M, "Romances e narrativas", "", "Autor e classificação a confirmar; faixas sem numeração", False),
 "1Opjm4wpn78QyNL1eRfWNAN5U0WMVzgd4": ("Desvendando Exu", "", T, "Kimbanda", "Quimbanda", "Autor a confirmar; também relacionado a Linhas de trabalho › Exus", False),
}

FRONT = ["sobre o umbanda eu curto", "sobre o autor", "sobre david", "apresentacao", "dedicatoria", "prefacio",
         "prologo", "nota do autor", "palavras iniciais", "volume 1", "introducao", "hino", "juramento", "a iniciacao na palavra"]
BACK = ["reflexao", "conclusao", "consideracoes finais", "palavras finais", "posfacio", "apendice", "agradecimentos", "quarta capa", "bonus"]
ROMAN = {"I": 1, "II": 2, "III": 3}

def plain(s):
    return unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode()

def track_key(title):
    t = re.sub(r"\.m4a$", "", title).strip()
    p = plain(t)
    m = re.match(r"^(I{1,3})\.(\d+)", t)
    if m: return (1, ROMAN[m.group(1)], int(m.group(2)), p)
    m = re.match(r"^vol(?:ume)?\s*(\d)\.?\s*(.*)", p)
    if m:
        rest = m.group(2)
        sub = 0 if "aviso" in rest else 1 if rest.startswith("introducao") else 3 if "lembre" in rest else 4 if "bonus" in rest else 2
        n = re.search(r"cap\s*(\d+)", rest)
        return (1, int(m.group(1)), sub, int(n.group(1)) if n else 0, p)
    m = re.match(r"^(?:cap\s*)?(\d+)", p)
    if m and not p.startswith(("0 ", "00", "01 ")):
        return (1, 0, int(m.group(1)), p)
    for i, w in enumerate(BACK):
        if w in p: return (2, i, p)
    for i, w in enumerate(FRONT):
        if w in p or p.startswith(("0", "00", "01")): return (0, i if w in p else len(FRONT), p)
    return (1, 99, p)

files = {}
for f in glob.glob(os.path.join(src, "*.txt")):
    for x in json.load(open(f, encoding="utf-8"))["files"]:
        files[x["id"]] = x
by_folder = defaultdict(list)
for x in files.values():
    if x["mimeType"].startswith("audio/"):
        by_folder[x["parentId"]].append(x)
assert set(by_folder) == set(BOOKS), set(by_folder) ^ set(BOOKS)

books, tracks = [], []
for folder, (title, author, cat, sub, trad, obs, ordered) in BOOKS.items():
    fs = sorted(by_folder[folder], key=lambda x: track_key(x["title"]))
    size = sum(int(x["fileSize"]) for x in fs)
    books.append({
        "titulo": title, "autor": author, "tipo": "Audiobook", "formato": "M4A",
        "categoria": cat, "subcategoria": sub, "tradicao_perspectiva": trad, "idioma": "pt",
        "faixas": len(fs), "tamanho_mb": round(size / 1048576, 1), "duracao": "",
        "status": "rascunho", "visibilidade": "restrito", "direitos": "uso interno do terreiro",
        "ordem_faixas": "por numeração" if ordered else "a revisar (faixas sem número)",
        "drive_pasta": DRIVE + folder, "observacoes": obs,
    })
    for i, x in enumerate(fs, 1):
        tracks.append({"audiobook": title, "ordem": i, "faixa": re.sub(r"\.m4a$", "", x["title"]).strip(),
                       "arquivo": x["title"], "tamanho_mb": round(int(x["fileSize"]) / 1048576, 2),
                       "drive_id": x["id"]})

os.makedirs(out, exist_ok=True)
order = [F, L, E, M, T]
books.sort(key=lambda b: (order.index(b["categoria"]), b["subcategoria"], b["titulo"]))
for name, rows in (("audiobooks-drive.csv", books), ("audiobooks-faixas.csv", tracks)):
    with open(os.path.join(out, name), "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
print(f"{len(books)} audiobooks, {len(tracks)} faixas, {round(sum(b['tamanho_mb'] for b in books)/1024, 2)} GB")
for b in books:
    print(f"- {b['titulo']} | {b['faixas']} faixas | {b['tamanho_mb']} MB | {b['categoria']} › {b['subcategoria']} | ordem {b['ordem_faixas']}")
