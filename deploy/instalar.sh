#!/usr/bin/env bash
# Instala a Biblioteca Umbandista numa VPS Ubuntu (22.04/24.04) limpa:
#   Supabase self-hosted (Docker) + site Next.js (systemd) + HTTPS (Caddy ou CloudPanel)
#   + firewall + backup diário + importação do acervo.
#
# Uso (como root, com o repositório já clonado em /opt/biblioteca/app):
#   bash /opt/biblioteca/app/deploy/instalar.sh biblioteca.seudominio.com.br seu-email@exemplo.com
#
# Opções: --sem-importar (não importa o acervo)  --sem-arquivos (importa só metadados e capas)
# Pode ser executado de novo com segurança: o que já existe é mantido.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

DOMAIN="${1:-}"; EMAIL="${2:-}"
IMPORT=1; FILES=1
for a in "$@"; do
  case "$a" in --sem-importar) IMPORT=0 ;; --sem-arquivos) FILES=0 ;; esac
done
[ "$(id -u)" = 0 ] || die "rode como root (sudo -i)"
[ -n "$DOMAIN" ] && [ -n "$EMAIL" ] || die "uso: instalar.sh DOMINIO EMAIL_DO_ADMIN"
[ -d "$APP/.git" ] || die "repositório não encontrado em $APP (veja o passo a passo)"
. /etc/os-release; [ "${ID:-}" = ubuntu ] || warn "testado em Ubuntu; seu sistema é ${PRETTY_NAME:-desconhecido}"
API="api.$DOMAIN"
mkdir -p "$BASE"; chmod 750 "$BASE"

# ------------------------------------------------------------------ 1. sistema
say "1/10 Atualizando o sistema e criando memória de troca (swap)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq git curl jq openssl ufw ca-certificates gnupg cron >/dev/null
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -q vm.swappiness=10; echo 'vm.swappiness=10' > /etc/sysctl.d/99-biblioteca.conf
fi
timedatectl set-timezone America/Sao_Paulo || true

# ------------------------------------------------------------------ 2. Supabase
say "2/10 Instalando Docker e Supabase (script oficial)"
if [ ! -f "$SB/.env" ]; then
  cd "$BASE"
  curl -fsSL https://raw.githubusercontent.com/supabase/supabase/master/docker/setup.sh -o /tmp/supabase-setup.sh
  sh /tmp/supabase-setup.sh -y --project-dir supabase
fi
[ -f "$SB/.env" ] || die "a instalação do Supabase não gerou $SB/.env"

say "3/10 Configurando o Supabase para $API"
ENVF="$SB/.env"
set_env "$ENVF" SUPABASE_PUBLIC_URL "https://$API"
set_env "$ENVF" API_EXTERNAL_URL "https://$API/auth/v1"
set_env "$ENVF" SITE_URL "https://$DOMAIN"
set_env "$ENVF" ADDITIONAL_REDIRECT_URLS "https://$DOMAIN/**"
set_env "$ENVF" ENABLE_EMAIL_SIGNUP true
# Sem servidor de e-mail configurado, a conta é confirmada automaticamente;
# o acesso ao acervo continua dependendo da aprovação do admin.
[ -n "$(get_env "$ENVF" SMTP_PASS | sed 's/^your-.*//')" ] || set_env "$ENVF" ENABLE_EMAIL_AUTOCONFIRM true
set_env "$ENVF" DASHBOARD_USERNAME admin
set_env "$ENVF" STUDIO_DEFAULT_ORGANIZATION "En Tenda"
set_env "$ENVF" STUDIO_DEFAULT_PROJECT "Biblioteca Umbandista"
chmod 600 "$ENVF"
# Portas do Docker só no localhost (o Docker ignora o firewall); limite de upload de 500 MB
COMPOSE="$SB/docker-compose.yml"
sed -i -E 's#^(\s+- )"?(\$\{[A-Z_]+(:-[^}]*\}?)?\}):#\1127.0.0.1:\2:#' "$COMPOSE"
sed -i -E 's#(FILE_SIZE_LIMIT: )52428800#\1524288000#' "$COMPOSE"
grep -nE '^\s+- [0-9$"]' "$COMPOSE" | grep -v '127.0.0.1' | grep -vE ':/|\.(yml|sql|toml)' && warn "há portas publicadas fora do localhost acima"

