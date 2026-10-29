# Raio-X IRPFM

Simulação, cliente a cliente, do impacto da **Lei 15.270/2025** para escritórios de assessoria de investimentos: retenção de 10% sobre dividendos (art. 6º-A), tributação mínima anual, o IRPFM (art. 16-A), e redutor (art. 16-B), no ano-calendário 2026, declaração 2027.

> Ferramenta de simulação para profissionais. Não é recomendação de investimento nem consultoria tributária: valide com o contador.

## Começo rápido

```bash
cd raiox-irpfm
pnpm install
pnpm raiox seed --saida ./demo/clientes-sinteticos.xlsx
pnpm raiox calcular --entrada ./demo/clientes-sinteticos.xlsx --saida ./demo/resultado
```

Requisitos: Node 22 e pnpm 12 (`npm i -g pnpm@12.16.1`). Python 3 só para a conferência independente.

## App web

```bash
cd raiox-irpfm
docker compose up -d                      # Postgres 18 com os bancos raiox e raiox_test
cp .env.example apps/web/.env.local       # preencha BETTER_AUTH_SECRET (openssl rand -base64 32)
DATABASE_URL=postgres://raiox:raiox_dev_only@localhost:5432/raiox pnpm --filter @raiox/web db:migrate
pnpm --filter @raiox/web dev              # http://localhost:3000
```

Crie a conta em `/criar-conta` (ela cria o escritório), importe uma base sintética gerada com `pnpm raiox seed` e explore o painel, as fichas e os cenários. Os testes do app (`pnpm test`) precisam do banco `raiox_test`, criado pelo `docker compose` na primeira subida do volume.

## Documentos

| Documento | Para quê |
|---|---|
| [docs/REGRAS.md](docs/REGRAS.md) | cada regra do motor, com artigo e status (CONFIRMADA/PENDENTE) |
| [docs/CONFERENCIA.md](docs/CONFERENCIA.md) | roteiro para conferir 5 clientes à mão |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | arquitetura e modelo de dados |
| [docs/PLANO.md](docs/PLANO.md) | fases, status e estimativas |
| [docs/DECISOES.md](docs/DECISOES.md) | decisões de produto e engenharia |
| [docs/SCORE.md](docs/SCORE.md) | fórmula do score de oportunidade |
| [docs/fontes/](docs/fontes/) | textos oficiais (lei, IN, Perguntas e Respostas) |
| [apps/cli/README.md](apps/cli/README.md) | uso da CLI |
| [CLAUDE.md](CLAUDE.md) | convenções e comandos |

## Qualidade

`pnpm verify` roda o mesmo que a CI: lint, guarda contra float no motor, guarda contra caracteres invisíveis, typecheck, testes (golden, property-based, ponta a ponta) e build. A CI também roda `pnpm audit` e compara o motor com uma implementação independente em Python em 3.000 clientes sintéticos.
