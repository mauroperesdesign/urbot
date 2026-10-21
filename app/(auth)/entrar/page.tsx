import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthForm } from '../AuthForm';
import { signIn } from '../actions';

export const metadata: Metadata = { title: 'Entrar', robots: { index: false } };

export default function SignIn({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="stack" style={{ ['--gap' as string]: '18px' }}>
      <h1 className="page-title">Entrar</h1>
      <AuthForm action={signIn} submit="Entrar" hidden={{ next: searchParams.next ?? '/' }}>
        <label className="field">E-mail<input name="email" type="email" autoComplete="email" required /></label>
        <label className="field">Senha<input name="password" type="password" autoComplete="current-password" required /></label>
      </AuthForm>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
        <Link href="/recuperar-senha">Esqueci minha senha</Link>
        <Link href="/cadastro">Criar conta</Link>
      </div>
    </div>
  );
}
