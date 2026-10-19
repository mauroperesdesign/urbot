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
