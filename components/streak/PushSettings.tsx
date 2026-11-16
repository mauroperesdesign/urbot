'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type State = 'loading' | 'unsupported' | 'ios-home' | 'denied' | 'off' | 'on' | 'no-key';

const b64 = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// Liga/desliga o lembrete diário da ofensiva (notificação do navegador ou do celular)
export function PushSettings({ publicKey, phrases }: { publicKey: string; phrases: number }) {
  const [state, setState] = useState<State>('loading');
  const [hour, setHour] = useState(19);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      if (!publicKey) return setState('no-key');
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
      const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState(ios && !standalone ? 'ios-home' : 'unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const { data } = await createClient().from('push_subscriptions').select('hour').eq('endpoint', sub.endpoint).maybeSingle();
        if (data) { setHour(data.hour); return setState('on'); }
      }
      setState('off');
    })().catch(() => setState('unsupported'));
  }, [publicKey]);

  async function enable() {
    setBusy(true); setMsg('');
    try {
      if (await Notification.requestPermission() !== 'granted') { setState('denied'); return; }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('sem sessão');
      await supabase.from('push_subscriptions').delete().eq('endpoint', j.endpoint);
      const { error } = await supabase.from('push_subscriptions').insert({ user_id: user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, hour });
      if (error) throw error;
      setState('on'); setMsg('Pronto! Você vai receber 1 lembrete por dia.');
    } catch { setMsg('Não foi possível ligar as notificações neste aparelho.'); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMsg('');
    try {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      if (sub) { await createClient().from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
      setState('off');
    } finally { setBusy(false); }
  }

  async function changeHour(h: number) {
    setHour(h);
    if (state !== 'on') return;
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) await createClient().from('push_subscriptions').update({ hour: h }).eq('endpoint', sub.endpoint);
    setMsg(`Horário salvo: ${String(h).padStart(2, '0')}h.`);
  }

  if (state === 'loading' || state === 'no-key') return null;
  return (
    <div className="push-settings">
      <b>Lembrete diário {state === 'on' ? '· ligado' : ''}</b>
      {state === 'ios-home' ? (
        <p>No iPhone, as notificações funcionam com o site na Tela de Início: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>, abra a biblioteca por esse ícone e volte aqui.</p>
      ) : state === 'unsupported' ? (
        <p>Este navegador não recebe notificações. Tente pelo Chrome, Edge, Firefox ou Safari atualizado.</p>
      ) : state === 'denied' ? (
        <p>As notificações estão bloqueadas para este site. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço) e recarregue a página.</p>
      ) : (
        <>
          <p>1 notificação por dia, com uma frase para te lembrar de continuar estudando{phrases ? ` (${phrases} frases que se revezam)` : ''}.</p>
          <div className="row">
            <label className="field" style={{ minWidth: 120 }}>Horário
              <select value={hour} onChange={(e) => void changeHour(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </label>
            {state === 'on'
              ? <button type="button" className="btn btn-ghost" onClick={() => void disable()} disabled={busy}>Desligar lembrete</button>
              : <button type="button" className="btn btn-primary" onClick={() => void enable()} disabled={busy}>{busy ? 'Ligando…' : 'Ligar lembrete diário'}</button>}
          </div>
        </>
      )}
      {msg ? <small role="status">{msg}</small> : null}
    </div>
  );
}
