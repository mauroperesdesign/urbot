'use client';
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container" style={{ maxWidth: 560, marginTop: 48 }}>
      <div className="empty">
        <h1 style={{ fontSize: 36 }}>Algo deu errado</h1>
        <p className="muted">Pode ser uma falha de conexão. Verifique a internet e tente de novo.</p>
        <button className="btn btn-primary" onClick={reset}>Tentar novamente</button>
      </div>
    </div>
  );
}
