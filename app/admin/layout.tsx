import Link from 'next/link';
import type { Metadata } from 'next';
import { requireStaff } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Administração', robots: { index: false, follow: false } };

const NAV = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/materiais', label: 'Materiais' },
  { href: '/admin/materiais/novo', label: 'Novo material' },
  { href: '/admin/categorias', label: 'Categorias' },
  { href: '/admin/usuarios', label: 'Usuários e permissões' },
  { href: '/admin/exportar', label: 'Exportar CSV' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  return (
    <div className="container" style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 20, alignItems: 'flex-start' }}>
      <aside style={{ flex: '1 1 220px', maxWidth: '100%', background: '#10201B', color: '#B9C4BF', borderRadius: 22, padding: 14 }}>
        <span className="eyebrow" style={{ color: '#E7C47A', display: 'block', padding: '6px 10px 12px' }}>Administração · {profile?.role === 'admin' ? 'admin' : 'editor'}</span>
        <nav aria-label="Administração" className="stack" style={{ ['--gap' as string]: '2px' }}>
          {NAV.map((n) => <Link key={n.href} href={n.href} style={{ color: '#F6F3EC', padding: '10px 12px', borderRadius: 10, fontWeight: 600 }}>{n.label}</Link>)}
          <Link href="/" style={{ color: '#B9C4BF', padding: '10px 12px', fontSize: 13 }}>← Voltar ao site</Link>
        </nav>
      </aside>
      <div style={{ flex: '999 1 640px', minWidth: 0 }}>{children}</div>
    </div>
  );
}
