// Sugestões de materiais: rótulos compartilhados entre a página do membro e o painel
export const SUGGESTION_KINDS: Record<string, string> = {
  livro: 'Livro', audiobook: 'Audiobook', curso: 'Curso ou aula', video: 'Vídeo', apostila: 'Apostila ou texto', ponto: 'Ponto cantado', outro: 'Outro',
};
export const SUGGESTION_STATUS: Record<string, { label: string; tone: string }> = {
  nova: { label: 'Recebida', tone: 'badge' },
  analisando: { label: 'Em análise', tone: 'badge badge-sand' },
  adicionada: { label: 'Adicionada ao acervo', tone: 'badge badge-ok' },
  recusada: { label: 'Não será adicionada', tone: 'badge badge-dark' },
};
export type Suggestion = {
  id: string; user_id: string; title: string; author: string | null; kind: string; link: string | null; reason: string | null;
  status: string; admin_note: string | null; created_at: string; updated_at: string;
};
