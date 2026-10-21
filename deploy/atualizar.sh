#!/usr/bin/env bash
# Atualiza o site para a versão mais recente do repositório.
# Uso: bash /opt/biblioteca/app/deploy/atualizar.sh [--sem-baixar]
#   Pede o token do GitHub (repositório privado) e baixa a versão nova do mesmo ramo.
#   --sem-baixar: só recompila e reinicia (quando o código já foi baixado).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
[ "$(id -u)" = 0 ] || die "rode como root"

if [ "${1:-}" != "--sem-baixar" ]; then
  say "Baixando a versão nova"
  BRANCH="$(sudo -u biblioteca git -C "$APP" rev-parse --abbrev-ref HEAD)"
  REMOTE="$(sudo -u biblioteca git -C "$APP" remote get-url origin)"
  read -r -s -p "Cole o token do GitHub e aperte Enter (não aparece na tela): " TOKEN; echo
  if [ -n "$TOKEN" ]; then
    sudo -u biblioteca git -C "$APP" pull --ff-only "${REMOTE/https:\/\//https://x-access-token:$TOKEN@}" "$BRANCH"
  else
    sudo -u biblioteca git -C "$APP" pull --ff-only origin "$BRANCH"
  fi
  unset TOKEN
fi

say "Aplicando migrações novas do banco"
apply_migrations

say "Compilando"
sudo -u biblioteca -H bash -c "cd '$APP' && npm ci --no-audit --no-fund --loglevel=error && NEXT_TELEMETRY_DISABLED=1 npm run build"
systemctl restart biblioteca
wait_for "site" 60 curl -fs http://127.0.0.1:3000/robots.txt
say "Atualizado."
