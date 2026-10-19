import type { Metadata } from 'next';
import { AuthForm } from '../AuthForm';
import { updatePassword } from '../actions';

export const metadata: Metadata = { title: 'Nova senha', robots: { index: false } };

export default function Reset() {
  return (
    <div className="stack" style={{ ['--gap' as string]: '18px' }}>
      <h1 style={{ fontSize: 40 }}>Nova senha</h1>
      <AuthForm action={updatePassword} submit="Salvar nova senha">
        <label className="field">Nova senha<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <label className="field">Confirme a senha<input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
      </AuthForm>
    </div>
  );
}
