'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';

const LINKS = [
  { href: '/', label: 'Início', icon: 'home' },
  { href: '/acervo', label: 'Acervo', icon: 'search' },
  { href: '/acervo?tipo=audiobook', label: 'Audiobooks', icon: 'headphones' },
  { href: '/minha-biblioteca', label: 'Biblioteca', icon: 'library' },
];

function useActive() {
  const path = usePathname();
  return (href: string) => {
    const base = href.split('?')[0];
    return base === '/' ? path === '/' : path.startsWith(base);
  };
}

export function NavLinks() {
  const isActive = useActive();
  return (
    <nav aria-label="Principal" className="nav-links">
      {LINKS.filter((l) => l.label !== 'Audiobooks').map((l) => (
        <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? 'page' : undefined}>{l.label}</Link>
      ))}
    </nav>
  );
}

export function TabBar() {
  const isActive = useActive();
  const path = usePathname();
  if (path.startsWith('/ler') || path.startsWith('/admin')) return null;
  return (
    <nav aria-label="Navegação principal" className="tabbar">
      {[LINKS[0], LINKS[1], LINKS[3], { href: '/conta', label: 'Conta', icon: 'user' }].map((l) => (
        <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? 'page' : undefined}>
          <Icon name={l.icon} />{l.label}
        </Link>
      ))}
    </nav>
  );
}
