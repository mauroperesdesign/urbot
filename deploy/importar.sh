#!/usr/bin/env bash
# Reexecuta a importação do acervo (idempotente). Uso:
#   bash /opt/biblioteca/app/deploy/importar.sh [--enviar-arquivos] [--publicar] [--simular]
set -euo pipefail
source "$(dirname "$0")/lib.sh"
[ "$(id -u)" = 0 ] || die "rode como root"
cd "$APP"
set -a; . "$SECRETS"; set +a
sudo -E -u biblioteca node scripts/import-acervo.mjs "$@"