compose pull -q || warn "não foi possível baixar todas as imagens agora; usando as que já existem"
compose up -d
ANON=$(get_env "$ENVF" ANON_KEY); SERVICE=$(get_env "$ENVF" SERVICE_ROLE_KEY)
wait_for "API do Supabase" 150 curl -fs "http://127.0.0.1:8000/auth/v1/health" -H "apikey: $ANON"
wait_for "módulo de arquivos" 150 bash -c "[ \"\$(cd $SB && docker compose exec -T db psql -U postgres -Atc \"select to_regclass('storage.buckets') is not null\")\" = t ]"

# ------------------------------------------------------------------ 3. banco
say "4/10 Criando as tabelas, regras de acesso e categorias da biblioteca"
apply_migrations

# ------------------------------------------------------------------ 4. site
say "5/10 Instalando Node.js e compilando o site"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
id biblioteca >/dev/null 2>&1 || useradd --system --home "$BASE" --shell /usr/sbin/nologin biblioteca
cat > "$APP/.env.local" <<EOF
NEXT_PUBLIC_SUPABASE_URL=https://$API
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
NEXT_PUBLIC_SITE_URL=https://$DOMAIN
NEXT_PUBLIC_CONTACT_EMAIL=$EMAIL
EOF
umask 077
cat > "$SECRETS" <<EOF
# Chave de serviço: só para scripts administrativos. Nunca coloque no navegador nem no repositório.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8000
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
EOF
umask 022
chown -R biblioteca:biblioteca "$APP"
sudo -u biblioteca -H bash -c "cd '$APP' && npm ci --no-audit --no-fund --loglevel=error && NEXT_TELEMETRY_DISABLED=1 npm run build" \
  || die "falha ao compilar o site"

cat > /etc/systemd/system/biblioteca.service <<EOF
[Unit]
Description=Biblioteca Umbandista (Next.js)
After=network-online.target docker.service
Wants=network-online.target

[Service]
User=biblioteca
WorkingDirectory=$APP
Environment=NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
ExecStart=/usr/bin/npm start -- -p 3000 -H 127.0.0.1
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now biblioteca >/dev/null
systemctl restart biblioteca
wait_for "site" 60 curl -fs http://127.0.0.1:3000/robots.txt

# ------------------------------------------------------------------ 5. HTTPS
say "6/10 Configurando HTTPS"
if command -v clpctl >/dev/null || ss -ltnp | grep -q ':80 .*nginx'; then
  PROXY=cloudpanel
  warn "CloudPanel/nginx detectado: os sites de proxy reverso serão criados no painel (veja o final)."
else
  PROXY=caddy
  if ! command -v caddy >/dev/null; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && apt-get install -y -qq caddy >/dev/null
  fi
  cat > /etc/caddy/Caddyfile <<EOF
{
	email $EMAIL
}

$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}

$API {
	request_body {
		max_size 600MB
	}
	reverse_proxy 127.0.0.1:8000
}
EOF
  systemctl reload caddy || systemctl restart caddy
fi

# ------------------------------------------------------------------ 6. firewall
say "7/10 Ativando o firewall"
PORTS="80,443"; [ "$PROXY" = cloudpanel ] && PORTS="80,443,8443"
if command -v netfilter-persistent >/dev/null && iptables -S INPUT 2>/dev/null | grep -q -- '-j REJECT'; then
  # Imagens Ubuntu da Oracle Cloud (OCI) já trazem um firewall iptables que só libera o SSH
  iptables -C INPUT -p tcp -m multiport --dports "$PORTS" -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 5 -p tcp -m state --state NEW -m multiport --dports "$PORTS" -j ACCEPT
  netfilter-persistent save >/dev/null
  warn "Oracle Cloud: liberei $PORTS no firewall da VPS. Se o site não abrir, libere também essas portas na 'Security List' do painel da hospedagem."
