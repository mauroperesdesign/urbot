import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { getSession, isStaff, withCoverUrls } from '@/lib/data';
import { keywordAnswer, linkedSlugs, loadCatalog, stripUnknownLinks, systemPrompt } from '@/lib/assistente';
import { readingProgress, listeningProgress } from '@/lib/progress';

export const dynamic = 'force-dynamic';

const MODEL = process.env.ASSISTENTE_MODELO || 'claude-opus-5-5';
const MAX_TURNS = 12;
const MAX_CHARS = 800;
const PER_HOUR = 30;

// Limite simples por pessoa (protege o custo da API): 30 mensagens por hora
const recent = new Map<string, number[]>();
function allowed(userId: string) {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => now - t < 3600_000);
  if (list.length >= PER_HOUR) return false;
  list.push(now);
  recent.set(userId, list);
  return true;
}

type Turn = { role: 'user' | 'assistant'; content: string };

// Chat da Velinha: recomenda materiais do acervo que a pessoa pode acessar
export async function POST(req: Request) {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile || !(profile.approved || isStaff(profile))) return NextResponse.json({ error: 'Entre na sua conta para conversar com a Velinha.' }, { status: 401 });

  const body = await req.json().catch(() => null) as { messages?: Turn[] } | null;
  const turns = (body?.messages ?? [])
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
    .slice(-MAX_TURNS)
    .map((t) => ({ role: t.role, content: t.content.slice(0, t.role === 'user' ? MAX_CHARS : 4000) }));
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 });
  if (!allowed(user.id)) return NextResponse.json({ error: 'Ufa, conversamos bastante! Descansa um pouquinho e volta daqui a pouco 🕯️' }, { status: 429 });

  const catalog = await loadCatalog(supabase);
  let reply: string;

  if (!process.env.ANTHROPIC_API_KEY) {
    reply = keywordAnswer(turns[turns.length - 1].content, catalog);
  } else {
    const [reading, listening, { data: favs }] = await Promise.all([
      readingProgress(5), listeningProgress(5),
      supabase.from('favorites').select('materials(title)').limit(5),
    ]);
    const about = [
      `Nome: ${profile.display_name || 'membro'}.`,
      reading.length ? `Lendo agora: ${reading.map((r) => `${r.title} (${r.sub})`).join('; ')}.` : 'Não está lendo nada no momento.',
      listening.length ? `Ouvindo/assistindo: ${listening.map((r) => r.title).join('; ')}.` : '',
      favs?.length ? `Favoritos: ${(favs as unknown as { materials: { title: string } | null }[]).map((f) => f.materials?.title).filter(Boolean).join('; ')}.` : '',
    ].filter(Boolean).join('\n');

    try {
      const client = new Anthropic();
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        system: [
          // Instruções + catálogo: iguais para quem vê o mesmo acervo, ficam em cache
          { type: 'text', text: systemPrompt(catalog), cache_control: { type: 'ephemeral' } },
          { type: 'text', text: `Sobre a pessoa:\n${about}` },
        ],
        messages: turns,
      });
      if (response.stop_reason === 'refusal') {
        reply = 'Desculpa, não consigo ajudar com isso 🕯️ Mas posso te indicar materiais do acervo — sobre qual tema você quer estudar?';
      } else {
        reply = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim()
          || 'Hmm, me perdi aqui 😅 Pode repetir de outro jeito?';
      }
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'Muita gente conversando comigo agora! Tenta de novo em um minutinho 🕯️' }, { status: 503 });
      if (e instanceof Anthropic.AuthenticationError) console.error('assistente: chave da API inválida');
      else console.error('assistente:', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
      // Sem a IA no momento: responde com a busca por palavras
      reply = keywordAnswer(turns[turns.length - 1].content, catalog);
    }
  }

  reply = stripUnknownLinks(reply, catalog);
  const slugs = linkedSlugs(reply, catalog);
  const { data: rows } = slugs.length
    ? await supabase.from('materials').select('slug, title, type, cover_path').in('slug', slugs)
    : { data: [] };
  const cards = (await withCoverUrls(rows ?? [])).sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug))
    .map((m) => ({ slug: m.slug, title: m.title, type: m.type, coverUrl: m.coverUrl }));
  return NextResponse.json({ reply, materials: cards });
}
