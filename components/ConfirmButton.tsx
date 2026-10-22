'use client';

// Botão de envio que pede confirmação antes (ações sem volta)
export function ConfirmButton({ message, children, className = 'btn' }: { message: string; children: React.ReactNode; className?: string }) {
  return <button className={className} type="submit" onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>{children}</button>;
}
