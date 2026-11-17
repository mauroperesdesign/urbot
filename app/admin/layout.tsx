import Link from 'next/link';
import type { Metadata } from 'next';
import { requireStaff } from '@/lib/data';
import { AdminTabs } from '@/components/Nav';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Administração', robots: { index: false, follow: false } };

const NAV_BASE = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/materiais', label: 'Materiais' },
  { href: '/admin/materiais/novo', label: 'Novo material' },
  { href: '/admin/categorias', label: 'Categorias' },
  { href: '/admin/usuarios', label: 'Usuários e permissões' },
  { href: '/admin/sugestoes', label: 'Sugestões' },
  { href: '/admin/estatisticas', label: 'Estatísticas' },
  { href: '/admin/calendario', label: 'Calendário, mensagens e frases' },
  { href: '/admin/exportar', label: 'Exportar CSV' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireStaff();
  // Contador de sugestões novas no menu do painel
  const { count } = await supabase.from('material_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'nova');
  const NAV = NAV_BASE.map((n) => (n.href === '/admin/sugestoes' && count ? { ...n, label: `Sugestões · ${count} nova${count === 1 ? '' : 's'}` } : n));
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
