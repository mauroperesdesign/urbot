import type { Metadata } from 'next';
import { requireUser } from '@/lib/data';
import { Caderno } from '@/components/caderno/Caderno';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Caderno de estudos', robots: { index: false } };

// Caderno de estudos em tela cheia (também abre por cima do leitor e do player)
export default async function CadernoPage() {
  await requireUser('/caderno');
  return (
    <div className="container cad-page">
      <Caderno />
    </div>
  );
}
