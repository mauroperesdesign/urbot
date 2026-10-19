#!/usr/bin/env bash
# Atualiza o site para a versão mais recente do repositório.
# Uso: bash /opt/biblioteca/app/deploy/atualizar.sh
set -euo pipefail
source "$(dirname "$0")/lib.sh"
[ "$(id -u)" = 0 ] || die "rode como root"

say "Baixando a versão nova"
sudo -u biblioteca git -C "$APP" pull --ff-only

say "Aplicando migrações novas do banco"
apply_migrations

say "Compilando"
sudo -u biblioteca -H bash -c "cd '$APP' && npm ci --no-audit --no-fund --loglevel=error && NEXT_TELEMETRY_DISABLED=1 npm run build"
systemctl restart biblioteca
wait_for "site" 60 curl -fs http://127.0.0.1:3000/robots.txt
say "Atualizado."
