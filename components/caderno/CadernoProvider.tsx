'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Caderno } from './Caderno';

// Abre o caderno de estudos por cima de qualquer página (leitor, player, perfil).
// "about" diz o que a pessoa está estudando agora; "quote" é um trecho selecionado para virar nota.
export type CadernoRef = { about?: string; quote?: string };
type Ctx = { open: (ref?: CadernoRef) => void; close: () => void; isOpen: boolean };

const CadernoContext = createContext<Ctx>({ open: () => undefined, close: () => undefined, isOpen: false });
export const useCaderno = () => useContext(CadernoContext);

export function CadernoProvider({ children }: { children: React.ReactNode }) {
  const [ref, setRef] = useState<CadernoRef | null>(null);
  const path = usePathname();

  const open = useCallback((r: CadernoRef = {}) => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setRef({ ...r });
  }, []);
  const close = useCallback(() => setRef(null), []);

  // Ao trocar de página o caderno continua aberto, mas a referência antiga não vale mais
  useEffect(() => { setRef((r) => (r ? { about: undefined, quote: undefined } : r)); }, [path]);
  useEffect(() => {
    if (!ref) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('textarea, input')) setRef(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [ref]);

  return (
    <CadernoContext.Provider value={{ open, close, isOpen: !!ref }}>
      {children}
      {ref && path !== '/caderno' ? (
        <div className="cad-drawer" role="dialog" aria-label="Caderno de estudos">
          <Caderno compact about={ref.about} quote={ref.quote} onClose={close} />
        </div>
      ) : null}
    </CadernoContext.Provider>
  );
}
