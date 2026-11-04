'use client';

import { createClient } from '@/lib/supabase/client';

export type ReadKind = 'read' | 'listen' | 'watch';

// Registra o início ou a conclusão de uma leitura/audição/vídeo (uma vez por material
// em cada abertura de página; o banco ignora repetições enquanto a vez anterior está aberta)
const sent = new Set<string>();
export function markRead(materialId: string | null | undefined, kind: ReadKind, step: 'start' | 'complete') {
  if (!materialId) return;
  const key = `${step}:${kind}:${materialId}`;
  if (sent.has(key)) return;
  sent.add(key);
  if (step === 'start') sent.delete(`complete:${kind}:${materialId}`);
  void createClient().rpc(step === 'start' ? 'start_material' : 'complete_material', { m: materialId, k: kind })
    .then((r: { error: unknown }) => { if (r.error) sent.delete(key); });
}
