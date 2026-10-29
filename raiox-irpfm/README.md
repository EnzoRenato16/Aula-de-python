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
