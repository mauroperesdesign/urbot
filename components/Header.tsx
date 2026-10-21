import { Suspense } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getSession, isStaff } from '@/lib/data';
import { supabaseConfigured } from '@/lib/supabase/server';
import { Icon } from './Icon';
import { SideNav, TabBar } from './Nav';
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

export async function Sidebar() {
  const { user, profile } = await session();
  return (
    <aside className="sidebar">
      <Brand />
      <Suspense fallback={null}>
        <SideNav staff={isStaff(profile)} signedIn={!!user} />
      </Suspense>
    </aside>
  );
}

export async function Topbar() {
  const { user, profile } = await session();
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
            <Link href="/conta" className="user-chip" aria-label="Minha conta">
              <span className="avatar">{(name || '?').slice(0, 1).toUpperCase()}</span>
              <span className="name">{name}</span>
              <span className="name muted"><Icon name="chevronDown" size={16} /></span>
            </Link>
          ) : (
            <Link href="/entrar" className="btn btn-primary">Entrar</Link>
          )}
        </div>
      </header>
      <Suspense fallback={null}><TabBar /></Suspense>
    </>
  );
}
