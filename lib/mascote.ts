// Mascote da ofensiva (a velinha): a imagem e a frase mudam conforme a constância de estudo.
// Nível pela % de dias estudados nos 7 dias até o último estudo; o nível máximo é para quem
// chegou a 10 dias seguidos. Cada dia inteiro sem estudar desce 1 nível (o dia de hoje só
// conta quando acaba). Quem já estudou hoje nunca vê a velinha triste.

export type Mood = { file: string; alt: string; phrases: string[] };
export type Level = { id: number; name: string; moods: Mood[] };

export const MAX_STREAK = 10;

const m = (file: string, alt: string, phrases: string[]): Mood => ({ file: `/mascote/${file}.webp`, alt, phrases });

export const LEVELS: Level[] = [
  {
    id: 1, name: 'Chama fraca',
    moods: [
      m('n1-desconfiada', 'Velinha desconfiada, apontando o dedo', [
        'Eu te vi online… e o livro, nada?',
        'Ah, então tem tempo pro celular e pra mim não?',
        'Tô de olho, viu? Uma página só já me deixa feliz.',
      ]),
      m('n1-chorando', 'Velinha chorando, com a chama apagada', [
        'Você me deixou apagar… 😭 Volta, por favor!',
        'Minha chama se foi… só uma leitura acende de novo.',
        'Fiquei aqui no escuro te esperando o dia inteiro.',
      ]),
      m('n1-suplicando', 'Velinha de mãos juntas, pedindo com os olhos cheios de lágrimas', [
        'Só cinco minutinhos de estudo? Por mim?',
        'Prometo que é rapidinho… lê um pouquinho comigo?',
        'Não me abandona, a gente estava indo tão bem…',
      ]),
      m('n1-emburrada', 'Velinha emburrada, de braços cruzados', [
        'Hunf. Nem vou falar nada… mas tô esperando.',
        'Tá bom, finge que esqueceu de mim. Eu não esqueci.',
        'Se quiser fazer as pazes, você sabe onde me achar: no acervo.',
      ]),
    ],
  },
  {
    id: 2, name: 'Cobrança',
    moods: [
      m('n2-espantada', 'Velinha espantada, com a mão na testa', [
        'Como assim você ainda não abriu nenhum livro hoje?!',
        'Eu pisquei e você sumiu de novo?!',
        'Não acredito… a gente tinha começado tão bem!',
      ]),
      m('n2-entediada', 'Velinha entediada, com o rosto apoiado na mão', [
        'Tô aqui esperando… e esperando… e esperando…',
        'Que tédio sem você estudando comigo.',
        'Vai me deixar acesa à toa hoje, é?',
      ]),
      m('n2-convidando', 'Velinha sorrindo e oferecendo um livro', [
        'Separei um livro pra você. Bora? 📖',
        'Chega mais, que hoje o estudo tá gostoso!',
        'Uma páginazinha só e a gente já esquenta essa chama.',
      ]),
      m('n2-brava', 'Velinha brava, batendo o pé', [
        'Ah, não! Sem estudo hoje eu não deixo!',
        'Tô ficando brava, hein! Abre esse livro!',
        'Bati o pé: hoje tem leitura e pronto!',
      ]),
    ],
  },
  {
    id: 3, name: 'Ofensiva boa',
    moods: [
      m('n3-confiante', 'Velinha confiante, com as mãos na cintura', [
        'Olha só quem tá pegando o ritmo! 😏',
        'Assim que eu gosto: constância!',
        'Tô orgulhosa, mas não vou dizer duas vezes.',
      ]),
      m('n3-anotando', 'Velinha anotando num caderno', [
        'Anotei aqui: você tá mandando bem!',
        'Bora registrar mais um dia de estudo?',
        'Quem anota, não esquece. E você não esqueceu de mim!',
      ]),
      m('n3-coracao', 'Velinha feliz fazendo coração com as mãos', [
        'Assim você me derrete… de alegria! 💛',
        'Obrigada por cuidar da nossa chama.',
        'Estudar junto com você é a melhor parte do meu dia.',
      ]),
      m('n3-lendo', 'Velinha sentada lendo um livro', [
        'Shh… tô no melhor capítulo. Vem ler também!',
        'Uma página por dia e a fé fica firme.',
        'Que leitura boa! Amanhã tem mais?',
      ]),
      m('n3-dancando', 'Velinha dançando de alegria', [
        'Isso! Mais um dia pra conta! 🎉',
        'Tá pegando fogo — do jeito bom!',
        'Ninguém segura essa ofensiva!',
      ]),
    ],
  },
  {
    id: 4, name: 'No topo',
    moods: [
      m('n4-livro-no-alto', 'Velinha erguendo um livro aberto com uma chama grande', [
        'Olha o tamanho dessa chama! Foi você que acendeu! ✨',
        'O saber ilumina, e você tá brilhando!',
        'Esse livro tá pegando fogo de tanto estudo!',
      ]),
      m('n4-pulando', 'Velinha pulando de alegria com os olhos brilhando', [
        'Não acredito! Você é incrível! 🤩',
        'Tô pulando de felicidade com essa ofensiva!',
        'Que orgulho de estudar com você!',
      ]),
      m('n4-vitoria', 'Velinha comemorando abraçada a um livro', [
        'Vitória! Mais um dia de estudo garantido! 💪',
        'Esse livro e eu somos seus fãs.',
        'Constância assim vira fundamento!',
      ]),
      m('n4-joinha', 'Velinha fazendo joinha com as duas mãos', [
        'Nota dez pra você! 👍👍',
        'Tá perfeito, continua assim!',
        'Aprovadíssima essa dedicação!',
      ]),
      m('n4-piscadinha', 'Velinha piscando e apontando para cima', [
        'Psiu… o próximo recorde é logo ali 😉',
        'Sabia que você ia chegar aqui!',
        'Agora é só manter, que o céu é o limite!',
      ]),
    ],
  },
  {
    id: 5, name: 'Chama lendária',
    moods: [
      m('n5-cosmica', 'Velinha flutuando com uma chama roxa cheia de estrelas', [
        'Você chegou num nível que nem eu sabia que existia… 🌌',
        'Essa chama já é coisa do astral!',
        'Duas semanas sem parar? Tô vendo estrelas!',
      ]),
      m('n5-tramando', 'Velinha em chamas, sorrindo e tramando algo', [
        'Hehehe… ninguém mais segura a gente.',
        'Tô planejando nosso próximo recorde… 😈',
        'Com essa constância, o fundamento já é seu.',
      ]),
      m('n5-oculos', 'Velinha em chamas usando óculos escuros', [
        'Brilho tanto que precisei de óculos 😎',
        'Estudar todo dia? Pra nós é rotina.',
        'Lendária. Sem mais.',
      ]),
      m('n5-determinada', 'Velinha em chamas com os punhos cerrados e olhos brilhando', [
        'Ninguém apaga essa chama! 🔥',
        'É foco, fé e leitura todo dia!',
        'Vamos com tudo, que hoje tem mais!',
      ]),
      m('n5-gargalhando', 'Velinha em chamas gargalhando de alegria', [
        'HAHAHA! Que ofensiva é essa?!',
        'Tô rindo à toa de tanto orgulho!',
        'Pode me chamar de fogueira agora!',
      ]),
    ],
  },
];

