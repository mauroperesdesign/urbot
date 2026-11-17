#!/usr/bin/env bash
# Funções compartilhadas pelos scripts de instalação, atualização e backup.

BASE="${BASE:-/opt/biblioteca}"
APP="$BASE/app"
SB="$BASE/supabase"
SECRETS="$BASE/segredos.env"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[erro]\033[0m %s\n' "$*" >&2; exit 1; }

# set_env ARQUIVO CHAVE VALOR — troca a linha CHAVE=... ou acrescenta no fim
set_env() {
  local file="$1" key="$2" value="$3"
  touch "$file"
  if grep -qE "^${key}=" "$file"; then
    local esc
    esc=$(printf '%s' "$value" | sed -e 's/[\/&|]/\\&/g')
    sed -i -E "s|^${key}=.*|${key}=${esc}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

get_env() { grep -E "^$2=" "$1" 2>/dev/null | head -n1 | cut -d= -f2-; }

compose() { (cd "$SB" && docker compose "$@"); }

# psql dentro do container do banco
db_psql() { compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

# Aplica as migrações da biblioteca que ainda não foram aplicadas (controle em ops.migracoes,
# esquema que não é exposto pela API)
apply_migrations() {
  db_psql -qc "create schema if not exists ops; create table if not exists ops.migracoes (nome text primary key, aplicada_em timestamptz default now());" >/dev/null
  for f in "$APP"/supabase/migrations/*.sql; do
    local name
    name=$(basename "$f")
    if [ "$(db_psql -Atc "select 1 from ops.migracoes where nome = '$name'")" = "1" ]; then continue; fi
    echo "   aplicando $name"
    { echo 'begin;'; cat "$f"; echo; echo "insert into ops.migracoes (nome) values ('$name');"; echo 'commit;'; } | db_psql -q >/dev/null
  done
}

wait_for() {
  # wait_for "descrição" segundos comando...
  local what="$1" secs="$2"; shift 2
  for _ in $(seq 1 "$secs"); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  die "tempo esgotado esperando: $what"
}

# Lembrete diário da ofensiva (Web Push): cria as chaves VAPID uma vez e agenda o envio de hora em hora.
# A chave privada fica só em $SECRETS; a pública vai para o .env.local do site.
setup_push() {
  if [ -z "$(get_env "$SECRETS" VAPID_PRIVATE_KEY)" ]; then
    local keys
    keys=$(node -e '
      const { generateKeyPairSync } = require("crypto");
      const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      const j = publicKey.export({ format: "jwk" });
      const b = (s) => Buffer.from(s, "base64url");
      const pub = Buffer.concat([Buffer.from([4]), b(j.x), b(j.y)]).toString("base64url");
      console.log(pub + " " + privateKey.export({ format: "jwk" }).d);')
    umask 077
    set_env "$SECRETS" VAPID_PUBLIC_KEY "${keys%% *}"
    set_env "$SECRETS" VAPID_PRIVATE_KEY "${keys##* }"
    umask 022
  fi
  local email
  email=$(get_env "$APP/.env.local" NEXT_PUBLIC_CONTACT_EMAIL)
  set_env "$SECRETS" VAPID_SUBJECT "mailto:${email:-contato@example.com}"
  set_env "$APP/.env.local" VAPID_PUBLIC_KEY "$(get_env "$SECRETS" VAPID_PUBLIC_KEY)"
  chown biblioteca:biblioteca "$APP/.env.local"
  cat > /etc/cron.d/biblioteca-ofensiva <<CRON
# Lembrete diário da ofensiva (cada aparelho recebe no horário escolhido, 1x por dia)
1 * * * * root cd $APP && set -a && . $SECRETS && set +a && sudo -E -u biblioteca node scripts/notificar-ofensiva.mjs >> /var/log/biblioteca-ofensiva.log 2>&1
CRON
  chmod 644 /etc/cron.d/biblioteca-ofensiva
}

# Baixador de áudio do YouTube (pontos cantados): ffmpeg + yt-dlp. Atualiza o yt-dlp a cada atualização do site,
# porque o YouTube muda com frequência.
setup_audio_tools() {
  command -v ffmpeg >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null; } || warn "não foi possível instalar o ffmpeg"
  command -v python3 >/dev/null 2>&1 || apt-get install -y -qq python3 >/dev/null || true
  if [ -x /usr/local/bin/yt-dlp ]; then
    /usr/local/bin/yt-dlp -U >/dev/null 2>&1 || warn "não foi possível atualizar o yt-dlp (o atual continua funcionando)"
  else
    curl -fsSL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      && chmod 755 /usr/local/bin/yt-dlp || warn "não foi possível instalar o yt-dlp (importar do YouTube não vai funcionar)"
  fi
}
