#!/usr/bin/env bash
# Liga a inteligência da Velinha (assistente do acervo) com uma chave da API da Anthropic.
# Uso: bash /opt/biblioteca/app/deploy/assistente.sh            (pede a chave, sem mostrar na tela)
#      bash /opt/biblioteca/app/deploy/assistente.sh --desligar (volta para a busca simples)
# A chave fica só no servidor ($APP/.env.local, legível apenas pelo serviço) e nunca vai para o navegador.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
[ "$(id -u)" = 0 ] || die "rode como root"
ENVF="$APP/.env.local"

if [ "${1:-}" = "--desligar" ]; then
  sed -i '/^ANTHROPIC_API_KEY=/d' "$ENVF"
  systemctl restart biblioteca
  say "Velinha voltou para a busca simples (sem IA)."
  exit 0
fi

read -r -s -p "Cole a chave da API da Anthropic e aperte Enter (não aparece na tela): " KEY; echo
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
case "$KEY" in sk-ant-*) ;; *) die "isso não parece uma chave da Anthropic (começa com sk-ant-). Nada foi alterado." ;; esac

say "Testando a chave"
CODE=$(curl -s -o /dev/null -w '%{http_code}' https://api.anthropic.com/v1/models -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01" || true)
[ "$CODE" = 200 ] || die "a Anthropic recusou a chave (código $CODE). Confira se copiou inteira e se a conta tem créditos. Nada foi alterado."

umask 027
set_env "$ENVF" ANTHROPIC_API_KEY "$KEY"
unset KEY
chown biblioteca:biblioteca "$ENVF"
chmod 640 "$ENVF"
systemctl restart biblioteca
wait_for "site" 60 curl -fs http://127.0.0.1:3000/robots.txt
say "Pronto! A Velinha agora usa a IA para recomendar materiais."
