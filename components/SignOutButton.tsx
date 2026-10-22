'use client';

import { useState } from 'react';
import { signOut } from '@/app/(auth)/actions';
import { clearOffline } from '@/lib/offline';
import { Icon } from './Icon';

// Ao sair, apaga do aparelho os materiais guardados para leitura sem internet
export function SignOutButton({ variant = 'nav' }: { variant?: 'nav' | 'button' }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    await clearOffline().catch(() => undefined);
    await signOut();
  };
  if (variant === 'button') return <button className="btn" type="button" onClick={run} disabled={busy}>Sair</button>;
  return <button type="button" onClick={run} disabled={busy}><span className="ico"><Icon name="logout" size={18} /></span>Sair</button>;
}
