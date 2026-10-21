import type { MaterialType } from './types';

export const TYPE_LABEL: Record<MaterialType, string> = {
  book: 'Livro',
  pdf: 'PDF',
  handout: 'Apostila',
  document: 'Documento',
  audiobook: 'Audiobook',
  audio: 'Áudio',
  video: 'Vídeo',
  video_lesson: 'Videoaula',
  course: 'Curso',
  article: 'Artigo',
  research: 'Pesquisa',
  glossary: 'Glossário',
  external_link: 'Link externo',
};

export const READ_TYPES: MaterialType[] = ['book', 'pdf', 'handout', 'document', 'article', 'research', 'glossary'];
export const LISTEN_TYPES: MaterialType[] = ['audiobook', 'audio'];
export const WATCH_TYPES: MaterialType[] = ['video', 'video_lesson'];

export function primaryAction(type: MaterialType) {
  if (LISTEN_TYPES.includes(type)) return { label: 'Ouvir agora', base: '/ouvir' };
  if (WATCH_TYPES.includes(type)) return { label: 'Assistir agora', base: '/assistir' };
  if (type === 'course') return { label: 'Acessar curso', base: '/material' };
  if (type === 'external_link') return { label: 'Abrir referência', base: '/material' };
  return { label: 'Ler agora', base: '/ler' };
}

// Paleta das capas geradas quando o material não tem imagem
const COVER_TONES = [
  ['#1F3A8A', '#2F55C9'], ['#081A4F', '#1F2F6B'], ['#8A3B1C', '#B0532A'],
  ['#14532D', '#1E7A44'], ['#4C2A86', '#6A3FB0'], ['#7A1C3A', '#A82A50'],
];
// Fundo claro atrás da capa nos cards
const ART_TONES = ['#E6ECF8', '#F4EADF', '#E3F0EA', '#F3E4E9', '#ECE8F7', '#FBF1D6', '#E2EEF4'];
function hash(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}
export function coverTone(seed: string) {
  return COVER_TONES[hash(seed) % COVER_TONES.length];
}
export function artTone(seed: string) {
  return ART_TONES[hash(seed) % ART_TONES.length];
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !isFinite(seconds)) return '--:--';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export function slugify(text: string) {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
