import type { Metadata } from 'next';
import { OfflineList } from '../minha-biblioteca/OfflineList';

export const metadata: Metadata = { title: 'Sem internet', robots: { index: false } };

export default function Offline() {
  return (
    <div className="container stack" style={{ ['--gap' as string]: '20px', maxWidth: 760 }}>
      <div className="panel stack">
        <h1 className="page-title">Você está sem internet</h1>
        <p className="muted" style={{ margin: 0 }}>Os materiais que você salvou neste aparelho continuam disponíveis para leitura. O progresso volta a ser salvo quando a conexão voltar.</p>
      </div>
      <OfflineList />
    </div>
  );
}
