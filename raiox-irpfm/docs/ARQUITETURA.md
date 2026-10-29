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
          │ packages/report   │  │ apps/cli         │  │ apps/web                 │
          │ PDF 1 página      │  │ ranking CSV/JSON │  │ Next.js · Better Auth    │
          │ (@react-pdf)      │  │ PDFs · seed      │  │ Drizzle · Postgres       │
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
| `apps/web` | produto SaaS | engine, io, report, seed + Next.js, Drizzle, Better Auth, Recharts, TanStack Table |

## App web

```
apps/web/src/
  app/(auth)/        entrar, criar conta, criar escritório, aceitar convite
  app/(app)/         painel, importar, clientes, premissas, equipe, auditoria, escritório
  app/api/           Better Auth, PDF do cliente, ranking em CSV, template
  components/        UI por área (client, dashboard, import, settings, team) + shadcn/ui
  lib/               formatação, cascata, esquemas dos formulários (compartilhados com o navegador)
  server/
    context.ts       OrgContext: usuário, escritório, papel, código de assessor, ano
    session.ts       sessão da requisição; requireContext / requireManagerContext
    action.ts        withContext: roda a server action e traduz erros esperados
    services/        o único lugar que fala com o banco e com o motor
    db/              esquema Drizzle e migrations (apps/web/drizzle)
```

- **Next.js App Router** com Server Components para leitura e Server Actions para mutações. Toda action passa por `withContext`, que carrega o `OrgContext`, transforma erros esperados (permissão, não encontrado, importação, cenário, equipe, validação) em mensagens pt-BR e registra os demais só com o nome do erro e o id do escritório.
- **Camada de serviço** (`server/services`): toda consulta a tabela de negócio filtra por `org_id`; para o assessor, `visibleClients` e `visibleResults` filtram também pelo código de assessor (sem código, nenhum cliente). As regras de papel ficam nos serviços (`assertManager`, `assertOwner`), não nas telas. Testes contra um Postgres real provam o isolamento entre escritórios e entre assessores (D-019, D-023).
- **Better Auth** com e-mail e senha e o plugin de organizações. Papéis `owner`, `admin` e `member` (Dono, Admin, Assessor). `member.advisor_code` e `invitation.advisor_code` são campos adicionais; o código do convite é copiado para o membro quando o convite é aceito.
- **Cálculo síncrono e gravado por rodada.** Importar, cadastrar, editar, excluir ou mudar premissas recalcula o escritório numa transação e grava uma `calculation_run` com os resultados (as 5 últimas ficam). O painel lê a última rodada; a ficha e o PDF recalculam o cliente com as premissas atuais (D-022).
- **Formulários:** react-hook-form + Zod no navegador para campos obrigatórios; a validação de verdade é a do importador (`packages/io`), no servidor (D-021). Valores são digitados em pt-BR e convertidos pelos mesmos parsers da planilha.
- **Gráficos** (Recharts): cascata do IRPFM bruto ao saldo e alíquota marginal por classe. Os números das barras servem só para desenhar; todo valor exibido é formatado a partir das strings decimais do motor, e cada gráfico tem a versão em tabela.
- **Lote e IA (fase 4):** PDFs em lote e ZIP via pg-boss num worker separado, com arquivos em armazenamento com expiração. O modelo vem de `ANTHROPIC_MODEL`. O prompt recebe só números e códigos de alerta, **sem código de cliente, apelido ou empresa**; um verificador confere cada número do texto contra o resultado e barra palavras proibidas ("recomendo", "garantido"). Se algo não bater, entra o resumo determinístico (`summarySentences`) com o aviso legal.

## Modelo de dados (PostgreSQL + Drizzle)

Valores em reais são `numeric(16,2)`; alíquotas são `numeric(12,10)`; o Drizzle devolve os dois como string. Todas as tabelas de negócio têm `org_id` com `on delete cascade`.

| Tabela | Colunas principais | Observações |
|---|---|---|
| `user`, `session`, `account`, `verification` | (Better Auth) | e-mail de quem trabalha no escritório; nunca do cliente final |
| `organization` | id, name, slug | o escritório |
| `member` | organization_id, user_id, role (`owner`/`admin`/`member`), advisor_code | o assessor vê só os clientes com o seu `advisor_code` |
| `invitation` | organization_id, email, role, status, expires_at, advisor_code | convite por link (D-024) |
| `org_settings` | org_id, calendar_year, conservative, choices jsonb, primary_color | premissas (D-025) e cor do PDF |
| `company` | org_id, code, effective_rate, limit_category, simples_nacional | `unique(org_id, code)`; **sem CNPJ** |
| `client` | org_id, calendar_year, code, nickname, advisor_code, irpf_adjustment_due | `unique(org_id, calendar_year, code)`; **sem CPF, sem nome** |
| `income_line` | client_id, type, month, amount, tax_withheld, company_code, transition, source (`IMPORT`/`MANUAL`), import_batch_id | formato longo, igual ao template |
| `position` | client_id, asset_class, balance, expected_annual_rate, tax_rate | usada nos cenários; `unique(client_id, asset_class)` |
| `import_batch` | created_by, file_name, file_sha256, calendar_year, status (`PREVIEW`/`CONFIRMED`/`DISCARDED`), mode, stats, issues jsonb, payload jsonb | o conteúdo (`payload`) é apagado na confirmação ou no descarte |
| `calculation_run` | calendar_year, rule_set_version, conservative, choices, client_count, created_by | uma rodada = um retrato reproduzível |
| `client_result` | run_id, client_id, position, score, base, rate, minimum_tax_due, withholding, final_balance, amount_to_pay, amount_to_refund, effective_tax_rate, band, alert_codes text[], result jsonb | colunas para ordenar e filtrar o painel; `result` é o resultado serializado completo (trilha incluída) |
| `scenario` | client_id, name, operations jsonb, comparison jsonb, created_by | cenário salvo; reabrir recalcula com as premissas atuais |
| `audit_log` | actor_user_id, action, entity, entity_id, metadata jsonb | só inserção; **`metadata` guarda códigos e contagens, nunca dados pessoais** |

Exclusão (LGPD): apagar um cliente remove em cascata `income_line`, `position`, `client_result` e `scenario`, e grava na auditoria só o código. Apagar o escritório remove tudo pelo `org_id` (tela na fase 5).

Fase 4 acrescenta `generated_file` (arquivos com expiração) e `ai_message` (texto gerado, modelo, se passou na verificação de números, texto editado).

## Preparado para depois do MVP

- **Leitura de informe/extrato em PDF por IA:** `income_line.source = 'PDF_IA'`, mais uma tela de revisão humana obrigatória antes de as linhas entrarem no cálculo (as linhas ficam em `import_batch` com status `PREVIEW`).
- **Link para o contador:** token assinado, com escopo de um cliente e de um ano e expiração, que permite preencher `irpf_adjustment_due` e o IR das linhas (`source = 'CONTADOR'`).
- **Corretoras:** importadores que produzem o mesmo `ClientInput` (o motor não muda).
- **Assinatura:** tabela `subscription` por organização; limites (clientes, PDFs/mês, mensagens de IA) checados na camada de serviço.

## Segurança (resumo; detalhado na fase 5)

Já no ar: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`; upload limitado a 8 MB e `MAX_ROWS` linhas; rate limit no login (5/min) e no cadastro (3/min). Na fase 5: CSP e HSTS, Row-Level Security (D-023), rate limit na IA, logs estruturados sem dados pessoais (só IDs internos), dependências com quarentena de 3 dias e `pnpm audit` na CI, scripts de instalação negados por padrão (`allowBuilds`).
