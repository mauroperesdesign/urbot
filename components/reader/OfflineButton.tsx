'use client';

import { useEffect, useState } from 'react';
import { listOffline, offlineSupported, removeOffline, saveOffline } from '@/lib/offline';
import { Icon } from '../Icon';
import styles from './reader.module.css';

// Guarda (ou remove) este material no aparelho para ler sem internet
export function OfflineButton(props: { fileId: string; materialId: string; slug: string; title: string; kind: 'pdf' | 'epub' }) {
  const [state, setState] = useState<'unsupported' | 'idle' | 'saving' | 'saved'>('unsupported');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!offlineSupported()) return;
    void listOffline().then((l) => setState(l.some((e) => e.fileId === props.fileId) ? 'saved' : 'idle'));
  }, [props.fileId]);

  if (state === 'unsupported') return null;
  const saved = state === 'saved';
  return (
    <>
      <button type="button" className={`${styles.ib} ${saved ? styles.offlineOn : ''}`} aria-pressed={saved} disabled={state === 'saving'}
        aria-label={saved ? 'Disponível sem internet — toque para remover do aparelho' : 'Salvar para ler sem internet'}
        title={saved ? 'Disponível sem internet' : 'Salvar para ler sem internet'}
        onClick={async () => {
          setMsg('');
          if (saved) {
            if (!confirm('Remover este material do aparelho? Você ainda poderá lê-lo com internet.')) return;
            await removeOffline(props.fileId);
            setState('idle');
            return;
          }
          setState('saving');
          setMsg('Salvando no aparelho…');
          try {
            await saveOffline(props);
            setState('saved');
            setMsg('Pronto: disponível sem internet neste aparelho.');
          } catch (e) {
            setState('idle');
            setMsg(e instanceof Error ? e.message : 'Não foi possível salvar.');
          }
          setTimeout(() => setMsg(''), 4000);
        }}>
        <Icon name={saved ? 'check' : 'offline'} />
      </button>
      {msg ? <span className={styles.toast} role="status">{msg}</span> : null}
    </>
  );
}
