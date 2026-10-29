#!/usr/bin/env bash
# Differential check: engine (TypeScript) vs independent reference (Python).
# Usage: pnpm conferir [clientes] [sementes...]
set -euo pipefail
cd "$(dirname "$0")/.."
clients="${1:-1000}"
shift || true
seeds=("${@:-1 2 3}")
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
for seed in ${seeds[@]}; do
  pnpm -s raiox seed --saida "$work/seed-$seed.xlsx" --clientes "$clients" --semente "$seed" >/dev/null
  pnpm -s raiox calcular --entrada "$work/seed-$seed.xlsx" --saida "$work/r-$seed" --sem-pdf >/dev/null
  printf "semente %s: " "$seed"
  python3 tools/conferencia/irpfm_referencia.py "$work/r-$seed"
done
