export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container" style={{ maxWidth: 460, marginTop: 40 }}>
      <div className="card" style={{ padding: 28 }}>{children}</div>
    </div>
  );
}
