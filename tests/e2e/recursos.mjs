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

const browser = await chromium.launch();
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

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
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

  await check('Início mostra "Continue de onde parou" com vídeo e leitura', async () => {
    await page.goto(BASE);
    const cont = page.locator('section:has(#h-cont) .bcard');
    const txt = (await cont.allInnerTexts()).join(' | ');
    assert(txt.includes('Vídeo de teste E2E') && txt.includes('Continuar assistindo'), txt);
    assert(txt.includes('EPUB de teste E2E'), txt);
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
  const ids = [pdf.id, epub.id, video.id, course.id];
  const { data: files } = await sb.from('files').select('path').in('material_id', ids);
  await sb.storage.from('materials').remove((files ?? []).map((f) => f.path));
  await sb.from('materials').delete().in('id', ids);
}

const ok = results.filter((r) => r[1] === 'OK').length;
console.log(`\n${ok}/${results.length} verificações aprovadas.`);
process.exit(ok === results.length ? 0 : 1);
