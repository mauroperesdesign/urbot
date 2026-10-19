export function Prose({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="container" style={{ maxWidth: 760, marginTop: 32, lineHeight: 1.7, fontSize: 16 }}>
      <h1 style={{ fontSize: 'clamp(38px, 6vw, 56px)', marginBottom: 16 }}>{title}</h1>
      {children}
    </article>
  );
}
