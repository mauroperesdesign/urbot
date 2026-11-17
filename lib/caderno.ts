// Caderno de estudos: tipos e utilidades compartilhados entre o editor, o painel e o PDF

export const BOARD_W = 2400;
export const BOARD_H = 1600;
export const MAX_ITEMS = 300;
export const MAX_TEXT = 4000;

export const COLORS = [
  { id: 'amarelo', bg: '#FFF4B8', line: '#E8CF5A' },
  { id: 'rosa', bg: '#FFD9E3', line: '#EFA2B7' },
  { id: 'verde', bg: '#D7F5D9', line: '#8FD596' },
  { id: 'azul', bg: '#D6E7FF', line: '#8DB5F2' },
  { id: 'lilas', bg: '#E9DDFF', line: '#B79AF0' },
  { id: 'branco', bg: '#FFFFFF', line: '#D5DBE7' },
] as const;
export type ColorId = (typeof COLORS)[number]['id'];
export const color = (id: string | undefined) => COLORS.find((c) => c.id === id) ?? COLORS[0];

export type TextItem = { id: string; kind: 'text'; x: number; y: number; w: number; text: string; color: ColorId; source?: string };
export type ImageItem = { id: string; kind: 'image'; x: number; y: number; w: number; path: string; ar: number; source?: string };
export type Item = TextItem | ImageItem;
export type LinkLine = { id: string; from: string; to: string };
export type PageContent = { items: Item[]; links: LinkLine[] };
export type Page = { id: string; title: string; content: PageContent; updated_at: string };

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function clean(content: unknown): PageContent {
  const c = (content ?? {}) as Partial<PageContent>;
  const items = Array.isArray(c.items) ? c.items.filter((i) => i && (i.kind === 'text' || i.kind === 'image')).slice(0, MAX_ITEMS) : [];
  const ids = new Set(items.map((i) => i.id));
  const links = Array.isArray(c.links) ? c.links.filter((l) => l && ids.has(l.from) && ids.has(l.to)) : [];
  return { items, links };
}

// Altura aproximada de uma nota (para ligações e PDF de folhas que não estão na tela)
export function estimateHeight(item: Item) {
  if (item.kind === 'image') return item.w * item.ar + 22;
  const charsPerLine = Math.max(8, Math.floor((item.w - 24) / 7.6));
  const lines = item.text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / charsPerLine)), 0);
  return 40 + lines * 21 + (item.source ? 20 : 0);
}
