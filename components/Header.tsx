import Link from 'next/link';
import { getSession, isStaff } from '@/lib/data';
import { supabaseConfigured } from '@/lib/supabase/server';
import { Icon } from './Icon';
import { NavLinks, TabBar } from './Nav';

export async function Header() {
  const { user, profile } = supabaseConfigured()
    ? await getSession()
    : { user: null, profile: null };
  const initial = (profile?.display_name || user?.email || '?').slice(0, 1).toUpperCase();
  return (
    <>
      <header className="site-header">
        <div className="container bar">
          <Link href="/" className="brand" aria-label="Biblioteca Umbandista — início">
            <img src="/logo.webp" alt="" />
            <span><b>Biblioteca</b><small>Umbandista</small></span>
          </Link>
          <NavLinks />
          <form role="search" action="/acervo" className="search">
            <Icon name="search" size={18} />
            <label htmlFor="q" className="sr-only">Buscar no acervo</label>
            <input id="q" name="q" type="search" placeholder="Títulos, autores, Orixás, linhas…" />
          </form>
          <div className="row" style={{ marginLeft: 'auto' }}>
            {isStaff(profile) ? <Link className="btn" href="/admin">Admin</Link> : null}
            {user ? (
              <Link href="/minha-biblioteca" className="btn btn-primary icon-btn" aria-label="Minha conta">{initial}</Link>
            ) : (
              <Link href="/entrar" className="btn">Entrar</Link>
            )}
          </div>
        </div>
      </header>
      <TabBar />
    </>
  );
}
