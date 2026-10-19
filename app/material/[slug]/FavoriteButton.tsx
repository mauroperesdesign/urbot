'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/Icon';

export function FavoriteButton({ materialId, initial }: { materialId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true); setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { error } = on
      ? await supabase.from('favorites').delete().eq('material_id', materialId).eq('user_id', user.id)
      : await supabase.from('favorites').insert({ material_id: materialId, user_id: user.id });
    if (error) setError('Não foi possível salvar.'); else setOn(!on);
    setBusy(false);
  }

  return (
    <>
      <button type="button" className="btn" onClick={toggle} disabled={busy} aria-pressed={on}>
        <span style={{ color: on ? 'var(--terracotta)' : undefined, display: 'inline-flex' }}><Icon name="heart" size={18} /></span>
        {on ? 'Nos favoritos' : 'Adicionar aos favoritos'}
      </button>
      {error ? <span role="alert" className="muted">{error}</span> : null}
    </>
  );
}
