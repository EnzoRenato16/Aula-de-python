# CLAUDE.md: Raio-X IRPFM

Guia para quem (humano ou IA) trabalha neste repositório. Manter atualizado a cada fase.

## O que é
SaaS B2B para escritórios de assessoria de investimentos: simula o impacto da Lei 15.270/2025 (IRRF de 10% sobre dividendos e tributação mínima anual, IRPFM, do ano-calendário 2026) cliente a cliente, ranqueia a base e gera cenários e PDFs. Briefing completo: `docs/BRIEFING.md`.

## Regras inegociáveis (resumo)
1. **Correção tributária acima de tudo.** Toda regra do motor está em `docs/REGRAS.md`, com artigo de origem e status CONFIRMADA/PENDENTE. Nunca adicione regra sem fonte. Fontes oficiais copiadas em `docs/fontes/`.
2. **Regras são dados versionados por ano-calendário** (`packages/engine/src/rules/<ano>.ts`). Nada de números mágicos no código.
3. **Dinheiro nunca em float.** Use `D`/`money()` de `packages/engine/src/money.ts`. O arredondamento (R-ARR-01) fica só em `roundMoney()`. O script `scripts/check-no-float.mjs` barra float no motor, e a CI roda esse script.
4. **A IA nunca faz conta.** O LLM só redige texto a partir do JSON do motor; todo número do texto é conferido contra o resultado.
5. **LGPD:** sem CPF e sem nome completo. Cliente = código pseudônimo + apelido opcional. Empresa pagadora = código pseudônimo (sem CNPJ). Nenhum dado pessoal em logs ou na API de IA.
6. Vocabulário: "simulação" e "cenário", nunca "recomendação". Todo PDF traz o aviso legal.
7. Versões: confirmar com `npm view <pkg> version` antes de instalar; versões exatas no package.json. O pnpm está configurado com `minimumReleaseAge` (3 dias) como proteção de cadeia de suprimentos.
8. TypeScript strict, testes do motor antes do código, CI verde antes de avançar de fase, commits pequenos.

## Estrutura
```
raiox-irpfm/
  packages/engine   motor puro (só decimal.js): regras, cálculo, trilha, alertas, cenários, score
  packages/io       template XLSX, leitura CSV/XLSX, validação Zod, erros por linha
  packages/report   PDF por cliente (@react-pdf/renderer)
  apps/cli          `pnpm raiox ...` (pilotos antes do app web)
  apps/web          Next.js (fase 3)
  docs/             BRIEFING, REGRAS, ARQUITETURA, DECISOES, SCORE, fontes/
  scripts/          utilidades de CI
```
O projeto mora na subpasta `raiox-irpfm/` do repositório `Aula-de-python` (a integração do GitHub não tem permissão para criar repositórios). Para extrair com histórico: `git subtree split --prefix raiox-irpfm -b raiox-only` e dar push num repositório novo.

## Comandos
| Comando | O que faz |
|---|---|
| `pnpm install` | instala dependências (pnpm 12, Node 22) |
| `pnpm verify` | tudo o que a CI roda: lint, guarda de float, typecheck, testes, build |
| `pnpm test` | Vitest em todos os pacotes |
| `pnpm lint` / `pnpm format` | Biome (verificar / corrigir) |
| `pnpm typecheck` | `tsc --noEmit` em cada pacote (TypeScript 7) |
| `pnpm raiox <comando>` | CLI (ver `apps/cli/README.md`) |
| `docker compose up -d` | Postgres 18 local (fase 3) |

## Convenções
- Código, identificadores e commits em **inglês**; interface, mensagens, docs de produto e PDFs em **pt-BR**.
- Códigos de domínio que o usuário vê (tipos de rendimento, colunas do template) ficam em pt-BR (`DIVIDENDOS`, `codigo_cliente`).
- Imports relativos com extensão `.ts` (`allowImportingTsExtensions` + `rewriteRelativeImportExtensions`).
- Pacotes internos exportam `src/index.ts` diretamente; `build` emite `dist/` para provar que compila.
- Valores monetários e taxas entram no motor como **string decimal canônica** (`"1234.56"`, `"0.32"`) ou `Decimal`, nunca `number`. A conversão de "1.234,56" / "32%" acontece em `packages/io`.
- Todo passo da trilha de cálculo e todo alerta cita os IDs de regra (`R-...`) de `docs/REGRAS.md`.
- Testes: `*.test.ts` ao lado do código. Golden tests em `golden.test.ts`; propriedades em `properties.test.ts`.

## Decisões
Ver `docs/DECISOES.md` (registro de decisões, com data e motivo).
