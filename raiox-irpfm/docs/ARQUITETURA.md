# Arquitetura

## Visão geral

```
                    ┌─────────────────────────────────────────────┐
  Planilha XLSX/CSV │ packages/io     template · leitura · Zod    │
  ─────────────────▶│                 erros por linha · LGPD      │
                    └───────────────┬─────────────────────────────┘
                                    │ ClientInput (strings decimais)
                    ┌───────────────▼─────────────────────────────┐
                    │ packages/engine (puro, só decimal.js)       │
                    │  rules/2026.ts ─▶ calculate ─▶ ClientResult │
                    │  trilha · alertas · marginal · cenários     │
                    │  score de oportunidade                      │
                    └──────┬───────────────┬──────────────┬───────┘
                           │               │              │
          ┌────────────────▼──┐  ┌─────────▼────────┐  ┌──▼──────────────────────┐
          │ packages/report   │  │ apps/cli         │  │ apps/web (fase 3)        │
          │ PDF 1 página      │  │ ranking CSV/JSON │  │ Next.js · Better Auth    │
          │ (@react-pdf)      │  │ PDFs · seed      │  │ Postgres · pg-boss · IA  │
          └───────────────────┘  └──────────────────┘  └──────────────────────────┘
```

Princípios:
1. **O motor é puro.** Sem I/O, sem relógio, sem aleatoriedade: a mesma entrada dá sempre a mesma saída, byte a byte (propriedade testada). O motor roda igual na CLI, no servidor web e nos testes.
2. **Regras são dados.** `packages/engine/src/rules/<ano>.ts` contém limites, alíquotas, tabelas, o catálogo de tipos de rendimento e o registro de regras (ID, artigo, status). Mudar uma regra é mudar um dado, subir a versão e rodar os testes.
3. **Dinheiro é `Decimal`.** Strings decimais nas fronteiras, `Decimal` no motor, `NUMERIC` no banco. O único arredondamento fica em `roundMoney()`. A leitura de XLSX pega o texto bruto da célula, sem passar por `number`.
4. **Conferência dupla.** `tools/conferencia/irpfm_referencia.py` reimplementa o cálculo a partir de `docs/REGRAS.md`; a CI compara as duas implementações em 3.000 clientes sintéticos, ao centavo.

## Pacotes

| Pacote | Responsabilidade | Depende de |
|---|---|---|
| `@raiox/engine` | regras versionadas, cálculo, trilha, alertas, alíquota marginal, cenários, score, serialização | `decimal.js` |
| `@raiox/io` | esquema do template, leitura XLSX/CSV, conversão pt-BR, validação Zod, LGPD, geração do template, CSV para Excel | engine, `read-excel-file`, `write-excel-file`, `csv-parse`, `csv-stringify`, `zod` |
| `@raiox/report` | PDF de uma página por cliente, resumo determinístico (também usado como texto de reserva da IA) | engine, `@react-pdf/renderer`, `@ibm/plex-sans` |
| `@raiox/seed` | gerador determinístico de clientes sintéticos | engine |
| `@raiox/cli` | `raiox calcular | template | seed | regras` | todos |
| `apps/web` (fase 3) | produto SaaS | todos + Next.js, Drizzle, Better Auth, pg-boss, SDK da Anthropic |

## App web (fase 3): desenho

- **Next.js App Router** com Server Actions. As telas são Server Components que leem do banco; as mutações passam por uma camada de serviço (`apps/web/src/server/`), que é o único lugar que fala com o banco e com o motor.
- **Better Auth** com plugin de organizações. Papéis: `dono`, `admin`, `assessor`. O assessor é vinculado a um `codigo_assessor` e só vê os próprios clientes.
- **Isolamento entre escritórios em duas camadas:**
  1. toda consulta passa por um helper `withOrg(orgId)` que injeta o filtro;
  2. **Row-Level Security** no Postgres: cada transação faz `SET LOCAL app.org_id` e `app.member_id`, e as políticas filtram por organização (e, para o papel assessor, por assessor). Mesmo um bug na aplicação não vaza dados de outro escritório. A fase 5 traz testes automatizados que tentam ler, alterar e apagar dados de outro escritório e precisam falhar.
- **Cálculo** síncrono no servidor (medido: 200 clientes em ~0,1 s; ~0,5 s incluindo a alíquota marginal por diferença finita). Os resultados ficam gravados por "rodada de cálculo" (versão das regras + premissas), para a ficha e o ranking não mudarem quando alguém troca uma premissa sem recalcular.
- **Lote** (PDFs, ZIP, mensagens de IA) via **pg-boss** num processo worker separado (Vercel não roda processos longos): o worker fica num serviço com região em São Paulo (Railway, Fly.io ou Render). Arquivos gerados ficam em armazenamento com expiração (S3/R2), com link assinado.
- **IA (fase 4):** o modelo vem de `ANTHROPIC_MODEL`. O prompt recebe só números e códigos de alerta do resultado, **sem código de cliente, apelido ou empresa**. Depois da geração, um verificador extrai todos os números do texto (R$, %) e confere cada um contra o conjunto de valores formatados do resultado; também barra palavras proibidas ("recomendo", "garantido", promessa de rentabilidade). Se algo não bater, o texto é trocado pelo resumo determinístico (`summarySentences`) com o aviso legal.

