# CLI `raiox`

Roda o motor numa planilha e gera ranking, JSON e um PDF por cliente. Todos os comandos rodam a partir da pasta `raiox-irpfm/`.

```bash
pnpm install

# 1. Template de importação (com aba LEIA-ME e dicionário de dados)
pnpm raiox template --saida ./template.xlsx

# 2. (Opcional) Base sintética para testar: 200 clientes, sempre os mesmos
pnpm raiox seed --saida ./demo/clientes-sinteticos.xlsx

# 3. Calcular
pnpm raiox calcular --entrada ./demo/clientes-sinteticos.xlsx --saida ./demo/resultado \
  --escritorio "Nome do Escritório" --cor "#12343B"

# 4. Ver as regras do ano (com artigo e status)
pnpm raiox regras            # todas
pnpm raiox regras --pendentes
```

## `calcular`

| Opção | Efeito |
|---|---|
| `--entrada <arquivo>` | `.xlsx` (template), `.csv` (só rendimentos) ou uma pasta com `clientes.csv`, `empresas.csv`, `rendimentos.csv`, `posicoes.csv` |
| `--saida <pasta>` | onde gravar os resultados |
| `--conservador` | modo conservador: cada regra PENDENTE assume a opção que nunca subestima o imposto |
| `--estrategia-redutor <X>` | `INCREMENTAL_NET` (padrão), `INCREMENTAL_GROSS` ou `NOMINAL_RATE` (R-16B-04) |
| `--simples-sem-retencao` | não retém dividendos de empresas do Simples (R-6A-08) |
| `--ganho-isento-fora` | tira da base o ganho isento em ações (R-16A-06) |
| `--sem-estimativas` | não estima IRPF do ajuste nem IR de linhas sem valor informado |
| `--sem-pdf` | só ranking e JSON |
| `--ignorar-erros` | calcula as linhas válidas mesmo com erros de importação |
| `--escritorio`, `--cor`, `--logo` | marca no PDF (logo PNG/JPG) |

Saída:

| Arquivo | Conteúdo |
|---|---|
| `ranking.csv` | um cliente por linha, ordenado pelo score de oportunidade; abre direto no Excel (separador `;`, vírgula decimal) |
| `resultados.json` | resultado completo de cada cliente (trilha, alertas, marginais), valores como texto decimal |
| `entradas.json` | entradas normalizadas (usadas pela conferência independente em Python) |
| `relatorio-importacao.csv` | erros e avisos por aba, linha e coluna (só existe se houver algum) |
| `pdf/<cliente>.pdf` | uma página por cliente |

Códigos de saída: `0` ok; `1` erro de importação ou de uso.

## Conferência independente

```bash
pnpm conferir              # 3 sementes × 1.000 clientes
pnpm conferir 300 7 8      # 300 clientes, sementes 7 e 8
```

O script compara o motor TypeScript com `tools/conferencia/irpfm_referencia.py` (Python, só biblioteca padrão) em base, IRPFM bruto, redutor, IRPFM devido, retenção e saldo, ao centavo.
