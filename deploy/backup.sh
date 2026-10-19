#!/usr/bin/env bash
# Backup diário: banco de dados (pg_dump) + arquivos do Storage + configuração.
# Mantém 14 dias em $BASE/backups. Se o rclone tiver um remoto chamado "gdrive",
# envia também uma cópia para o Google Drive (pasta BibliotecaBackups).
set -euo pipefail
BASE="${BASE:-/opt/biblioteca}"
SB="$BASE/supabase"
DEST="$BASE/backups"
STAMP=$(date +%F-%H%M)
mkdir -p "$DEST"; chmod 700 "$DEST"

cd "$SB"
docker compose exec -T db pg_dumpall -U postgres --clean --if-exists | gzip -6 > "$DEST/banco-$STAMP.sql.gz"
tar -czf "$DEST/arquivos-$STAMP.tar.gz" -C "$SB/volumes" storage 2>/dev/null || true
tar -czf "$DEST/config-$STAMP.tar.gz" -C "$BASE" supabase/.env segredos.env app/.env.local 2>/dev/null || true

find "$DEST" -type f -mtime +14 -delete

if command -v rclone >/dev/null && rclone listremotes 2>/dev/null | grep -q '^gdrive:'; then
  rclone copy "$DEST" gdrive:BibliotecaBackups --max-age 26h --quiet
  rclone delete gdrive:BibliotecaBackups --min-age 30d --quiet || true
fi
echo "$(date '+%F %T') backup ok: $(du -sh "$DEST" | cut -f1) em $DEST"
