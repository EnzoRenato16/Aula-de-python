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
  packages/report   PDF por cliente (@react-pdf/renderer) e resumo determinístico
  packages/seed     clientes sintéticos determinísticos (8 perfis)
  apps/cli          `pnpm raiox ...` (pilotos antes do app web)
  tools/conferencia implementação de referência em Python (dupla implementação)
  apps/web          Next.js: telas, server actions e camada de serviço (src/server/services)
  docs/             BRIEFING, REGRAS, ARQUITETURA, PLANO, CONFERENCIA, DECISOES, SCORE, fontes/
  scripts/          utilidades de CI
```
O projeto mora na subpasta `raiox-irpfm/` do repositório `Aula-de-python` (a integração do GitHub não tem permissão para criar repositórios). Para extrair com histórico: `git subtree split --prefix raiox-irpfm -b raiox-only` e dar push num repositório novo.

## Comandos
| Comando | O que faz |
|---|---|
| `pnpm install` | instala dependências (pnpm 12, Node 22) |
| `pnpm verify` | lint, guarda de float, guarda de caracteres invisíveis, typecheck, testes, build (a CI roda isso mais `pnpm audit` e a conferência em Python) |
| `pnpm test` | Vitest em todos os pacotes |
| `pnpm lint` / `pnpm format` | Biome (verificar / corrigir) |
| `pnpm typecheck` | `tsc --noEmit` em cada pacote (TypeScript 7) |
| `pnpm raiox <comando>` | CLI: `calcular`, `template`, `seed`, `regras` (ver `apps/cli/README.md`) |
| `pnpm conferir` | compara o motor com a implementação de referência em Python (3 × 1.000 clientes) |
| `docker compose up -d` | Postgres 18 local (bancos `raiox` e `raiox_test`) |
| `pnpm --filter @raiox/web dev` | app web em http://localhost:3000 (precisa de `apps/web/.env.local`, ver `.env.example`) |
| `pnpm --filter @raiox/web db:generate` | gera migration a partir de `src/server/db/schema.ts` (nunca editar SQL gerado à mão) |
| `DATABASE_URL=... pnpm --filter @raiox/web db:migrate` | aplica as migrations |

## Convenções
- Código, identificadores e commits em **inglês**; interface, mensagens, docs de produto e PDFs em **pt-BR**.
- Códigos de domínio que o usuário vê (tipos de rendimento, colunas do template) ficam em pt-BR (`DIVIDENDOS`, `codigo_cliente`).
- Imports relativos com extensão `.ts` (`allowImportingTsExtensions` + `rewriteRelativeImportExtensions`).
- Pacotes internos exportam `src/index.ts` diretamente; `build` emite `dist/` para provar que compila.
- Valores monetários e taxas entram no motor como **string decimal canônica** (`"1234.56"`, `"0.32"`) ou `Decimal`, nunca `number`. A conversão de "1.234,56" / "32%" acontece em `packages/io`.
- Todo passo da trilha de cálculo e todo alerta cita os IDs de regra (`R-...`) de `docs/REGRAS.md`.
- Testes: `*.test.ts` ao lado do código. Golden tests em `golden.test.ts`; propriedades em `properties.test.ts`. `FC_RUNS=5000 pnpm test` aumenta as execuções das propriedades.
- Nunca escreva caracteres invisíveis no código (espaço não separável, marcas combinantes, BOM): use escapes `\u00a0`, `[\u0300-\u036f]`, `\uFEFF`. `scripts/check-source.mjs` barra.
- Toda mudança de regra: atualize `docs/REGRAS.md`, `rules/<ano>.ts` (suba `version`) e `tools/conferencia/irpfm_referencia.py`; os três são conferidos por testes e pela CI.
- Mensagens ao usuário não citam anos, limites ou alíquotas fixos: derive da `RuleSet`.

## App web (apps/web)
- Next.js 16 com App Router. A versão tem mudanças em relação ao que modelos e tutoriais conhecem: a documentação certa está em `apps/web/node_modules/next/dist/docs/` (ex.: `error.tsx` usa `retry()`).
- Telas leem por Server Components; mutações são Server Actions embrulhadas em `withContext` (`src/server/action.ts`). Só `src/server/services/` fala com o banco e com o motor; toda consulta filtra por `org_id` e, para o assessor, por `advisor_code` (`visibleClients`, `visibleResults`).
- Regras de papel ficam nos serviços (`assertManager`, `assertOwner`), nunca só na tela. Toda mutação grava na auditoria com códigos e contagens, nunca dados pessoais.
- Mudou cliente, importação ou premissa: recalcule o escritório (`recalculate`).
- Formulários: react-hook-form + Zod no navegador; a validação de dados de cliente é a do importador (`packages/io`). Ids de campos em listas vêm de `useId()`, não do `field.id` do useFieldArray (quebra a hidratação).
- Gráficos: números só para desenhar; valores exibidos vêm das strings decimais do motor (`brl`, `pct`). Todo gráfico tem versão em tabela.
- Testes do app rodam contra Postgres real (`raiox_test`, recriado a cada execução pelas migrations). `next build` não pode depender de segredos: leia `headers()` antes de chamar `auth()`.

## Decisões
Ver `docs/DECISOES.md` (registro de decisões, com data e motivo).

## Estado atual
- Fases 0 a 3 feitas; a fase 1 aguarda a conferência manual de 5 clientes pelo fundador (`docs/CONFERENCIA.md`).
- Row-Level Security no Postgres ficou para a fase 5 (D-023).
- Próximo: fase 4 (logo no PDF, mensagem com IA verificada, lote com pg-boss), conforme `docs/PLANO.md`.
