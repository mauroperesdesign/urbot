'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { FormState } from './actions';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Aguarde…' : label}</button>;
}

export function AuthForm({ action, submit, children, hidden }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  submit: string;
  children: React.ReactNode;
  hidden?: Record<string, string>;
}) {
  const [state, formAction] = useFormState(action, undefined);
  return (
    <form action={formAction} className="stack" style={{ ['--gap' as string]: '14px' }}>
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {state?.error ? <p className="alert alert-error" role="alert">{state.error}</p> : null}
      {state?.ok ? <p className="alert alert-ok" role="status">{state.ok}</p> : null}
      <Submit label={submit} />
    </form>
  );
}
