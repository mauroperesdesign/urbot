import type { Metadata } from 'next';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/data';
import { signOut } from '../(auth)/actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Conta', robots: { index: false } };

async function saveProfile(form: FormData) {
  'use server';
  const { supabase, user } = await requireUser('/conta');
  await supabase.from('profiles').update({ display_name: String(form.get('name') ?? '').trim().slice(0, 80) || null, updated_at: new Date().toISOString() }).eq('id', user.id);
  revalidatePath('/conta');
}

export default async function Account() {
  const { user, profile } = await requireUser('/conta');
  const roleLabel = profile?.role === 'admin' ? 'Administrador' : profile?.role === 'editor' ? 'Editor' : profile?.approved ? 'Membro aprovado' : 'Aguardando aprovação';
  return (
    <div className="container" style={{ maxWidth: 560, marginTop: 24 }}>
      <h1 style={{ fontSize: 48 }}>Conta</h1>
      <div className="card stack" style={{ padding: 24, marginTop: 16 }}>
        <p style={{ margin: 0 }}><b>{user.email}</b><br /><span className="muted">{roleLabel}</span></p>
        <form action={saveProfile} className="stack">
          <label className="field">Nome de exibição<input name="name" defaultValue={profile?.display_name ?? ''} maxLength={80} /></label>
          <button className="btn btn-primary" type="submit" style={{ alignSelf: 'flex-start' }}>Salvar</button>
        </form>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Seu progresso, favoritos e anotações são privados: só você vê.</p>
        <form action={signOut}><button className="btn" type="submit">Sair</button></form>
      </div>
    </div>
  );
}
