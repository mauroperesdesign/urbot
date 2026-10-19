import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthForm } from '../AuthForm';
import { signUp } from '../actions';

export const metadata: Metadata = { title: 'Criar conta', robots: { index: false } };

export default function SignUp() {
  return (
    <div className="stack" style={{ ['--gap' as string]: '18px' }}>
      <h1 style={{ fontSize: 40 }}>Criar conta</h1>
      <p className="muted" style={{ margin: 0 }}>O acervo é de uso interno. Depois do cadastro, a administração do terreiro aprova o seu acesso aos materiais restritos.</p>
      <AuthForm action={signUp} submit="Criar conta">
        <label className="field">Nome<input name="name" autoComplete="name" required maxLength={80} /></label>
        <label className="field">E-mail<input name="email" type="email" autoComplete="email" required /></label>
        <label className="field">Senha<small>Mínimo de 8 caracteres</small><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      </AuthForm>
      <p style={{ fontSize: 14, margin: 0 }}>Já tem conta? <Link href="/entrar">Entrar</Link></p>
    </div>
  );
}
