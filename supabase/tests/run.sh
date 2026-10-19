#!/usr/bin/env bash
# Sobe um PostgreSQL temporário, aplica o simulador do Supabase + migrações e roda os testes de RLS.
set -euo pipefail
cd "$(dirname "$0")/../.."
BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
DIR="$(mktemp -d)"
PORT="${PG_TEST_PORT:-54329}"
run_pg() { if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
cleanup() { run_pg "'$BIN/pg_ctl' -D '$DIR/data' stop -m immediate" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
chmod 777 "$DIR"
run_pg "'$BIN/initdb' -D '$DIR/data' -A trust -U postgres >/dev/null"
run_pg "'$BIN/pg_ctl' -D '$DIR/data' -o '-p $PORT -k $DIR' -l '$DIR/log' start -w >/dev/null"

PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "aplicando $f"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f supabase/tests/rls_tests.sql
