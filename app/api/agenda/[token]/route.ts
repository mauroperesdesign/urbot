import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type Feed = {
  events: { id: string; day: string; title: string; notes: string | null; created_at: string }[];
  holy: { id: string; month: number; day: number; title: string; description: string | null; greeting: string | null }[];
};

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const stamp = (d: Date) => `${ymd(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Linhas do iCalendar têm no máximo 75 bytes; as seguintes começam com um espaço
function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function allDay(uid: string, start: Date, summary: string, description: string, extra: string[] = [], created = new Date()) {
  const end = new Date(start.getTime() + 86400000);
  return [
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp(created)}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(end)}`, ...extra,
    `SUMMARY:${text(summary)}`, ...(description ? [`DESCRIPTION:${text(description)}`] : []),
    'TRANSP:TRANSPARENT', 'END:VEVENT',
  ];
}

// Link de assinatura da agenda (Google Agenda, Calendário do iPhone, Outlook…).
// Não usa a sessão: quem tem o link secreto vê a agenda do dono; trocar o link desliga o antigo.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token.replace(/\.ics$/, '');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !/^[a-f0-9]{40,}$/.test(token)) return new Response('Link inválido.', { status: 404 });

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
  const { data, error } = await supabase.rpc('calendar_feed', { t: token });
  if (error) return new Response('Agenda indisponível no momento.', { status: 503 });
  if (!data) return new Response('Este link foi desligado. Gere um novo na Agenda da Biblioteca.', { status: 404 });
  const feed = data as Feed;
  const host = (process.env.NEXT_PUBLIC_SITE_URL || 'biblioteca.local').replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Biblioteca Umbandista//Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Agenda · Biblioteca Umbandista', 'X-WR-TIMEZONE:America/Sao_Paulo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
  ];
  for (const e of feed.events) {
    const [y, m, d] = e.day.split('-').map(Number);
    lines.push(...allDay(`agenda-${e.id}@${host}`, new Date(Date.UTC(y, m - 1, d)), e.title, e.notes ?? '', [], new Date(e.created_at)));
  }
  // Datas da religião: repetem todo ano a partir de 2024 (ano bissexto, para aceitar 29/2)
  for (const h of feed.holy) {
    const desc = [h.description, h.greeting].filter(Boolean).join('\n');
    lines.push(...allDay(`religiao-${h.id}@${host}`, new Date(Date.UTC(2024, h.month - 1, h.day)), h.title, desc, ['RRULE:FREQ=YEARLY'], new Date(Date.UTC(2024, 0, 1))));
  }
  lines.push('END:VCALENDAR');

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="agenda.ics"',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
