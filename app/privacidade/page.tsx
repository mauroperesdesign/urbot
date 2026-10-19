import type { Metadata } from 'next';
import { Prose } from '@/components/Prose';
export const metadata: Metadata = { title: 'Política de privacidade' };
export default function Privacy() {
  return (
    <Prose title="Política de privacidade">
      <p><b>O que guardamos.</b> Seu e-mail e nome de exibição (para a conta), seu progresso de leitura e de audição, favoritos, marcadores e anotações (para você continuar de onde parou) e registros de acesso aos materiais (para estatísticas internas do acervo).</p>
      <p><b>Quem vê.</b> Progresso, favoritos, listas e anotações são privados: só você os vê. A administração vê apenas dados de conta (nome, e-mail, papel) e números agregados de acesso.</p>
      <p><b>Onde fica.</b> Os dados ficam no banco de dados e no armazenamento do Supabase, com regras de acesso por usuário. Não vendemos nem compartilhamos seus dados.</p>
      <p><b>Seus direitos.</b> Você pode pedir a correção ou a exclusão da sua conta e dos seus dados a qualquer momento pela página de contato.</p>
      <p>Usamos apenas os cookies necessários para manter sua sessão. No seu aparelho, o leitor guarda a preferência de tema de leitura.</p>
    </Prose>
  );
}
