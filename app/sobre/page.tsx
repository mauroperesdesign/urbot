import type { Metadata } from 'next';
import { Prose } from '@/components/Prose';
export const metadata: Metadata = { title: 'Sobre o projeto' };
export default function About() {
  return (
    <Prose title="Sobre o projeto">
      <p>A Biblioteca Umbandista é o acervo digital de estudo do Grupo de Estudos da Umbanda En Tenda. Reúne livros, apostilas e audiobooks para consulta, leitura e escuta diretamente no site.</p>
      <p>A Umbanda é diversa: cada casa, linhagem e escola tem seus fundamentos. Por isso, sempre que possível, cada material indica a tradição ou a perspectiva que apresenta, sem tratar a interpretação de uma vertente como verdade universal.</p>
      <p>Materiais de Candomblé, Ifá, tradição iorubá e Kimbanda aparecem numa categoria própria, identificados como tradições distintas.</p>
    </Prose>
  );
}
