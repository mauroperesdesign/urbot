import { Suspense } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getSession, isStaff } from '@/lib/data';
import { supabaseConfigured } from '@/lib/supabase/server';
import { Icon } from './Icon';
import { SideNav, TabBar, type PontosNav } from './Nav';
import { ThemeToggle } from './ThemeToggle';

export function currentTheme(): 'light' | 'dark' {
  return cookies().get('tema')?.value === 'escuro' ? 'dark' : 'light';
}

async function session() {
  return supabaseConfigured() ? getSession() : { user: null, profile: null };
}

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Biblioteca Umbandista — início">
      <img src="/logo.webp" alt="" />
      <span><b>Biblioteca</b><small>Umbandista</small></span>
    </Link>
  );
}

async function pontosNav(): Promise<PontosNav> {
  if (!supabaseConfigured()) return { orixas: [], linhas: [] };
  const { supabase } = await getSession();
  const { data } = await supabase.from('categories').select('id, parent_id, slug, name, position').order('position');
  const all = data ?? [];
  const kids = (slug: string) => {
    const parent = all.find((c) => c.slug === slug);
    return parent ? all.filter((c) => c.parent_id === parent.id).map(({ slug: s, name }) => ({ slug: s, name })) : [];
  };
  return { orixas: kids('pontos-cantados-orixas'), linhas: kids('pontos-cantados-linhas') };
}

export async function Sidebar() {
  const { user, profile } = await session();
  const pontos = await pontosNav();
  return (
    <aside className="sidebar">
      <Brand />
      <Suspense fallback={null}>
        <SideNav staff={isStaff(profile)} signedIn={!!user} pontos={pontos} />
      </Suspense>
    </aside>
  );
}

export async function Topbar() {
  const { user, profile } = await session();
  const pontos = await pontosNav();
  const name = profile?.display_name || user?.email?.split('@')[0] || '';
  return (
    <>
      <header className="topbar">
        <Brand />
        <form role="search" action="/acervo" className="search">
          <Icon name="search" size={18} />
          <label htmlFor="q" className="sr-only">Buscar no acervo</label>
          <input id="q" name="q" type="search" placeholder="Buscar títulos, autores, Orixás, linhas…" />
        </form>
        <div className="topbar-end">
          <ThemeToggle initial={currentTheme()} />
          {user ? (
            <Link href="/perfil" className="user-chip" aria-label="Meu perfil">
              <span className="avatar">{(name || '?').slice(0, 1).toUpperCase()}</span>
              <span className="name">{name}</span>
              <span className="name muted"><Icon name="chevronDown" size={16} /></span>
            </Link>
          ) : (
            <Link href="/entrar" className="btn btn-primary">Entrar</Link>
          )}
        </div>
      </header>
      <Suspense fallback={null}><TabBar signedIn={!!user} staff={isStaff(profile)} pontos={pontos} /></Suspense>
    </>
  );
}
