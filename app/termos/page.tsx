import type { Metadata } from 'next';
import { Prose } from '@/components/Prose';
export const metadata: Metadata = { title: 'Termos de uso' };
export default function Terms() {
  return (
    <Prose title="Termos de uso">
      <p>O acervo é destinado ao estudo dos membros do Grupo de Estudos da Umbanda En Tenda. Os materiais restritos são de uso interno e não devem ser redistribuídos.</p>
      <p>O acesso pessoal é intransferível. A administração pode suspender contas em caso de uso indevido.</p>
      <p>Os conteúdos refletem a perspectiva de seus autores e das casas de origem, identificada sempre que conhecida. A biblioteca não trata interpretações específicas como verdades universais da Umbanda.</p>
      <p>Pedidos relacionados a direitos autorais podem ser feitos pela página de contato.</p>
    </Prose>
  );
}
