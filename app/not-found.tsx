import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="container" style={{ maxWidth: 560, marginTop: 48 }}>
      <div className="empty">
        <h1 style={{ fontSize: 40 }}>Não encontrado</h1>
        <p className="muted">Este material não existe ou você não tem acesso a ele. Se for um material restrito, entre com uma conta aprovada.</p>
        <div className="row"><Link className="btn" href="/acervo">Ir para o acervo</Link><Link className="btn btn-primary" href="/entrar">Entrar</Link></div>
      </div>
    </div>
  );
}
