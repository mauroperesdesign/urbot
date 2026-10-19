'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

function siteUrl() {
  const h = headers();
  return process.env.NEXT_PUBLIC_SITE_URL || `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}

// Só permite redirecionar para caminhos internos (evita open redirect)
function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === 'string' ? next : '/';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/';
}

export type FormState = { error?: string; ok?: string } | undefined;

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get('email') ?? '').trim(),
    password: String(form.get('password') ?? ''),
  });
  if (error) return { error: 'E-mail ou senha incorretos, ou e-mail ainda não confirmado.' };
  redirect(safeNext(form.get('next')));
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get('password') ?? '');
  if (password.length < 8) return { error: 'A senha precisa ter pelo menos 8 caracteres.' };
  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: String(form.get('email') ?? '').trim(),
    password,
    options: {
      data: { display_name: String(form.get('name') ?? '').trim().slice(0, 80) },
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  });
  if (error) return { error: error.message.includes('registered') ? 'Este e-mail já tem cadastro.' : 'Não foi possível criar a conta agora.' };
  return { ok: 'Conta criada. Confirme pelo link enviado ao seu e-mail. Depois, a administração aprova seu acesso ao acervo restrito.' };
}

export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(String(form.get('email') ?? '').trim(), {
    redirectTo: `${siteUrl()}/auth/callback?next=/redefinir-senha`,
  });
  // Mesma resposta exista ou não a conta (não revela e-mails cadastrados)
  return { ok: 'Se houver uma conta com este e-mail, você receberá um link para criar uma nova senha.' };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get('password') ?? '');
  if (password.length < 8) return { error: 'A senha precisa ter pelo menos 8 caracteres.' };
  if (password !== String(form.get('confirm') ?? '')) return { error: 'As senhas não conferem.' };
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: 'O link expirou. Peça uma nova recuperação de senha.' };
  redirect('/minha-biblioteca?senha=ok');
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/');
}
