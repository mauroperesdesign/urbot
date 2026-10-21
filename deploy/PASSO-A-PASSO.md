# Instalação na VPS — passo a passo

Tempo total: ~30–40 minutos (a maior parte é o instalador trabalhando sozinho).

> **Oracle Cloud (VPS OCI):** o usuário pode ser `ubuntu` em vez de `root`. Nesse caso entre com `ssh ubuntu@IP` e rode `sudo -i` antes dos comandos.

Você vai precisar de:
- o **IP** da VPS e a **senha de root** (estão no painel da hospedagem / e-mail de boas-vindas);
- o **domínio** (ex.: `entenda.com.br`) e acesso ao lugar onde ele é gerenciado (Registro.br, HostGator, Cloudflare…);
- uma conta no **GitHub** com acesso a este repositório.

---

## Passo 1 — Conferir o sistema da VPS
No painel da hospedagem, confirme que a VPS está com **Ubuntu 24.04** (ou 22.04).
Se ela veio com CloudPanel, tudo bem — o instalador detecta e se adapta.

## Passo 2 — Apontar o domínio (DNS)
No gerenciador de DNS do seu domínio, crie **dois registros do tipo A** apontando para o IP da VPS:

| Tipo | Nome | Valor |
|---|---|---|
| A | `biblioteca` | IP da VPS |
| A | `api.biblioteca` | IP da VPS |

Assim o site fica em `biblioteca.seudominio.com.br` e o banco em `api.biblioteca.seudominio.com.br`.
A propagação costuma levar de 5 minutos a 1 hora. Para conferir, no seu computador: `ping biblioteca.seudominio.com.br` deve mostrar o IP da VPS.

## Passo 3 — Criar uma chave de acesso ao repositório (GitHub)
O repositório é privado, então a VPS precisa de uma chave só de leitura:
1. GitHub → foto → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Nome: `vps-biblioteca` · Validade: 90 dias · **Repository access: Only select repositories → urbot**.
3. **Permissions → Repository permissions → Contents: Read-only**.
4. **Generate token** e copie (começa com `github_pat_`). Guarde só até terminar a instalação.

## Passo 4 — Entrar na VPS
No Windows, abra o **PowerShell** (tecla Windows → digite “PowerShell”) e rode:
```
ssh -p 22022 root@IP-DA-VPS
```
(A porta `22022` é a da sua VPS — veja “Acesso SSH” no painel da hospedagem.) Responda `yes` na primeira vez e digite a senha de root (ela não aparece enquanto você digita — é normal).

## Passo 5 — Baixar o projeto
Cole na VPS (troque `SEU_TOKEN` pelo token do passo 3):
```
apt-get update && apt-get install -y git
mkdir -p /opt/biblioteca
git clone -b claude/blissful-carson-e02j0g https://SEU_TOKEN@github.com/mauroperesdesign/urbot.git /opt/biblioteca/app
git -C /opt/biblioteca/app remote set-url origin https://github.com/mauroperesdesign/urbot.git
```
(O último comando remove o token da configuração depois de baixar.)

## Passo 6 — Rodar o instalador
Troque pelo seu domínio e pelo e-mail que será o administrador:
```
bash /opt/biblioteca/app/deploy/instalar.sh biblioteca.seudominio.com.br seu-email@exemplo.com
```
Ele faz, sozinho, nesta ordem:
1. atualiza o sistema e cria memória extra (swap);
2. instala o Docker e o Supabase (script oficial), com senhas e chaves novas e aleatórias;
3. configura domínio, limite de upload (500 MB) e fecha as portas internas;
4. cria as tabelas, regras de acesso e categorias;
5. instala o Node.js e compila o site;
6. ativa o HTTPS (certificado gratuito);
7. ativa o firewall;
8. cria o seu usuário administrador;
9. agenda o backup diário (03:30);
10. importa o acervo: 106 materiais, capas, e baixa os PDFs e áudios do Drive (~1,3 GB).

No final ele mostra **o seu login e senha de administrador** e a senha do painel do banco. Elas também ficam salvas em `/root/biblioteca-credenciais.txt`. **Anote num lugar seguro.**

> Se a VPS tiver **CloudPanel**, o instalador avisa e mostra 4 cliques que faltam no painel do CloudPanel para ligar o HTTPS (criar dois sites do tipo *Reverse Proxy*).

## Passo 7 — Testar
1. Abra `https://biblioteca.seudominio.com.br` e entre com o e-mail e a senha mostrados.
2. Vá em **Conta** e troque a senha.
3. Em **Admin → Materiais**, confira o acervo; em **Só com pendências**, veja o que precisa de revisão.
4. Peça para alguém se cadastrar e aprove em **Admin → Usuários**.

---

## Depois da instalação

**Atualizar o site** (quando houver versão nova no repositório):
```
bash /opt/biblioteca/app/deploy/atualizar.sh
```
(Ele pede o token do GitHub — o mesmo tipo do passo 3. Cole com o botão direito; não aparece na tela.)

**Reimportar o acervo** (idempotente):
```
bash /opt/biblioteca/app/deploy/importar.sh --enviar-arquivos --publicar
```

**Backup**: roda todo dia às 03:30 e guarda 14 dias em `/opt/biblioteca/backups`. Para ter também uma cópia fora da VPS (recomendado), configure o Google Drive uma vez:
```
apt-get install -y rclone
rclone config        # n → nome: gdrive → tipo: drive → siga as instruções (use "rclone authorize" no seu PC se pedir)
```
Depois disso, o backup diário envia uma cópia para a pasta `BibliotecaBackups` do seu Drive automaticamente.

**E-mails (recuperação de senha)**: sem servidor de e-mail, as contas são confirmadas automaticamente (o acesso ao acervo continua dependendo da sua aprovação), mas o “esqueci minha senha” não envia e-mail. Para ativar, crie uma conta gratuita de envio (ex.: Brevo) e preencha `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL` em `/opt/biblioteca/supabase/.env`; depois rode `cd /opt/biblioteca/supabase && docker compose up -d`.

**Ver se está tudo no ar**:
```
systemctl status biblioteca           # site
cd /opt/biblioteca/supabase && docker compose ps   # banco e serviços
journalctl -u biblioteca -n 50         # últimos registros do site
```

## Se algo der errado
- **O instalador parou com erro**: rode o mesmo comando do passo 6 de novo — ele continua de onde dá.
- **“tempo esgotado esperando”**: a VPS pode estar lenta no primeiro download; rode de novo.
- **HTTPS não ativou**: quase sempre é o DNS ainda não propagado (passo 2). Espere e rode `systemctl reload caddy`.
- Copie a mensagem de erro e me mande aqui — sem senhas.
