'use client';

import { useState } from 'react';
import { Icon } from './Icon';

// Guarda a escolha num cookie para o servidor já entregar a página no tema certo (sem piscar)
export function ThemeToggle({ initial }: { initial: 'light' | 'dark' }) {
  const [theme, setTheme] = useState(initial);
  const dark = theme === 'dark';
  return (
    <button type="button" className="theme-btn" aria-pressed={dark}
      aria-label={dark ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'} title={dark ? 'Modo claro' : 'Modo escuro'}
      onClick={() => {
        const next = dark ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        document.cookie = `tema=${next === 'dark' ? 'escuro' : 'claro'}; path=/; max-age=31536000; samesite=lax`;
        setTheme(next);
      }}>
      <Icon name={dark ? 'sun' : 'moon'} size={19} />
    </button>
  );
}
