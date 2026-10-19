import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Instrument_Serif, Manrope, Literata } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/Header';
import { PlayerProvider } from '@/components/player/PlayerProvider';
import { MiniPlayer } from '@/components/player/MiniPlayer';

const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });
const sans = Manrope({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const read = Literata({ subsets: ['latin'], variable: '--font-read', display: 'swap' });

const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: 'Biblioteca Umbandista', template: '%s · Biblioteca Umbandista' },
  description: 'Acervo de estudo do Grupo de Estudos da Umbanda En Tenda: livros, apostilas e audiobooks organizados por tema.',
  openGraph: { type: 'website', siteName: 'Biblioteca Umbandista', locale: 'pt_BR', images: ['/logo.webp'] },
  icons: { icon: '/logo.webp' },
};

export const viewport: Viewport = { themeColor: '#0E3B2E', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${serif.variable} ${sans.variable} ${read.variable}`}>
      <body>
        <PlayerProvider>
          <a href="#conteudo" className="sr-only">Pular para o conteúdo</a>
          <Header />
          <main id="conteudo" className="page">{children}</main>
          <footer className="footer">
            <div className="container stack" style={{ ['--gap' as string]: '8px' }}>
              <span>Acervo de estudo do Grupo de Estudos da Umbanda En Tenda. Respeitamos a diversidade de fundamentos, linhagens e interpretações.</span>
              <span className="row" style={{ ['--gap' as string]: '6px 18px' }}>
                <Link href="/sobre">Sobre</Link>
                <Link href="/contato">Contato</Link>
                <Link href="/privacidade">Privacidade</Link>
                <Link href="/termos">Termos de uso</Link>
                <Link href="/contato#direitos">Direitos autorais</Link>
              </span>
            </div>
          </footer>
          <MiniPlayer />
        </PlayerProvider>
      </body>
    </html>
  );
}
