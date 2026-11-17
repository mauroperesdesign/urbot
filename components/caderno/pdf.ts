// Gera o PDF do caderno no próprio navegador: uma página A4 deitada por folha,
// com as notas, as imagens coladas e as ligações do mapa mental.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import { color, type Item, type Page } from '@/lib/caderno';

const W = 842, H = 595, M = 32, TOP = 70;
const FS = 14, LH = 20, PAD = 12;
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

// A fonte padrão do PDF não tem emojis e alguns símbolos: troca ou remove
function safe(text: string) {
  return Array.from(text.replace(/\t/g, '    ')).map((ch) => {
    const c = ch.codePointAt(0)!;
    if (ch === '\n') return ch;
    if ((c >= 32 && c < 127) || (c >= 160 && c <= 255) || WIN_ANSI_EXTRA.includes(ch)) return ch;
    if (c > 0xffff || (c >= 0x2600 && c <= 0x27bf) || (c >= 0xfe00 && c <= 0xfe0f) || c === 0x200d) return '';
    return '?';
  }).join('');
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const para of safe(text).split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (font.widthOfTextAtSize(next, size) <= width || !line.trim()) {
        if (font.widthOfTextAtSize(next, size) > width && !line.trim()) {
          // palavra maior que a nota: quebra no meio
          let chunk = '';
          for (const ch of next) { if (font.widthOfTextAtSize(chunk + ch, size) > width) { out.push(chunk); chunk = ''; } chunk += ch; }
          line = chunk;
        } else line = next;
      } else { out.push(line.trimEnd()); line = word.trimStart(); }
    }
    out.push(line.trimEnd());
  }
  return out;
}

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

export async function exportPdf(pages: Page[], signedUrls: (paths: string[]) => Promise<Record<string, string>>) {
  const doc = await PDFDocument.create();
  doc.setTitle('Caderno de estudos — Biblioteca Umbandista');
  doc.setCreator('Biblioteca Umbandista');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const paths = pages.flatMap((p) => p.content.items.filter((i) => i.kind === 'image').map((i) => (i.kind === 'image' ? i.path : '')));
  const urls = paths.length ? await signedUrls(paths) : {};
  const images: Record<string, PDFImage> = {};
  await Promise.all(paths.map(async (path) => {
    if (!urls[path]) return;
    try {
      const bytes = new Uint8Array(await (await fetch(urls[path])).arrayBuffer());
      images[path] = bytes[0] === 0x89 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } catch { /* imagem indisponível: fica um quadro vazio */ }
  }));

  const today = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  for (const page of pages) {
    const pdf = doc.addPage([W, H]);
    pdf.drawText(safe(page.title || 'Sem título'), { x: M, y: H - M - 6, size: 18, font: bold, color: rgb(0.06, 0.1, 0.25) });
    pdf.drawText(safe(`Caderno de estudos · Biblioteca Umbandista · ${today}`), { x: M, y: H - M - 24, size: 9, font, color: rgb(0.45, 0.5, 0.6) });

    // Medidas de cada item no tamanho da folha original
    const boxes = page.content.items.map((it: Item) => {
      if (it.kind === 'image') return { it, lines: [] as string[], h: it.w * it.ar + (it.source ? 22 : 0) };
      const lines = wrap(it.text || ' ', font, FS, it.w - PAD * 2);
      return { it, lines, h: PAD * 2 + lines.length * LH + (it.source ? 20 : 0) };
    });
    if (!boxes.length) {
      pdf.drawText('Folha em branco', { x: M, y: H / 2, size: 12, font: italic, color: rgb(0.55, 0.58, 0.65) });
      continue;
    }
    const minX = Math.min(...boxes.map((b) => b.it.x)), minY = Math.min(...boxes.map((b) => b.it.y));
    const maxX = Math.max(...boxes.map((b) => b.it.x + b.it.w)), maxY = Math.max(...boxes.map((b) => b.it.y + b.h));
    const s = Math.min(1, (W - M * 2) / (maxX - minX), (H - TOP - M) / (maxY - minY));
    const X = (x: number) => M + (x - minX) * s;
    const Y = (y: number) => H - TOP - (y - minY) * s;
    const byId = new Map(boxes.map((b) => [b.it.id, b]));

    // Ligações por baixo das notas
    for (const l of page.content.links) {
      const a = byId.get(l.from), b = byId.get(l.to);
      if (!a || !b) continue;
      pdf.drawLine({
        start: { x: X(a.it.x + a.it.w / 2), y: Y(a.it.y + a.h / 2) }, end: { x: X(b.it.x + b.it.w / 2), y: Y(b.it.y + b.h / 2) },
        thickness: Math.max(1, 2.5 * s), color: rgb(0.42, 0.5, 0.68), opacity: 0.8,
      });
    }

    for (const { it, lines, h } of boxes) {
      const x = X(it.x), top = Y(it.y), w = it.w * s, hh = h * s;
      if (it.kind === 'text') {
        const c = color(it.color);
        pdf.drawRectangle({ x, y: top - hh, width: w, height: hh, color: hex(c.bg), borderColor: hex(c.line), borderWidth: 1 });
        lines.forEach((ln, i) => {
          if (ln) pdf.drawText(ln, { x: x + PAD * s, y: top - (PAD + FS + i * LH) * s + 3 * s, size: FS * s, font, color: rgb(0.1, 0.12, 0.2) });
        });
      } else {
        const img = images[it.path];
        const ih = it.w * it.ar * s;
        if (img) pdf.drawImage(img, { x, y: top - ih, width: w, height: ih });
        else pdf.drawRectangle({ x, y: top - ih, width: w, height: ih, borderColor: rgb(0.8, 0.82, 0.88), borderWidth: 1 });
      }
      if (it.source) {
        pdf.drawText(safe(it.source).slice(0, 90), { x: x + (it.kind === 'text' ? PAD * s : 0), y: top - hh + 6 * s, size: Math.max(5, 10 * s), font: italic, color: rgb(0.35, 0.38, 0.48) });
      }
    }
  }

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `caderno-de-estudos-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
