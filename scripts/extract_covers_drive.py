"""Extrai a capa (1ª página) de cada PDF do catálogo a partir da pasta do Drive.

Uso: python3 -I extract_covers_drive.py <drive_folder_id> <catalogo.csv> <saida_dir>
Requer a pasta compartilhada por link, curl, pdftoppm e ImageMagick (convert).
Usa a miniatura do Drive; quando o Drive não gera miniatura (PDFs muito grandes),
baixa o PDF e renderiza a 1ª página com pdftoppm. Rode depois de build_catalog_telegram.py.
"""
import csv, html, os, re, subprocess, sys, tempfile, unicodedata

folder, catalog, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)

def norm(x):
    x = unicodedata.normalize("NFC", x).lower()
    x = re.sub(r"\.pdf(\.pdf)?$", "", x); x = re.sub(r"\s*\(\d+\)", "", x)
    return re.sub(r"[^\w]+", "", x)

page = subprocess.run(["curl", "-sSL", f"https://drive.google.com/embeddedfolderview?id={folder}"],
                      capture_output=True, text=True, check=True).stdout
drive = {}
for fid, title in re.findall(r'<a href="https://drive.google.com/file/d/([\w-]+)/view[^"]*"[^>]*>.*?'
                             r'<div class="flip-entry-title">(.*?)</div>', page, re.S):
    drive.setdefault(norm(html.unescape(title)), fid)

def is_image(path):
    with open(path, "rb") as fh:
        head = fh.read(8)
    return head.startswith(b"\x89PNG") or head.startswith(b"\xff\xd8")

for row in csv.DictReader(open(catalog, encoding="utf-8")):
    names = [row["arquivo"]] + [n.strip() for n in row.get("arquivos_duplicados", "").split("|") if n.strip()]
    fid = next((drive[norm(n)] for n in names if norm(n) in drive), None)
    if not fid:
        print("sem arquivo no Drive:", row["telegram_id"], row["arquivo"]); continue
    with tempfile.TemporaryDirectory() as tmp:
        raw = os.path.join(tmp, "raw.png")
        subprocess.run(["curl", "-sSL", "-o", raw, f"https://drive.google.com/thumbnail?id={fid}&sz=w700"], check=True)
        if not is_image(raw):
            pdf = os.path.join(tmp, "f.pdf")
            subprocess.run(["curl", "-sSL", "-o", pdf,
                            f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t"], check=True)
            subprocess.run(["pdftoppm", "-f", "1", "-l", "1", "-png", "-singlefile", "-scale-to-x", "700",
                            "-scale-to-y", "-1", pdf, os.path.join(tmp, "raw")], check=True)
        dest = os.path.join(out, f"{row['telegram_id']}.jpg")
        subprocess.run(["convert", raw, "-fuzz", "10%", "-trim", "+repage", "-resize", "360x540>",
                        "-strip", "-quality", "80", dest], check=True)
        print("ok", row["telegram_id"], dest)
