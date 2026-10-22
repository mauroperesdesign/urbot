import Link from 'next/link';
import { Icon } from '@/components/Icon';

// Página inicial de quem ainda não entrou: o acervo é de uso interno do terreiro
export function Welcome() {
  const items = [
    { icon: 'book', t: 'Livros e apostilas', d: 'Leia no próprio site, no celular ou no computador, e continue de onde parou.' },
    { icon: 'headphones', t: 'Audiobooks', d: 'Ouça com velocidade ajustável, temporizador e controle na tela de bloqueio.' },
    { icon: 'note', t: 'Estudo organizado', d: 'Marcadores, anotações, listas pessoais e trilhas de estudo.' },
  ];
  return (
    <section className="welcome" aria-labelledby="boas-vindas">
      <div className="welcome-hero">
        <img src="/logo.webp" alt="" className="welcome-logo" />
        <span className="eyebrow" style={{ color: '#9DB6FF' }}>Grupo de Estudos da Umbanda En Tenda</span>
        <h1 id="boas-vindas">Biblioteca Umbandista</h1>
        <p>O acervo de estudos do terreiro: livros, apostilas, pontos, orações e audiobooks, organizados por tema e respeitando a diversidade de fundamentos e linhagens.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link href="/entrar" className="btn btn-primary" style={{ minHeight: 48, minWidth: 150 }}>Entrar</Link>
          <Link href="/cadastro" className="btn" style={{ minHeight: 48, minWidth: 150 }}>Criar conta</Link>
        </div>
        <small>O acesso ao acervo é liberado pela administração do terreiro depois do cadastro.</small>
      </div>
      <div className="welcome-grid">
        {items.map((i) => (
          <div key={i.t} className="panel stack" style={{ ['--gap' as string]: '8px' }}>
            <span className="welcome-ico"><Icon name={i.icon} size={20} /></span>
            <b>{i.t}</b>
            <span className="muted" style={{ fontSize: 13.5 }}>{i.d}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
