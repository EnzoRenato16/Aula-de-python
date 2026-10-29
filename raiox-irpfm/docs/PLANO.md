# Plano de fases

Estimativas em dias de trabalho focado. Cada fase só termina com a CI verde e com a sua conferência.

| Fase | Escopo | Status | Estimativa |
|---|---|---|---|
| 0. Fundação | monorepo pnpm, TypeScript strict, Biome, Vitest, CI, Docker Compose, CLAUDE.md | **feita** | — |
| 1. Motor + CLI | REGRAS.md, motor com golden e property tests, trilha, alertas, marginal, cenários, score, CLI `calcular`, ranking CSV, PDF por cliente, seed de 200 clientes | **feita; aguarda a sua conferência de 5 clientes** (`docs/CONFERENCIA.md`) | — |
| 2. Importação | template XLSX com dicionário, leitura XLSX/CSV, validação por linha, relatório de erros, guarda LGPD | **feita** (CLI e tela de upload com prévia) | — |
| 3. App web | Better Auth + organizações e papéis; Drizzle + migrations; upload com pré-visualização e confirmação; cadastro manual; painel ranqueado com filtros e CSV; ficha com cascata, trilha, marginal e simulador; telas Premissas, Equipe, Auditoria e Escritório (nome e cor do PDF); testes de isolamento entre escritórios e assessores | **feita** (RLS foi para a fase 5, ver D-023) | — |
| 4. Marca, IA e lote | logo do escritório no PDF (a cor já está na fase 3); mensagem sugerida com IA (verificação de números e texto de reserva); geração em lote com pg-boss e ZIP | a fazer | 3 a 4 dias |
| 5. Endurecimento | Row-Level Security no Postgres (D-023), envio de e-mail dos convites, rate limit, limites de upload, CSP e HSTS, revisão OWASP, LGPD (exclusão do escritório, retenção, política), logs sem dados pessoais, e2e Playwright na CI, DEPLOY.md e deploy em São Paulo | a fazer | 4 a 5 dias |

## Riscos acompanhados

| Risco | Mitigação |
|---|---|
| Regulamento do redutor (art. 16-B §4º) ainda não publicado | estratégia plugável e PENDENTE; o modo conservador usa o menor redutor |
| Referendo da liminar do STF sobre o prazo da transição | o motor não codifica a data: a planilha marca a linha |
| Interpretações da Receita mudarem (ex.: Simples, ganho isento em ações) | cada ponto é uma opção configurável e versionada |
| Novas versões do "Perguntas e Respostas" | conferir a cada nova versão e registrar em `docs/fontes/` |
