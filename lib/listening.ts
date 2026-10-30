'use client';

import { createClient } from '@/lib/supabase/client';

// Soma o tempo realmente tocado (descontando saltos e a velocidade) para "Minutos escutados"
export function listenCounter() {
  let total = 0;
  let last: number | null = null;
  return {
    tick(el: HTMLMediaElement) {
      const now = el.currentTime;
      if (!el.paused && last != null) {
        const delta = now - last;
        if (delta > 0 && delta < 3) total += delta / (el.playbackRate || 1);
      }
      last = now;
    },
    reset() { last = null; },
    async flush(materialId: string | null | undefined) {
      const secs = Math.round(total);
      if (!materialId || secs < 1) return;
      total = 0;
      try { await createClient().rpc('log_listening', { m: materialId, secs }); } catch { total += secs; }
    },
  };
}
