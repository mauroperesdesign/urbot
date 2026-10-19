import type { Metadata } from 'next';
import { Prose } from '@/components/Prose';
export const metadata: Metadata = { title: 'Contato' };
const EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
export default function Contact() {
  return (
    <Prose title="Contato">
      <p>Dúvidas sobre o acervo, pedidos de acesso ou sugestões de materiais: {EMAIL ? <a href={`mailto:${EMAIL}`}>{EMAIL}</a> : 'fale com a administração do terreiro.'}</p>
      <h2 id="direitos" style={{ fontSize: 30, marginTop: 32 }}>Direitos autorais</h2>
      <p>Se você é titular de direitos de algum material deste acervo e deseja solicitar a restrição, substituição ou remoção do acesso, entre em contato {EMAIL ? <>pelo e-mail <a href={`mailto:${EMAIL}?subject=Direitos%20autorais`}>{EMAIL}</a></> : 'com a administração'} informando o título do material e o vínculo com a obra. A solicitação é analisada e o acesso pode ser suspenso enquanto isso.</p>
    </Prose>
  );
}
