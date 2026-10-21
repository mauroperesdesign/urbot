import type { Metadata } from 'next';
import { AuthForm } from '../AuthForm';
import { requestReset } from '../actions';

export const metadata: Metadata = { title: 'Recuperar senha', robots: { index: false } };

export default function Recover() {
  return (
    <div className="stack" style={{ ['--gap' as string]: '18px' }}>
      <h1 className="page-title">Recuperar senha</h1>
      <AuthForm action={requestReset} submit="Enviar link">
        <label className="field">E-mail<input name="email" type="email" autoComplete="email" required /></label>
      </AuthForm>
    </div>
  );
}
