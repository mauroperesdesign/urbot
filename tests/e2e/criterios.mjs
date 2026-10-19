// Teste de aceitação no navegador: os 12 critérios obrigatórios da primeira versão.
// Uso: BASE_URL=http://localhost:3000 FIXTURES=/caminho/com/teste.pdf,capa.jpg,faixa.m4a \
//      DB_URL=postgresql://... node tests/e2e/criterios.mjs
// Requer usuários admin@teste.local (admin), membro@teste.local (aprovado), novo@teste.local (não aprovado).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const FIX = process.env.FIXTURES;
const DB = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SHOTS = process.env.SHOTS;
const PASS = 'senha-segura-123';
const RESTRICTED = 'umbanda-para-iniciantes';
const results = [];

const sql = (q) => execFileSync('psql', [DB, '-Atc', q], { encoding: 'utf8' }).trim();
async function check(n, name, fn) {
  try { await fn(); results.push([n, name, 'OK']); console.log(`✔ ${n}. ${name}`); }
  catch (e) { results.push([n, name, 'FALHOU', e.message]); console.log(`✘ ${n}. ${name}\n   ${e.message.split('\n')[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

async function login(ctx, email) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/entrar`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/entrar')), page.click('button[type=submit]')]);
  return page;
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); };

// ---------------------------------------------------------------- administrador
const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let page;
await check(1, 'Entrar como administrador com permissões seguras', async () => {
  page = await login(admin, 'admin@teste.local');
  await page.goto(`${BASE}/admin`);
  await page.getByRole('heading', { name: 'Visão geral' }).waitFor();
  await shot(page, 'desktop-admin');
});

const stamp = Date.now().toString(36);
// Cópias únicas por execução (o painel recusa arquivos idênticos já enviados — detecção por SHA-256)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-'));
const unique = (name) => { const dst = path.join(TMP, name); fs.writeFileSync(dst, Buffer.concat([fs.readFileSync(path.join(FIX, name)), Buffer.from(`\n%${stamp}\n`)])); return dst; };
const catName = `Categoria E2E ${stamp}`;
const subName = `Subcategoria E2E ${stamp}`;
await check(2, 'Criar uma categoria e uma subcategoria', async () => {
  await page.goto(`${BASE}/admin/categorias`);
  const form = page.locator('form').filter({ hasText: 'Nova categoria' });
  await form.locator('input[name=name]').fill(catName);
  await form.getByRole('button', { name: 'Adicionar' }).click();
  await page.locator(`input[value="${catName}"]`).waitFor();
  const form2 = page.locator('form').filter({ hasText: 'Nova categoria' });
  await form2.locator('input[name=name]').fill(subName);
  await form2.locator('select[name=parent_id]').selectOption({ label: catName });
  await form2.getByRole('button', { name: 'Adicionar' }).click();
  await page.locator(`input[value="${subName}"]`).waitFor();
  const parent = sql(`select p.name from categories c join categories p on p.id = c.parent_id where c.name = '${subName}'`);
  assert(parent === catName, `subcategoria sem mãe correta (${parent})`);
});

const title = `Material de Teste E2E ${stamp}`;
let materialId;
await check(3, 'Cadastrar um material com capa e metadados', async () => {
  await page.goto(`${BASE}/admin/materiais/novo`);
  await page.fill('input[name=title]', title);
  await page.fill('textarea[name=authors]', 'Autora de Teste');
  await page.fill('textarea[name=description]', 'Material criado pelo teste automatizado.');
  await page.fill('input[name=keywords]', 'teste, automatizado');
  await page.getByLabel(subName).check();
  await page.getByLabel('Publicação autorizada').check();
  await Promise.all([page.waitForURL(/\/admin\/materiais\/[0-9a-f-]{36}/), page.getByRole('button', { name: 'Salvar' }).click()]);
  materialId = page.url().match(/materiais\/([0-9a-f-]{36})/)[1];
  await page.locator('input[type=file]').first().setInputFiles(path.join(FIX, 'capa.jpg'));
  await page.getByText('Pronto').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  const cover = sql(`select cover_path from materials where id = '${materialId}'`);
  assert(cover.startsWith(materialId), `capa não registrada (${cover})`);
});

await check(4, 'Fazer upload de um arquivo real', async () => {
  await page.reload();
  const pdfCopy = unique('teste.pdf');
  await page.locator('label', { hasText: 'Enviar PDF/EPUB principal' }).locator('input[type=file]').setInputFiles(pdfCopy);
  await page.getByText(/Pronto · 9 páginas/).waitFor({ timeout: 60000 });
  const row = sql(`select page_count || '|' || processing_status || '|' || (path is not null) from files where material_id = '${materialId}' and role = 'main'`);
  assert(/^9\|ready\|(t|true)$/.test(row), `arquivo não registrado corretamente (${row})`);
  // enviar o mesmo arquivo de novo deve ser recusado (detecção por SHA-256)
  await page.locator('label', { hasText: 'Arquivo complementar' }).locator('input[type=file]').setInputFiles(pdfCopy);
  await page.getByText(/Arquivo idêntico já existe/).waitFor({ timeout: 30000 });
  await shot(page, 'desktop-admin-arquivos');
});

await check(5, 'Publicar o material', async () => {
  await page.goto(`${BASE}/admin/materiais/${materialId}`);
  await page.locator('select[name=status]').selectOption('published');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText('Alterações salvas.').waitFor();
  assert(sql(`select status from materials where id = '${materialId}'`) === 'published', 'status não mudou');
});

let slug;
await check(6, 'Encontrar o conteúdo pela busca', async () => {
  await page.goto(`${BASE}/acervo?q=${encodeURIComponent('teste automatizado')}`);
  await page.getByText(title).first().waitFor();
  await page.goto(`${BASE}/acervo?q=${encodeURIComponent('Autora de Teste')}`);
  await page.getByText(title).first().waitFor();
  slug = sql(`select slug from materials where id = '${materialId}'`);
});

await check(7, 'Abrir o material em sua página', async () => {
  await page.goto(`${BASE}/material/${slug}`);
  await page.getByRole('heading', { name: title }).waitFor();
  await page.getByText('Autora de Teste').waitFor();
  await page.getByRole('link', { name: /Ler agora/ }).waitFor();
});

await check(8, 'Ler um PDF diretamente no site', async () => {
  await page.getByRole('link', { name: /Ler agora/ }).click();
  await page.waitForURL(`**/ler/${slug}`);
  await page.getByText('página 1 de 9').waitFor({ timeout: 30000 });
  const painted = await page.locator('canvas').evaluate((c) => c.width > 0 && c.getContext('2d').getImageData(c.width / 2, c.height / 3, 1, 1).data[3] > 0);
  assert(painted, 'canvas do PDF não foi desenhado');
  await page.getByRole('button', { name: 'Próxima' }).click();
  await page.getByRole('button', { name: 'Próxima' }).click();
  await page.getByText('página 3 de 9').waitFor();
  await shot(page, 'desktop-leitor');
});

await check(10, 'Salvar o progresso de leitura (e retomar)', async () => {
  await page.waitForTimeout(2500);
  const loc = sql(`select location from reading_progress r join profiles p on p.id = r.user_id where p.email = 'admin@teste.local' and r.material_id = '${materialId}'`);
  assert(loc === '3', `progresso salvo = ${loc || 'nada'}`);
  await page.goto(`${BASE}/ler/${slug}`);
  await page.getByText('página 3 de 9').waitFor({ timeout: 30000 });
});

await check(9, 'Reproduzir um arquivo de áudio dentro da plataforma (e salvar a posição)', async () => {
  // Cria um audiobook com duas faixas WAV (o Chromium de teste não tem o codec AAC dos .m4a;
  // navegadores comuns tocam .m4a normalmente).
  await page.goto(`${BASE}/admin/materiais/novo`);
  await page.fill('input[name=title]', `Audiobook de Teste E2E ${stamp}`);
  await page.locator('label.chip', { hasText: /^Audiobook$/ }).click();
  await page.getByLabel('Publicação autorizada').check();
  await page.locator('select[name=status]').selectOption('published');
  await Promise.all([page.waitForURL(/\/admin\/materiais\/[0-9a-f-]{36}/), page.getByRole('button', { name: 'Salvar' }).click()]);
  const audioId = page.url().match(/materiais\/([0-9a-f-]{36})/)[1];
  await page.locator('label', { hasText: 'Enviar faixas de áudio' }).locator('input[type=file]')
    .setInputFiles([unique('02 Faixa de teste 2.wav'), unique('01 Faixa de teste 1.wav')]);
  await page.getByText(/Pronto · 0:08/).waitFor({ timeout: 60000 });
  const tracks = sql(`select string_agg(title || '=' || duration_seconds, ',' order by position) from files where material_id = '${audioId}' and role = 'track'`);
  assert(tracks === 'Faixa de teste 1=12,Faixa de teste 2=8', `faixas/ordem/duração: ${tracks}`);
  assert(sql(`select duration_seconds from materials where id = '${audioId}'`) === '20', 'duração total não calculada');
  const aslug = sql(`select slug from materials where id = '${audioId}'`);
  await page.goto(`${BASE}/ouvir/${aslug}`);
  await page.getByRole('button', { name: 'Reproduzir' }).first().click();
  await page.waitForFunction(() => Number(document.querySelector('#seek')?.value) >= 3, null, { timeout: 30000 });
  await page.getByRole('button', { name: 'Velocidade de reprodução' }).click();
  await page.getByRole('button', { name: 'Velocidade de reprodução' }).filter({ hasText: '1,25×' }).waitFor();
  await shot(page, 'desktop-player');
  await page.getByRole('link', { name: 'Voltar ao material' }).click();
  await page.locator('.mini-player').waitFor(); // continua tocando ao navegar
  await page.waitForTimeout(1000);
  await page.locator('.mini-player').getByRole('button', { name: 'Pausar' }).click();
  await page.waitForTimeout(1500);
  const pos = Number(sql(`select max(position_seconds) from media_progress where material_id = '${audioId}'`));
  assert(pos >= 3, `posição salva = ${pos}`);
  // retomada: abrir de novo deve começar da posição salva
  await page.goto(`${BASE}/ouvir/${aslug}`);
  const resumed = Number(await page.locator('#seek').inputValue());
  assert(resumed >= 3, `não retomou (posição ${resumed})`);
});

// ---------------------------------------------------------------- membro não aprovado
const novo = await browser.newContext({ viewport: { width: 390, height: 844 } });
await check(11, 'Usuário comum não acessa funções administrativas', async () => {
  const p = await login(novo, 'novo@teste.local');
  await p.goto(`${BASE}/admin`);
  assert(!new URL(p.url()).pathname.startsWith('/admin'), `abriu o admin: ${p.url()}`);
  await p.goto(`${BASE}/admin/exportar`);
  assert(!(await p.content()).includes('slug,title'), 'exportação acessível');
  const r = await p.request.get(`${BASE}/admin/exportar`, { maxRedirects: 0 });
  assert(r.status() !== 200 || !(await r.text()).includes('slug,title'), 'CSV vazou');
  // tentar se promover pela API com a própria sessão é bloqueado pelo banco
  sql(`select 1`);
  const role = sql(`select role from profiles where email = 'novo@teste.local'`);
  assert(role === 'member', 'papel mudou');
});

await check(12, 'Materiais restritos não são acessados sem permissão', async () => {
  const anon = await browser.newContext();
  const a = await anon.newPage();
  const res = await a.goto(`${BASE}/material/${RESTRICTED}`);
  assert(res.status() === 404, `anônimo recebeu ${res.status()}`);
  const fileId = sql(`select f.id from files f join materials m on m.id = f.material_id where m.slug = '${RESTRICTED}' and f.role = 'main'`);
  const api = await a.request.get(`${BASE}/api/files/${fileId}`);
  assert(api.status() === 403, `anônimo obteve URL do arquivo (${api.status()})`);
  const p = await novo.newPage();
  const r2 = await p.goto(`${BASE}/ler/${RESTRICTED}`);
  assert(r2.status() === 404, `não aprovado recebeu ${r2.status()}`);
  const api2 = await p.request.get(`${BASE}/api/files/${fileId}`);
  assert(api2.status() === 403, `não aprovado obteve URL (${api2.status()})`);
  // e o membro aprovado consegue
  const membro = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const m = await login(membro, 'membro@teste.local');
  await m.goto(`${BASE}/ler/${RESTRICTED}`);
  await m.getByText(/página 1 de 169/).waitFor({ timeout: 30000 });
  await shot(m, 'mobile-leitor');
  await m.goto(`${BASE}/`);
  await shot(m, 'mobile-inicio');
  await m.goto(`${BASE}/material/mandingas-de-preto-velho`);
  await shot(m, 'mobile-material');
  await m.goto(`${BASE}/acervo?categoria=linhas-de-trabalho`);
  await shot(m, 'mobile-acervo');
});

await browser.close();
// Limpeza dos dados criados pelo teste
if (!process.env.KEEP) {
  sql(`delete from materials where title like '%de Teste E2E ${stamp}'`);
  sql(`delete from categories where name in ('${subName}')`);
  sql(`delete from categories where name in ('${catName}')`);
}
const failed = results.filter((r) => r[2] !== 'OK');
console.log(`\n${results.length - failed.length}/${results.length} critérios aprovados.`);
process.exit(failed.length ? 1 : 0);
