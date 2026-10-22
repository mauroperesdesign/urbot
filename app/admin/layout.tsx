import Link from 'next/link';
import type { Metadata } from 'next';
import { requireStaff } from '@/lib/data';
import { AdminTabs } from '@/components/Nav';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Administração', robots: { index: false, follow: false } };

const NAV = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/materiais', label: 'Materiais' },
  { href: '/admin/materiais/novo', label: 'Novo material' },
  { href: '/admin/categorias', label: 'Categorias' },
  { href: '/admin/usuarios', label: 'Usuários e permissões' },
  { href: '/admin/estatisticas', label: 'Estatísticas' },
  { href: '/admin/exportar', label: 'Exportar CSV' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  return (
    <div className="container stack" style={{ ['--gap' as string]: '18px' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="eyebrow">Administração · {profile?.role === 'admin' ? 'admin' : 'editor'}</span>
        <Link href="/" className="pill-link">Voltar ao site</Link>
      </div>
      <AdminTabs items={NAV} />
      <div className="panel" style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