else
  ufw allow OpenSSH >/dev/null
  for port in ${PORTS//,/ }; do ufw allow "$port/tcp" >/dev/null; done
  ufw --force enable >/dev/null
fi

# ------------------------------------------------------------------ 7. admin
say "8/10 Criando o seu usuário administrador"
CRED=/root/biblioteca-credenciais.txt
if [ "$(db_psql -Atc "select count(*) from public.profiles where email = '$EMAIL'")" = 0 ]; then
  ADMIN_PASS=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
  curl -fs -X POST "http://127.0.0.1:8000/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg e "$EMAIL" --arg p "$ADMIN_PASS" '{email:$e,password:$p,email_confirm:true,user_metadata:{display_name:"Administração"}}')" >/dev/null \
    || die "não foi possível criar o administrador"
else
  ADMIN_PASS="(já existia — use a senha que você definiu)"
fi
db_psql -qc "update public.profiles set role = 'admin', approved = true where email = '$EMAIL';"

# ------------------------------------------------------------------ 8. backup
say "9/10 Agendando backup diário (03:30)"
install -m 750 "$APP/deploy/backup.sh" /usr/local/bin/biblioteca-backup
cat > /etc/cron.d/biblioteca-backup <<EOF
30 3 * * * root BASE=$BASE /usr/local/bin/biblioteca-backup >> /var/log/biblioteca-backup.log 2>&1
EOF

# ------------------------------------------------------------------ 9. acervo
if [ "$IMPORT" = 1 ]; then
  say "10/10 Importando o acervo (pode levar alguns minutos)"
  ARGS=(--publicar); [ "$FILES" = 1 ] && ARGS+=(--enviar-arquivos)
  (cd "$APP" && set -a && . "$SECRETS" && set +a && sudo -E -u biblioteca node scripts/import-acervo.mjs "${ARGS[@]}") \
    || warn "a importação terminou com falhas (veja acima); pode rodar de novo depois: bash $APP/deploy/importar.sh"
else
  say "10/10 Importação do acervo pulada (--sem-importar)"
fi

DASH_PASS=$(get_env "$ENVF" DASHBOARD_PASSWORD)
umask 077
cat > "$CRED" <<EOF
Biblioteca Umbandista — credenciais (guarde em local seguro e apague este arquivo depois)

Site:              https://$DOMAIN
Login do admin:    $EMAIL
Senha do admin:    $ADMIN_PASS   (troque em /conta depois de entrar)

Painel do banco (Supabase Studio): https://$API
  usuário: admin
  senha:   $DASH_PASS

Arquivos importantes:
  $SB/.env          chaves e senhas do Supabase (não compartilhe)
  $SECRETS   chave de serviço para scripts
EOF
umask 022

say "Instalação concluída!"
cat "$CRED"
if [ "$PROXY" = cloudpanel ]; then
  cat <<EOF

FALTA UM PASSO NO CLOUDPANEL (https://$(curl -fs4 ifconfig.me || echo SEU-IP):8443):
  1. Sites → Add Site → "Create a Reverse Proxy"
       Domain: $DOMAIN        Reverse Proxy Url: http://127.0.0.1:3000
  2. Sites → Add Site → "Create a Reverse Proxy"
       Domain: $API           Reverse Proxy Url: http://127.0.0.1:8000
  3. Em cada site: SSL/TLS → Actions → New Let's Encrypt Certificate
  4. No site $API: Vhost → dentro de "server {", adicione:  client_max_body_size 600m;
EOF
fi
echo
echo "As credenciais acima também foram salvas em $CRED"