## Modelo de dados (PostgreSQL + Drizzle)

Todas as tabelas de negócio têm `org_id` (FK) e política RLS. Valores em reais são `numeric(16,2)`; alíquotas são `numeric(12,10)`.

| Tabela | Colunas principais | Observações |
|---|---|---|
| `organization` | id, name, slug, logo_key, primary_color, created_at | do plugin de organizações do Better Auth, estendida com a marca |
| `member` | id, organization_id, user_id, role (`dono`/`admin`/`assessor`), advisor_code | o papel assessor filtra por `advisor_code` |
| `user`, `session`, `account`, `verification`, `invitation` | (Better Auth) | e-mail do usuário do escritório; nunca do cliente final |
| `org_settings` | org_id, default_choices jsonb, score_config jsonb, data_retention_days | premissas e pesos do score por escritório |
| `import_batch` | id, org_id, created_by, file_name, file_sha256, calendar_year, status (`PREVIEW`/`CONFIRMED`/`DISCARDED`), stats jsonb, created_at | o arquivo bruto não é guardado depois da confirmação |
| `import_issue` | batch_id, severity, sheet, row, column, value, message | relatório de erros por linha |
| `client` | id, org_id, code, nickname, advisor_code, calendar_year, irpf_adjustment_due, created_at, updated_at | `unique(org_id, calendar_year, code)`; **sem CPF, sem nome** |
| `company` | id, org_id, code, effective_rate, limit_category, simples_nacional | `unique(org_id, code)`; **sem CNPJ** |
| `income_line` | id, org_id, client_id, type (enum do catálogo), month, amount, tax_withheld, company_id, transition, source (`IMPORT`/`MANUAL`/futuros: `PDF_IA`, `CONTADOR`, `CORRETORA`), import_batch_id | formato longo, igual ao template |
| `position` | id, org_id, client_id, asset_class, balance, expected_annual_rate, tax_rate | usada nos cenários |
| `calculation_run` | id, org_id, calendar_year, rule_set_version, conservative, choices jsonb, created_by, created_at | uma rodada = um retrato reproduzível |
| `client_result` | run_id, org_id, client_id, base, gross_minimum_tax, minimum_tax_due, withholding, final_balance, amount_to_pay, amount_to_refund, effective_tax_rate, score, alert_codes text[], result jsonb | colunas para ordenar e filtrar o painel; `result` é o JSON serializado completo (trilha incluída) |
| `scenario` | id, org_id, client_id, name, operations jsonb, comparison jsonb, created_by, created_at | |
| `generated_file` | id, org_id, kind (`PDF`/`ZIP`/`CSV`), storage_key, expires_at, created_by | expiração automática |
| `ai_message` | id, org_id, client_id, run_id, channel, text, model, verified, fallback_used, edited_text, created_by, created_at | guarda se o texto passou na verificação de números |
| `audit_log` | id, org_id, actor_user_id, action, entity, entity_id, metadata jsonb, created_at | só inserção; **sem dados pessoais em `metadata`** |

Exclusão (LGPD): apagar um cliente remove em cascata `income_line`, `position`, `client_result`, `scenario` e `ai_message`, e grava um registro no `audit_log` só com o código. Apagar o escritório remove tudo pelo `org_id` e agenda a remoção dos arquivos.

## Preparado para depois do MVP

- **Leitura de informe/extrato em PDF por IA:** `income_line.source = 'PDF_IA'`, mais uma tela de revisão humana obrigatória antes de as linhas entrarem no cálculo (as linhas ficam em `import_batch` com status `PREVIEW`).
- **Link para o contador:** token assinado, com escopo de um cliente e de um ano e expiração, que permite preencher `irpf_adjustment_due` e o IR das linhas (`source = 'CONTADOR'`).
- **Corretoras:** importadores que produzem o mesmo `ClientInput` (o motor não muda).
- **Assinatura:** tabela `subscription` por organização; limites (clientes, PDFs/mês, mensagens de IA) checados na camada de serviço.

## Segurança (resumo; detalhado na fase 5)

Cabeçalhos (CSP, HSTS, frame-ancestors), limite de tamanho e de linhas no upload (`MAX_ROWS`), rate limit no login e na IA, logs estruturados sem dados pessoais (só IDs internos), dependências com quarentena de 3 dias e `pnpm audit` na CI, scripts de instalação negados por padrão (`allowBuilds`).
