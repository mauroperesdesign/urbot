// Envia o lembrete diário da ofensiva (notificação push) para quem ligou o lembrete.
// Roda de hora em hora (cron); cada aparelho recebe no máximo 1 por dia, no horário escolhido.
// Uso:
//   node scripts/notificar-ofensiva.mjs           (envia para quem está no horário atual)
//   node scripts/notificar-ofensiva.mjs --agora   (envia já para todos que ainda não receberam hoje — teste)
//   node scripts/notificar-ofensiva.mjs --agora --simular   (só mostra as mensagens, sem enviar)
// Precisa de NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT.
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const f = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv } = process.env;
if (!url || !key || !pub || !priv) { console.error('Faltam variáveis (Supabase ou VAPID).'); process.exit(1); }
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contato@example.com', pub, priv);
const sb = createClient(url, key, { auth: { persistSession: false } });

const now = new Date();
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(now);
const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(now));
const dayNumber = Math.floor(Date.parse(`${today}T12:00:00Z`) / 86400000);

let q = sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth, last_sent_on').or(`last_sent_on.is.null,last_sent_on.lt.${today}`);
if (!process.argv.includes('--agora')) q = q.eq('hour', hour);
const [{ data: subs, error }, { data: phrases }] = await Promise.all([
  q, sb.from('streak_phrases').select('text').eq('active', true).order('created_at').order('id'),
]);
if (error) { console.error(error.message); process.exit(1); }
const list = (phrases ?? []).map((p) => p.text);
if (!list.length) list.push('Que tal estudar um pouco hoje?');

// Cada pessoa percorre as frases em ordem, começando de um ponto diferente (não recebem todos a mesma)
const offset = (id) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
const streaks = new Map();
let sent = 0, gone = 0, failed = 0;

for (const s of subs ?? []) {
  if (!streaks.has(s.user_id)) streaks.set(s.user_id, (await sb.rpc('streak_of', { uid: s.user_id })).data);
  const st = streaks.get(s.user_id) ?? { current: 0, today: false };
  const phrase = list[(dayNumber + offset(s.user_id)) % list.length];
  const title = st.today
    ? `🔥 ${dias(st.current)} de ofensiva!`
    : st.current
      ? `🔥 Sua ofensiva de ${dias(st.current)} está esperando`
      : '🔥 Comece uma nova ofensiva hoje';
  const body = `${phrase}\n${st.today ? 'Você já estudou hoje. Até amanhã!' : 'Separe uns minutos para estudar sobre a religião.'}`;
  if (process.argv.includes('--simular')) { console.log(`[simulação] ${title} | ${body.replace('\n', ' | ')}`); continue; }
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, url: '/' }), { TTL: 6 * 3600 });
    await sb.from('push_subscriptions').update({ last_sent_on: today }).eq('id', s.id);
    sent++;
  } catch (e) {
    // Aparelho desinscreveu ou trocou de navegador: remove a inscrição
    if (e.statusCode === 404 || e.statusCode === 410) { await sb.from('push_subscriptions').delete().eq('id', s.id); gone++; console.error(`removida (${e.statusCode}): ${s.endpoint.slice(0, 60)}…`); }
    else { failed++; console.error(`falha (${e.statusCode ?? '?'}): ${String(e.body ?? e.message).slice(0, 200)}`); }
  }
}
console.log(`${today} ${String(hour).padStart(2, '0')}h — enviadas: ${sent}, removidas: ${gone}, falhas: ${failed}`);
