// Teste no navegador dos recursos de estudo: EPUB, vídeo, cursos, listas, marcadores,
// anotações, leitura sem internet, estatísticas, boas-vindas e miniaturas.
// Uso: BASE_URL=http://localhost:3000 FIXTURES=/pasta/com/teste.pdf,teste.epub,aula.webm,pt.vtt \
//      node tests/e2e/recursos.mjs   (lê .env.local para a chave de serviço do Supabase local)
// Requer admin@teste.local (admin) e membro@teste.local (aprovado), senha das fixtures do criterios.mjs.
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

for (const line of fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const FIX = process.env.FIXTURES;
const PASS = 'senha-segura-123';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const assert = (c, m) => { if (!c) throw new Error(m); };
async function check(name, fn) {
  try { await fn(); results.push([name, 'OK']); console.log(`✔ ${name}`); }
  catch (e) { results.push([name, 'FALHOU']); console.log(`✘ ${name}\n   ${String(e.message).split('\n')[0]}`); }
}
const run = Date.now().toString(36);
const slug = (s) => `e2e-${s}-${run}`;

async function material(s, title, type, file, mime, role = 'main') {
  const { data: m, error } = await sb.from('materials').insert({
    slug: slug(s), title, type, status: 'published', visibility: 'restricted', publication_authorized: true, language: 'pt',
    description: `Material de teste (${title}).`,
  }).select('id, slug').single();
  if (error) throw error;
  if (file) await upload(m.id, file, mime, role);
  return m;
}
async function upload(materialId, file, mime, role, title) {
  const p = `e2e/${run}/${path.basename(file)}`;
  const { error } = await sb.storage.from('materials').upload(p, fs.readFileSync(path.join(FIX, file)), { contentType: mime, upsert: true });
  if (error) throw error;
  await sb.from('files').insert({ material_id: materialId, role, bucket: 'materials', path: p, mime_type: mime, title: title ?? file, processing_status: 'ready' });
}
async function login(ctx, email) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/entrar`);
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', PASS);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/entrar')), p.click('form button[type=submit]')]);
  return p;
}

const { data: member } = await sb.from('profiles').select('id').eq('email', 'membro@teste.local').single();
const pdf = await material('pdf', 'PDF de teste E2E', 'book', 'teste.pdf', 'application/pdf');
const epub = await material('epub', 'EPUB de teste E2E', 'book', 'teste.epub', 'application/epub+zip');
const video = await material('video', 'Vídeo de teste E2E', 'video_lesson', 'aula.webm', 'video/webm');
await upload(video.id, 'pt.vtt', 'text/vtt', 'subtitle', 'pt.vtt');
const course = await material('curso', 'Curso de teste E2E', 'course', null);
await sb.from('course_items').insert([
  { course_id: course.id, material_id: pdf.id, position: 0, section: 'Módulo 1' },
  { course_id: course.id, material_id: epub.id, position: 1, section: 'Módulo 1' },
]);

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
try {
  await check('Visitante vê a página de boas-vindas', async () => {
    const p = await (await browser.newContext()).newPage();
    await p.goto(BASE);
    assert(await p.locator('#boas-vindas').isVisible(), 'sem boas-vindas');
    assert(await p.locator('.welcome a[href="/cadastro"]').count() === 1, 'sem botão Criar conta');
    assert(!(await p.locator('.sidebar a[href="/minha-biblioteca"], .sidebar a[href="/listas"]').count()), 'visitante vê Minha biblioteca/listas no menu');
    const r = await p.goto(`${BASE}/minha-biblioteca`);
    assert(p.url().includes('/entrar'), `minha biblioteca abriu sem login (${r.status()})`);
  });

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['microphone'] });
  const page = await login(ctx, 'membro@teste.local');

  await check('Cards usam miniaturas leves das capas', async () => {
    await page.goto(BASE);
    const srcs = await page.locator('.bcard img').evaluateAll((els) => els.map((e) => e.getAttribute('src') ?? ''));
    assert(srcs.length > 0, 'nenhuma capa');
    assert(srcs.some((s) => s.includes('/thumbs/')), 'nenhuma miniatura em uso');
  });

  await check('Leitor de EPUB abre, mostra o texto e salva o progresso', async () => {
    await page.goto(`${BASE}/ler/${epub.slug}`);
    const frame = page.frameLocator('iframe').first();
    await frame.locator('text=Capítulo 1').first().waitFor({ timeout: 20000 });
    await page.click('button:has-text("Próxima")'); await page.waitForTimeout(800);
    await page.click('button:has-text("Sumário")');
    await page.click('aside >> text=Capítulo 2 — Os caminhos');
    await frame.locator('h1:has-text("Capítulo 2")').waitFor({ timeout: 10000 });
    await page.waitForTimeout(2500);
    const { data } = await sb.from('reading_progress').select('location').eq('user_id', member.id).eq('material_id', epub.id).maybeSingle();
    assert(data?.location?.startsWith('epubcfi('), `progresso não salvo: ${data?.location}`);
  });

  await check('Marcador e anotação no EPUB', async () => {
    await page.click('button[aria-label="Marcar este ponto"]');
    await page.click('button[aria-label="Marcadores e anotações"]');
    await page.fill('#nota', 'Anotação EPUB de teste');
    await page.click('button:has-text("Salvar anotação")');
    await page.locator('aside li >> text=Anotação EPUB de teste').waitFor({ timeout: 8000 });
    const { count: b } = await sb.from('bookmarks').select('id', { count: 'exact', head: true }).eq('material_id', epub.id).eq('user_id', member.id);
    const { count: n } = await sb.from('annotations').select('id', { count: 'exact', head: true }).eq('material_id', epub.id).eq('user_id', member.id);
    assert(b === 1 && n === 1, `marcadores=${b} anotações=${n}`);
  });

  await check('PDF: texto selecionável, marcador e anotação com trecho citado', async () => {
    await page.goto(`${BASE}/ler/${pdf.slug}`);
    await page.locator('canvas[aria-label^="Página"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[class*=textLayer] span')).some((s) => (s.textContent ?? '').trim().length > 3), null, { timeout: 15000 });
    await page.evaluate(() => {
      const span = Array.from(document.querySelectorAll('[class*=textLayer] span')).find((s) => (s.textContent ?? '').trim().length > 3);
      const r = document.createRange(); r.selectNodeContents(span); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    });
    await page.click('button[aria-label="Marcadores e anotações"]');
    const quoted = await page.locator('aside blockquote').innerText();
    assert(quoted.trim().length > 3, 'trecho não foi citado');
    await page.fill('#nota', 'Nota no PDF');
    await page.click('button:has-text("Salvar anotação")');
    await page.locator('aside li >> text=Nota no PDF').waitFor();
    await page.click('button[aria-label="Marcar esta página"]');
    await page.locator('button[aria-label="Remover marcador desta página"]').waitFor();
    // Sair logo em seguida pelo "voltar" não pode perder o ponto onde parou
    await page.click('a[aria-label="Voltar ao material"]');
    await page.waitForURL(/\/material\//);
    await page.waitForTimeout(800);
    const { data: rp } = await sb.from('reading_progress').select('location').eq('user_id', member.id).eq('material_id', pdf.id).maybeSingle();
    assert(rp?.location === '1', `progresso não salvo ao sair: ${rp?.location}`);
  });

  await check('Anotação abre o leitor no ponto certo (?local=)', async () => {
    await page.goto(`${BASE}/minha-biblioteca`);
    await page.locator('#h-notas').waitFor();
    const href = await page.locator('a.lesson:has-text("Nota no PDF")').getAttribute('href');
    assert(href?.includes(`/ler/${pdf.slug}?local=1`), `link: ${href}`);
  });

  await check('Salvar PDF para ler sem internet e abrir offline', async () => {
    await page.goto(`${BASE}/ler/${pdf.slug}`);
    await page.locator('canvas[aria-label^="Página"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null || navigator.serviceWorker?.ready, null, { timeout: 10000 });
    await page.reload(); await page.locator('canvas[aria-label^="Página"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.click('button[aria-label="Salvar para ler sem internet"]');
    await page.locator('button[aria-label^="Disponível sem internet"]').waitFor({ timeout: 20000 });
    await ctx.setOffline(true);
    try {
      await page.goto(`${BASE}/ler/${pdf.slug}`);
      await page.locator('canvas[aria-label^="Página"]').waitFor({ state: 'visible', timeout: 20000 });
      const alerts = (await page.locator('[role=alert]').allInnerTexts()).filter((t) => t.trim());
      assert(!alerts.length, `erro ao abrir offline: ${alerts}`);
      // Obs.: o modo offline do Playwright não vale para o service worker; a abertura sem servidor
      // (página do leitor e página "sem internet") é verificada desligando o servidor do site.
    } finally { await ctx.setOffline(false); }
  });

  await check('Listas pessoais: criar pela página do material, ver e tirar', async () => {
    await page.goto(`${BASE}/material/${epub.slug}`);
    await page.click('summary:has-text("Salvar em lista")');
    await page.fill('#lista-nova', `Para estudar ${run}`);
    await page.click('.list-picker-menu button:has-text("Criar")');
    await page.locator('summary:has-text("✓")').waitFor();
    await page.goto(`${BASE}/listas`);
    await page.click(`text=Para estudar ${run}`);
    await page.locator('.bcard:has-text("EPUB de teste E2E")').waitFor();
    await page.click('button:has-text("Tirar da lista")');
    await page.locator('text=Lista vazia').waitFor();
  });

  await check('Vídeo: reproduz, tem legenda e salva a posição', async () => {
    await page.goto(`${BASE}/assistir/${video.slug}`);
    const v = page.locator('video');
    await v.waitFor();
    assert(await page.locator('video track').count() === 1, 'sem legenda');
    await page.evaluate(async () => { const el = document.querySelector('video'); el.muted = true; await el.play(); });
    await page.waitForTimeout(3500);
    await page.evaluate(() => document.querySelector('video').pause());
    await page.waitForTimeout(1500);
    const { data } = await sb.from('media_progress').select('position_seconds').eq('user_id', member.id).eq('material_id', video.id).maybeSingle();
    assert(Number(data?.position_seconds) >= 2, `posição: ${data?.position_seconds}`);
  });

  await check('Leituras e vídeos: conta quantas vezes foi iniciado e concluído', async () => {
    const counts = async (id) => (await sb.from('material_reads').select('kind, completed_at').eq('material_id', id).eq('user_id', member.id)).data ?? [];
    await page.goto(`${BASE}/ler/${pdf.slug}?local=9`);
    await page.locator('.textLayer, [class*=textLayer]').first().waitFor();
    await page.waitForTimeout(2000);
    const r = await counts(pdf.id);
    assert(r.length === 1 && r[0].completed_at, `PDF até a última página não concluiu: ${JSON.stringify(r)}`);
    await page.goto(`${BASE}/material/${pdf.slug}`);
    const box = await page.locator('.read-counts').innerText();
    assert(/Leitura iniciada\s+1 vez/.test(box) && /Leitura concluída\s+1 vez/.test(box), `contagem: ${box}`);
    await page.goto(`${BASE}/assistir/${video.slug}`);
    await page.locator('video').waitFor();
    await page.evaluate(async () => {
      const el = document.querySelector('video'); el.muted = true;
      await new Promise((ok) => (el.readyState >= 1 ? ok() : el.addEventListener('loadedmetadata', ok, { once: true })));
      el.currentTime = Math.max(0, el.duration - 1); await el.play();
      await new Promise((ok) => el.addEventListener('ended', ok, { once: true }));
    });
    await page.waitForTimeout(1500);
    const v = await counts(video.id);
    assert(v.some((x) => x.kind === 'watch' && x.completed_at), `vídeo até o fim não concluiu: ${JSON.stringify(v)}`);
    await page.goto(`${BASE}/material/${video.slug}`);
    assert((await page.locator('.read-counts').innerText()).includes('Vídeo concluído'), 'sem contagem do vídeo');
  });

  await check('Curso trancado: membro pede acesso, admin libera, aulas aparecem', async () => {
    await page.goto(`${BASE}/material/${course.slug}`);
    assert(await page.locator('.course-lock').isVisible(), 'curso não está trancado');
    assert(!(await page.locator('.lessons .lesson').count()), 'aulas visíveis sem liberação');
    await page.click('button:has-text("Pedir acesso")');
    await page.locator('text=Pedido de acesso enviado').waitFor();
    const adm = await login(await browser.newContext({ viewport: { width: 1366, height: 900 } }), 'admin@teste.local');
    await adm.goto(`${BASE}/admin`);
    await adm.locator('text=Pedidos de acesso a cursos').waitFor();
    await adm.goto(`${BASE}/admin/materiais/${course.id}`);
    await adm.click('section[aria-label="Quem tem acesso ao curso"] button:has-text("Liberar")');
    await adm.locator('section[aria-label="Quem tem acesso ao curso"] button:has-text("Tirar acesso")').waitFor();
    await adm.context().close();
    await page.goto(`${BASE}/material/${course.slug}`);
    const titles = await page.locator('.lessons .lesson-t b').allInnerTexts();
    assert(titles[0] === 'PDF de teste E2E' && titles[1] === 'EPUB de teste E2E', `ordem: ${titles}`);
    assert(await page.locator('.mhero-actions a:has-text("Continuar curso")').count() === 1, 'sem Continuar curso');
  });

  await check('Aula exclusiva de curso some do acervo para quem não foi liberado', async () => {
    await sb.from('materials').update({ course_only: true }).eq('id', epub.id);
    await sb.from('course_access').delete().eq('course_id', course.id).eq('user_id', member.id);
    const r = await page.goto(`${BASE}/material/${epub.slug}`);
    assert(r.status() === 404, `sem liberação abriu (${r.status()})`);
    await sb.from('course_access').insert({ course_id: course.id, user_id: member.id });
    const r2 = await page.goto(`${BASE}/material/${epub.slug}`);
    assert(r2.status() === 200, `liberado não abriu (${r2.status()})`);
    await sb.from('materials').update({ course_only: false }).eq('id', epub.id);
  });

  await check('Início separa "Continue lendo" e "Continue ouvindo"', async () => {
    await page.goto(BASE);
    const lendo = (await page.locator('section:has(#h-lendo) .bcard').allInnerTexts()).join(' | ');
    const ouvindo = (await page.locator('section:has(#h-ouvindo) .bcard').allInnerTexts()).join(' | ');
    assert(lendo.includes("EPUB de teste E2E") && lendo.includes("PDF de teste E2E"), `lendo: ${lendo.replace(/\n/g, " / ")}`);
    assert(ouvindo.includes('Vídeo de teste E2E') && !ouvindo.includes('PDF de teste'), `ouvindo: ${ouvindo}`);
  });

  await check('Mensagem do dia e data especial no topo da página inicial', async () => {
    const now = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'numeric' }).formatToParts(new Date());
    const day = Number(now.find((x) => x.type === 'day').value), month = Number(now.find((x) => x.type === 'month').value);
    const { data: sp } = await sb.from('calendar_dates').insert({ month, day, title: `Data especial E2E ${run}`, greeting: 'Saravá!' }).select('id').single();
    try {
      await page.goto(BASE);
      assert((await page.locator('.special-day').allInnerTexts()).join(' ').includes(`Data especial E2E ${run}`), 'sem destaque do dia');
      const first = await page.locator('.daily-msg blockquote').innerText();
      assert(/^Mensagem (de|do|da) /.test(await page.locator('.daily-msg-head b').innerText()), 'sem título da mensagem');
      let changed = false;
      for (let i = 0; i < 5 && !changed; i++) { await page.click('.daily-msg button:has-text("Outra mensagem")'); changed = (await page.locator('.daily-msg blockquote').innerText()) !== first; }
      assert(changed, 'Outra mensagem não trocou');
    } finally { await sb.from('calendar_dates').delete().eq('id', sp.id); }
  });

  await check('Pontos cantados: menu por Orixá e Linha, lista os pontos', async () => {
    const { data: cat } = await sb.from('categories').select('id').eq('slug', 'pontos-de-ogum').single();
    await sb.from('material_categories').insert({ material_id: pdf.id, category_id: cat.id });
    await page.goto(BASE);
    await page.click('.sidebar summary:has-text("Pontos cantados")');
    await page.click('.side-sub a:has-text("Ogum")');
    await page.waitForURL(/de=pontos-de-ogum/);
    assert(await page.locator('.bcard:has-text("PDF de teste E2E")').count() === 1, 'ponto não listado');
    assert(await page.locator('.side-sub a:has-text("Preto Velho")').count() === 1, 'sem linha Preto Velho no menu');
  });

  await check('Nota de voz de até 10 segundos no leitor', async () => {
    await page.goto(`${BASE}/ler/${pdf.slug}`);
    await page.locator('canvas[aria-label^="Página"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.click('button[aria-label="Marcadores e anotações"]');
    await page.click('button:has-text("Gravar voz")');
    await page.locator('button:has-text("Gravando")').waitFor();
    await page.waitForTimeout(2200);
    await page.click('button[aria-label="Parar gravação"]');
    await page.locator('.voice-rec audio').waitFor();
    await page.fill('#nota', 'Nota com voz');
    await page.click('button:has-text("Salvar anotação")');
    await page.locator('aside li >> text=Nota com voz').waitFor({ timeout: 10000 });
    const { data } = await sb.from('annotations').select('audio_path').eq('user_id', member.id).eq('note', 'Nota com voz').single();
    assert(data?.audio_path?.startsWith(`${member.id}/`), `sem áudio: ${data?.audio_path}`);
    const { data: obj } = await sb.storage.from('notes').download(data.audio_path);
    assert(obj && obj.size > 500, 'arquivo de áudio vazio');
    // limite de 10 s: a gravação para sozinha
    await page.click('button:has-text("Gravar voz")');
    await page.locator('.voice-rec audio').waitFor({ timeout: 14000 });
  });

  await check('Meu perfil: páginas lidas, minutos, continue lendo/ouvindo e caderno por livro', async () => {
    await page.goto(`${BASE}/perfil`);
    const tiles = await page.locator('.stat-tile').allInnerTexts();
    const pages = Number((tiles.find((t) => t.startsWith('Páginas lidas')) ?? '').replace(/\D+/g, ' ').trim().split(' ')[0]);
    assert(pages >= 1, `páginas: ${tiles}`);
    assert(tiles.some((t) => t.startsWith('Minutos escutados')), 'sem minutos');
    const { data: lt } = await sb.from('listening_time').select('seconds').eq('user_id', member.id).eq('material_id', video.id).maybeSingle();
    assert((lt?.seconds ?? 0) >= 2, `tempo de vídeo não somado: ${lt?.seconds}`);
    assert(await page.locator('#ouvindo .lesson:has-text("Vídeo de teste E2E")').count() === 1, 'sem "onde parei de ouvir"');
    const book = page.locator('details.notebook:has-text("PDF de teste E2E")');
    assert((await book.innerText()).includes('Nota no PDF') && (await book.innerText()).includes('Nota com voz'), 'caderno sem as notas do livro');
    assert(await book.locator('button:has-text("Ouvir nota de voz")').count() >= 1, 'caderno sem nota de voz');
  });

  await check('Agenda: datas da religião e compromisso pessoal', async () => {
    const year = new Date().getFullYear();
    await page.goto(`${BASE}/agenda?ano=${year}&dia=${year}-11-15`);
    assert((await page.locator('.cal-holy-card').innerText()).includes('Dia Nacional da Umbanda'), 'sem 15/11');
    assert(await page.locator('.cal-day[data-holy="true"]').count() >= 15, 'poucas datas marcadas');
    await page.fill('input[name=title]', `Gira E2E ${run}`);
    await page.click('button:has-text("Adicionar")');
    await page.locator(`.cal-event:has-text("Gira E2E ${run}")`).waitFor();
    assert(await page.locator(`a.cal-day[href*="dia=${year}-11-15"][data-mine="true"]`).count() === 1, 'dia sem marcação de compromisso');
    await sb.from('agenda_events').delete().eq('user_id', member.id).like('title', `%${run}`);
  });

  await check('Agenda: link para Google Agenda / iPhone (.ics) traz compromissos e datas, e pode ser trocado', async () => {
    const day = new Date().toISOString().slice(0, 10);
    await sb.from('agenda_events').insert({ user_id: member.id, day, title: `Sync E2E, ${run}; teste` });
    await page.goto(`${BASE}/agenda#sincronizar`);
    if (await page.locator('#sincronizar button:has-text("Desligar")').count()) {
      page.once('dialog', (d) => d.accept());
      await page.click('#sincronizar button:has-text("Desligar")');
      await page.locator('#sincronizar button:has-text("Criar link")').waitFor();
    }
    await page.click('#sincronizar button:has-text("Criar link")');
    const link = await page.locator('#sincronizar input[readonly]').inputValue();
    assert(/\/api\/agenda\/[a-f0-9]{64}\.ics$/.test(link), `link estranho: ${link}`);
    assert((await page.locator('#sincronizar a:has-text("iPhone")').getAttribute('href')).startsWith('webcal://'), 'sem webcal');
    assert((await page.locator('#sincronizar a:has-text("Google")').getAttribute('href')).includes('calendar.google.com/calendar/render?cid=webcal'), 'sem Google');
    const ics = await (await fetch(link)).text(); // sem sessão, como um app de calendário
    assert(ics.startsWith('BEGIN:VCALENDAR') && ics.includes(`SUMMARY:Sync E2E\\, ${run}\\; teste`), 'compromisso ausente no .ics');
    assert(ics.includes('SUMMARY:Dia Nacional da Umbanda') && ics.includes('RRULE:FREQ=YEARLY'), 'datas da religião ausentes');
    assert(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'linha longa demais no .ics');
    page.once('dialog', (d) => d.accept());
    await page.click('#sincronizar button:has-text("Gerar novo link")');
    await page.waitForFunction((old) => { const v = document.querySelector('#sincronizar input[readonly]')?.value; return !!v && v !== old; }, link);
    assert((await fetch(link)).status === 404, 'link antigo continua funcionando');
    page.once('dialog', (d) => d.accept());
    await page.click('#sincronizar button:has-text("Desligar")');
    await page.locator('#sincronizar button:has-text("Criar link")').waitFor();
    await sb.from('agenda_events').delete().eq('user_id', member.id).like('title', `%${run}%`);
  });

  await check('Celular: botão "Menu" abre o menu completo (Pontos cantados, Agenda…)', async () => {
    const mob = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() })).newPage();
    await mob.goto(BASE);
    assert(!(await mob.locator('.sidebar').isVisible()), 'menu lateral visível no celular');
    await mob.click('.tabbar button:has-text("Menu")');
    await mob.click('.mobile-menu a:has-text("Agenda")');
    await mob.waitForURL(/\/agenda/);
    await mob.locator('.mobile-menu').waitFor({ state: 'detached' });
    await mob.click('.tabbar button:has-text("Menu")');
    await mob.click('.mobile-menu summary:has-text("Pontos cantados")');
    await mob.click('.mobile-menu .side-sub a:has-text("Caboclo")');
    await mob.waitForURL(/de=pontos-de-caboclo/);
    await mob.context().close();
  });

  await check('Avaliações: membro dá nota e resenha, edita; média aparece; equipe pode remover', async () => {
    await page.goto(`${BASE}/material/${epub.slug}#avaliacoes`);
    await page.click('#avaliacoes .star-input label:nth-of-type(4)');
    await page.fill('#avaliacoes textarea[name=body]', `Resenha E2E ${run}`);
    await page.click('#avaliacoes button:has-text("Publicar avaliação")');
    await page.waitForURL(/avaliacao=ok/);
    assert((await page.locator('.review-avg > b').innerText()) === '4,0', 'média errada');
    assert((await page.locator('.mhero-rating').innerText()).includes('1 avaliação'), 'nota não aparece no topo');
    await page.click('#avaliacoes .star-input label:nth-of-type(5)');
    await page.click('#avaliacoes button:has-text("Atualizar avaliação")');
    await page.waitForFunction(() => document.querySelector('.review-avg > b')?.textContent === '5,0');
    assert(await page.locator('#avaliacoes textarea[name=body]').inputValue() === `Resenha E2E ${run}`, 'resenha não ficou salva');
    const admin = await login(await browser.newContext({ viewport: { width: 1366, height: 900 } }), 'admin@teste.local');
    await admin.goto(`${BASE}/material/${epub.slug}#avaliacoes`);
    const card = admin.locator(`.review:has-text("Resenha E2E ${run}")`);
    await card.waitFor();
    admin.once('dialog', (d) => d.accept());
    await card.locator('button:has-text("Remover")').click();
    await card.waitFor({ state: 'detached' });
    await admin.context().close();
    const { count } = await sb.from('reviews').select('id', { count: 'exact', head: true }).eq('material_id', epub.id);
    assert(count === 0, 'avaliação não foi removida');
  });

  await check('Membro não acessa estatísticas (nem pela função do banco)', async () => {
    const r = await page.goto(`${BASE}/admin/estatisticas`);
    assert(!page.url().includes('/admin/estatisticas') || r.status() >= 400, `membro abriu: ${page.url()}`);
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await anon.auth.signInWithPassword({ email: 'membro@teste.local', password: PASS });
    const { error } = await anon.rpc('admin_stats', { days: 30 });
    assert(error, 'membro conseguiu chamar admin_stats');
  });

  await check('Sair apaga do aparelho os materiais salvos offline', async () => {
    await page.goto(`${BASE}/minha-biblioteca`);
    await Promise.all([page.waitForURL(`${BASE}/`), page.click('.sidebar button:has-text("Sair")')]);
    const keys = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('biblioteca-offline')));
    assert(keys.length === 0, `ainda há: ${keys}`);
  });

  const admin = await login(await browser.newContext({ viewport: { width: 1366, height: 900 } }), 'admin@teste.local');
  await check('Admin: estatísticas mostram acessos', async () => {
    await admin.goto(`${BASE}/admin/estatisticas`);
    const tiles = await admin.locator('.stat-tile').allInnerTexts();
    assert(tiles.length === 6, `tiles: ${tiles.length}`);
    assert(await admin.locator('.daychart-col').count() === 30, 'gráfico diário incompleto');
    assert((await admin.locator('#h-top ~ table tbody tr').count()) > 0, 'sem ranking');
  });

  await check('Admin: monta e reordena aulas do curso', async () => {
    await admin.goto(`${BASE}/admin/materiais/${course.id}`);
    await admin.selectOption('#nova-aula', video.id);
    await admin.fill('#nova-secao', 'Módulo 2');
    await admin.click('button:has-text("Adicionar aula")');
    await admin.locator('section[aria-label="Aulas do curso"] li:has-text("Vídeo de teste E2E")').waitFor();
    await admin.locator('section[aria-label="Aulas do curso"] li').nth(2).locator('button[aria-label="Subir"]').click();
    await admin.waitForTimeout(1500);
    const { data } = await sb.from('course_items').select('material_id, position').eq('course_id', course.id).order('position');
    assert(data.map((d) => d.material_id).join() === [pdf.id, video.id, epub.id].join(), 'ordem não mudou');
  });
} finally {
  await browser.close();
  // limpeza
  await sb.from('collections').delete().eq('user_id', member.id).like('name', `%${run}`);
  await sb.from('course_access').delete().eq('course_id', course.id);
  const { data: voice } = await sb.from('annotations').select('audio_path').eq('user_id', member.id).not('audio_path', 'is', null);
  if (voice?.length) await sb.storage.from('notes').remove(voice.map((v) => v.audio_path));
  const ids = [pdf.id, epub.id, video.id, course.id];
  const { data: files } = await sb.from('files').select('path').in('material_id', ids);
  await sb.storage.from('materials').remove((files ?? []).map((f) => f.path));
  await sb.from('materials').delete().in('id', ids);
}

const ok = results.filter((r) => r[1] === 'OK').length;
console.log(`\n${ok}/${results.length} verificações aprovadas.`);
process.exit(ok === results.length ? 0 : 1);
