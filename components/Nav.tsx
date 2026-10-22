'use client';

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

export function SideNav({ staff, signedIn }: { staff: boolean; signedIn: boolean }) {
  const isActive = useActive();
  const inAdmin = usePathname().startsWith('/admin');
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
      <nav aria-label="Principal" className="side-nav">{MAIN.filter((l) => signedIn || !l.auth).map(item)}</nav>
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

export function TabBar({ signedIn }: { signedIn: boolean }) {
  const isActive = useActive();
  const path = usePathname();
  if (path.startsWith('/ler') || path.startsWith('/admin')) return null;
  const tabs = signedIn
    ? [MAIN[0], MAIN[1], MAIN[2], { href: '/conta', label: 'Conta', icon: 'user' }]
    : [MAIN[0], MAIN[1], MAIN[3], { href: '/entrar', label: 'Entrar', icon: 'login' }];
  return (
    <nav aria-label="Navegação principal" className="tabbar">
      {tabs.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? 'page' : undefined}>
          <Icon name={l.icon} />{l.label === 'Minha biblioteca' ? 'Biblioteca' : l.label === 'Descobrir' ? 'Início' : l.label}
        </Link>
      ))}
    </nav>
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