export type MascotInput = {
  current: number; today: boolean; week: { day: string; done: boolean }[];
  last_day?: string | null; last_run?: number; last_week?: number;
};

const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 86400000);

export function mascotLevel(s: MascotInput) {
  const todayIso = s.week[s.week.length - 1]?.day;
  if (!s.last_day || !todayIso) return { level: LEVELS[0], pct: 0, missed: 0 };
  // Nível que a pessoa tinha no último dia em que estudou
  const pct = Math.round(((s.last_week ?? 0) / 7) * 100);
  const base = (s.last_run ?? 0) >= MAX_STREAK ? 5 : pct >= 80 ? 4 : pct >= 50 ? 3 : pct >= 20 ? 2 : 1;
  // Dias inteiros que passaram sem estudo (hoje ainda não conta)
  const missed = Math.max(0, dayNum(todayIso) - dayNum(s.last_day) - 1);
  let id = Math.max(1, base - missed);
  if (s.today && id < 3) id = 3;
  return { level: LEVELS[id - 1], pct, missed };
}

// Escolhe a imagem e a frase do dia: muda a cada dia e cada pessoa vê uma combinação diferente
export function pickMascot(s: MascotInput, seed: string) {
  const { level, pct } = mascotLevel(s);
  const today = s.week[s.week.length - 1]?.day ?? '';
  const day = Math.floor(Date.parse(`${today}T12:00:00Z`) / 86400000) || 0;
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const mood = level.moods[(day + h) % level.moods.length];
  const phrase = mood.phrases[(Math.floor(day / level.moods.length) + h) % mood.phrases.length];
  return { level, mood, phrase, pct };
}
