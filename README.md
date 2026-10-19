# Biblioteca Umbandista

Acervo digital de estudo do Grupo de Estudos da Umbanda En Tenda: livros, apostilas e audiobooks com leitura e escuta no próprio site, área pessoal e painel administrativo.

**Tecnologia:** Next.js 14 (App Router) · Supabase (PostgreSQL, autenticação e armazenamento) · pdf.js · upload retomável (TUS).

## O que já funciona (Etapa 1 + base da Etapa 2)

| Área | Situação |
|---|---|
| Login, cadastro, recuperação e redefinição de senha | ✅ |
| Papéis `member` / `editor` / `admin` + aprovação de membros | ✅ (só admin altera, verificado no banco) |
| Acervo com busca (título, autor, descrição, palavras-chave, sem acento), filtros por categoria/subcategoria e formato, paginação | ✅ |
| Página de cada material com URL amigável, capa, ficha, faixas, direitos, relacionados | ✅ |
| Leitor de PDF: páginas, zoom, ajuste à largura/página, sumário do PDF, busca no texto, tela cheia, gestos no celular, modos claro/sépia/escuro, progresso salvo e retomado | ✅ |
| Player de áudio: faixas, ±15/30 s, velocidade 0,75×–2×, temporizador, volume, fila automática, player persistente entre páginas, controles na tela de bloqueio, progresso salvo e retomado | ✅ |
| Minha biblioteca: continuar lendo/ouvindo, favoritos | ✅ |
| Painel admin: visão geral com números reais, materiais (filtros, pendências, ações em lote), formulário que muda por tipo, envio de capa/PDF/faixas com progresso e retomada, detecção de arquivo duplicado (SHA-256), leitura real de páginas e duração, categorias hierárquicas, usuários e permissões, exportação CSV | ✅ |
| Arquivos privados com URL assinada e temporária; RLS em todas as tabelas e buckets | ✅ testado |
| SEO: títulos, descrições, Open Graph, `robots.txt`, `sitemap.xml` (só materiais públicos), `noindex` nas páginas privadas | ✅ |
| Leitor EPUB, vídeos, cursos/trilhas, listas personalizadas, anotações na interface, extração de texto para busca | ⏳ próximas etapas (as tabelas de anotações, marcadores e listas já existem) |

## Como colocar no ar

### 1. Criar o projeto no Supabase
1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo (região São Paulo).
2. Em **Project Settings → API**, copie a **Project URL**, a chave **anon public** e a chave **service_role** (secreta).
3. Plano: o acervo atual tem ~1,3 GB de arquivos; o plano gratuito armazena 1 GB. Para todos os arquivos, use o plano Pro.

### 2. Aplicar o banco de dados
Com a [CLI do Supabase](https://supabase.com/docs/guides/cli) (já incluída como dependência):
```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push        # aplica supabase/migrations/*.sql
```
(Alternativa sem CLI: cole o conteúdo de cada arquivo de `supabase/migrations/` no **SQL Editor**, na ordem.)

Em **Authentication → URL Configuration**, defina o *Site URL* (ex.: `https://biblioteca.seudominio.com`) e adicione `https://SEU-SITE/auth/callback` nas *Redirect URLs*.

### 3. Configurar e rodar o site
```bash
cp .env.example .env.local   # preencha URL, anon key e site URL
npm install
npm run dev                  # http://localhost:3000
```

### 4. Tornar-se administrador
Cadastre-se pelo site e, no **SQL Editor** do Supabase, rode uma única vez:
```sql
update public.profiles set role = 'admin', approved = true where email = 'seu-email@exemplo.com';
```
Daqui em diante, dê permissões pelo painel em **/admin/usuarios**. Um usuário comum nunca consegue mudar o próprio papel (a coluna é protegida no banco).

### 5. Importar o acervo
Coloque `SUPABASE_SERVICE_ROLE_KEY` no `.env.local` (só na sua máquina) e rode:
```bash
node scripts/import-acervo.mjs --simular           # confere o que será feito
node scripts/import-acervo.mjs                     # metadados, categorias, autores, faixas e capas
node scripts/import-acervo.mjs --enviar-arquivos   # baixa PDFs e áudios do Drive e envia ao Storage
node scripts/import-acervo.mjs --publicar          # publica (uso interno autorizado)
```
Os materiais entram como **restritos** (só membros aprovados). Pendências de revisão (autor a confirmar, título diferente na capa, ordem de faixas) ficam visíveis em **/admin/materiais → Só com pendências**. O script é idempotente: rodar de novo atualiza em vez de duplicar.

### 6. Publicar na internet
**Na VPS própria (escolhido para este projeto):** siga [`deploy/PASSO-A-PASSO.md`](deploy/PASSO-A-PASSO.md) — um instalador configura Supabase, site, HTTPS, firewall, backup e importação.

Alternativa sem servidor: [Vercel](https://vercel.com) → *Import Project* → este repositório → defina `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (e, opcional, `NEXT_PUBLIC_CONTACT_EMAIL`). **Não** coloque a `service_role` na Vercel.

## Segurança

- **RLS** em todas as tabelas. Visitantes veem só materiais publicados e públicos; membros aprovados veem os restritos publicados; rascunhos só a equipe.
- Progresso, favoritos, marcadores, anotações e listas: cada usuário vê apenas os seus.
- Notas internas ficam numa tabela separada, acessível só à equipe.
- Buckets `covers` e `materials` são **privados**; o site gera URLs assinadas de curta duração apenas para quem tem acesso.
- Limites de tamanho e tipos MIME aceitos são definidos nos buckets (e validados também no painel).
- Publicar exige “publicação autorizada” registrada (restrição no banco).
- Testes automatizados das regras: `npm run test:db` (sobe um PostgreSQL temporário e verifica anônimo, membro não aprovado, membro aprovado e admin).

## Backups e recuperação

- O Supabase faz backup diário do banco (planos pagos; o Pro guarda 7 dias, com opção de recuperação a um ponto no tempo).
- Faça também uma cópia própria periódica: `npx supabase db dump -f backup.sql` (estrutura + dados) e exporte o acervo em **/admin/exportar**.
- Os arquivos originais continuam no Google Drive; se o Storage for perdido, `node scripts/import-acervo.mjs --enviar-arquivos` reenvia tudo a partir do Drive (os registros guardam o `drive_id`).
- Para restaurar: crie um projeto, `npx supabase db push`, `psql < backup.sql` e reenvie os arquivos.

## Estrutura

```
app/                 páginas (acervo, material, ler, ouvir, admin, conta…)
components/          capa, cabeçalho, leitor de PDF, player de áudio
lib/                 cliente Supabase, sessão/permissões, rótulos
supabase/migrations  esquema, RLS, buckets e categorias iniciais
supabase/tests       testes das regras de acesso
scripts/             geração do catálogo, extração de capas e importação
data/                catálogo do acervo (CSV/JSON) e capas
```
