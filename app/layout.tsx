import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Poppins, Literata } from 'next/font/google';
import './globals.css';
import { Sidebar, Topbar, currentTheme } from '@/components/Header';
import { PlayerProvider } from '@/components/player/PlayerProvider';
import { MiniPlayer } from '@/components/player/MiniPlayer';

const sans = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' });
const read = Literata({ subsets: ['latin'], variable: '--font-read', display: 'swap' });

const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: 'Biblioteca Umbandista', template: '%s · Biblioteca Umbandista' },
  description: 'Acervo de estudo do Grupo de Estudos da Umbanda En Tenda: livros, apostilas e audiobooks organizados por tema.',
  openGraph: { type: 'website', siteName: 'Biblioteca Umbandista', locale: 'pt_BR', images: ['/logo.webp'] },
  icons: { icon: '/logo.webp' },
};

export const viewport: Viewport = { themeColor: '#1F5EFF', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme={currentTheme()} className={`${sans.variable} ${read.variable}`}>
      <body>
        <PlayerProvider>
          <a href="#conteudo" className="sr-only">Pular para o conteúdo</a>
          <div className="app">
            <Sidebar />
            <div className="app-main">
              <Topbar />
              <main id="conteudo" className="app-content">{children}</main>
              <footer className="footer">
                <div className="stack" style={{ ['--gap' as string]: '6px' }}>
                  <span>Acervo de estudo do Grupo de Estudos da Umbanda En Tenda. Respeitamos a diversidade de fundamentos, linhagens e interpretações.</span>
                  <span className="row" style={{ ['--gap' as string]: '6px 16px' }}>
                    <Link href="/sobre">Sobre</Link>
                    <Link href="/contato">Contato</Link>
                    <Link href="/privacidade">Privacidade</Link>
                    <Link href="/termos">Termos de uso</Link>
                    <Link href="/contato#direitos">Direitos autorais</Link>
                  </span>
                </div>
              </footer>
            </div>
          </div>
          <MiniPlayer />
        </PlayerProvider>
      </body>
    </html>
  );
}
