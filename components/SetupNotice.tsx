export function SetupNotice() {
  return (
    <div className="container" style={{ maxWidth: 720, marginTop: 40 }}>
      <div className="card stack" style={{ padding: 28 }}>
        <span className="eyebrow">Configuração pendente</span>
        <h1 className="page-title">Conecte o Supabase</h1>
        <p>O site está instalado, mas ainda não sabe onde fica o banco de dados. Defina as variáveis
          <code> NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (veja o arquivo
          <code> .env.example</code> e o <code>README.md</code>) e reinicie o servidor.</p>
      </div>
    </div>
  );
}
