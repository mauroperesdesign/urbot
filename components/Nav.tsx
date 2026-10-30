'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Icon } from './Icon';
import { SignOutButton } from './SignOutButton';

type NavItem = { href: string; label: string; icon: string; auth?: boolean };

const MAIN: NavItem[] = [
  { href: '/', label: 'Descobrir', icon: 'home' },
  { href: '/acervo', label: 'Acervo', icon: 'grid' },
  { href: '/minha-biblioteca', label: 'Minha biblioteca', icon: 'library', auth: true },
  { href: '/acervo?tipo=audiobook', label: 'Audiobooks', icon: 'headphones' },
  { href: '/listas', label: 'Minhas listas', icon: 'list', auth: true },
  { href: '/minha-biblioteca#favoritos', label: 'Favoritos', icon: 'heart', auth: true },
];
const PERSONAL: NavItem[] = [
  { href: '/perfil', label: 'Meu perfil', icon: 'user', auth: true },
  { href: '/agenda', label: 'Agenda', icon: 'calendar', auth: true },
];

export type PontosNav = { orixas: { slug: string; name: string }[]; linhas: { slug: string; name: string }[] };

function useActive() {
  const path = usePathname();
  const params = useSearchParams();
  return (href: string) => {
    if (href.includes('#')) return false;
    const [base, query] = href.split('?');
    if (base === '/') return path === '/';
    if (!path.startsWith(base)) return false;
    // "Acervo" e "Audiobooks" dividem a mesma página; o filtro de tipo decide qual fica ativo
    const tipo = new URLSearchParams(query ?? '').get('tipo');
    return (params.get('tipo') ?? null) === tipo;
  };
}

export function SideNav({ staff, signedIn, pontos }: { staff: boolean; signedIn: boolean; pontos: PontosNav }) {
  const isActive = useActive();
  const path = usePathname();
  const params = useSearchParams();
  const inAdmin = path.startsWith('/admin');
  const inPontos = path.startsWith('/pontos-cantados');
  const extra: NavItem[] = [
    ...(staff ? [{ href: '/admin', label: 'Administração', icon: 'shield' }] : []),
    ...(signedIn ? [{ href: '/conta', label: 'Conta', icon: 'settings' }] : []),
    { href: '/contato', label: 'Ajuda e contato', icon: 'help' },
  ];
  const item = (l: NavItem) => (
    <Link key={l.href} href={l.href} aria-current={isActive(l.href) || (l.href === '/admin' && inAdmin) ? 'page' : undefined}>
      <span className="ico"><Icon name={l.icon} size={18} /></span>{l.label}
    </Link>
  );
  return (
    <>
      {/* Áreas pessoais só aparecem para quem entrou */}
      <nav aria-label="Principal" className="side-nav">
        {MAIN.slice(0, 2).map(item)}
        {/* Pontos cantados: separados por Orixá e por linha de trabalho */}
        <details className="side-group" open={inPontos || undefined}>
          <summary aria-current={inPontos ? 'page' : undefined}>
            <span className="ico"><Icon name="music" size={18} /></span>Pontos cantados<span className="chev" aria-hidden="true"><Icon name="chevronDown" size={14} /></span>
          </summary>
          <div className="side-sub">
            <Link href="/pontos-cantados" aria-current={inPontos && !params.get('de') ? 'page' : undefined}>Todos os pontos</Link>
            {pontos.orixas.length ? <span className="side-sub-h">Orixás</span> : null}
            {pontos.orixas.map((o) => <Link key={o.slug} href={`/pontos-cantados?de=${o.slug}`} aria-current={params.get('de') === o.slug ? 'page' : undefined}>{o.name}</Link>)}
            {pontos.linhas.length ? <span className="side-sub-h">Linhas de trabalho</span> : null}
            {pontos.linhas.map((o) => <Link key={o.slug} href={`/pontos-cantados?de=${o.slug}`} aria-current={params.get('de') === o.slug ? 'page' : undefined}>{o.name}</Link>)}
          </div>
        </details>
        {MAIN.slice(2).filter((l) => signedIn || !l.auth).map(item)}
      </nav>
      {signedIn ? <nav aria-label="Pessoal" className="side-nav">{PERSONAL.map(item)}</nav> : null}
      <nav aria-label="Conta" className="side-nav">
        {extra.map(item)}
        {signedIn ? (
          <SignOutButton />
        ) : (
          <Link href="/entrar"><span className="ico"><Icon name="login" size={18} /></span>Entrar</Link>
        )}
      </nav>
    </>
  );
}

export function TabBar({ signedIn, staff, pontos }: { signedIn: boolean; staff: boolean; pontos: PontosNav }) {
  const isActive = useActive();
  const path = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path, params]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (path.startsWith('/ler') || path.startsWith('/admin')) return null;
  const tabs = signedIn
    ? [MAIN[0], MAIN[1], MAIN[2], PERSONAL[0]]
    : [MAIN[0], MAIN[1], MAIN[3], { href: '/entrar', label: 'Entrar', icon: 'login' }];
  return (
    <>
      {open ? (
        <div className="mobile-menu" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="mobile-menu-sheet" role="dialog" aria-modal="true" aria-label="Menu"
            onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}>
            <div className="mobile-menu-head">
              <b>Menu</b>
              <button type="button" className="btn btn-ghost icon-btn" onClick={() => setOpen(false)} aria-label="Fechar menu">✕</button>
            </div>
            <SideNav staff={staff} signedIn={signedIn} pontos={pontos} />
          </div>
        </div>
      ) : null}
      <nav aria-label="Navegação principal" className="tabbar">
        {tabs.map((l) => (
          <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? 'page' : undefined}>
            <Icon name={l.icon} />{l.label === 'Minha biblioteca' ? 'Biblioteca' : l.label === 'Descobrir' ? 'Início' : l.label === 'Meu perfil' ? 'Perfil' : l.label}
          </Link>
        ))}
        <button type="button" aria-expanded={open} aria-label="Abrir o menu completo" onClick={() => setOpen(!open)}>
          <Icon name="list" />Menu
        </button>
      </nav>
    </>
  );
}

export function AdminTabs({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const current = items.filter((i) => path === i.href || path.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Administração" className="chips">
      {items.map((n) => <Link key={n.href} href={n.href} className="chip" aria-current={n.href === current ? 'true' : undefined}>{n.label}</Link>)}
    </nav>
  );
}
