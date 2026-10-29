# Score de oportunidade

O score ordena a base de clientes pela **conversa que vale ter primeiro**. É uma heurística de produto, não uma regra tributária. Código: `packages/engine/src/score.ts`; os pesos são configuráveis por escritório (`ScoreConfig`).

## Fórmula

```
score = 100 × Σ (peso_i × valor_i)        valor_i ∈ [0, 1], arredondado a 1 casa
```

| Componente | Peso padrão | Valor | Por que importa |
|---|---|---|---|
| IRPFM a pagar | 0,40 | mín(1, a pagar ÷ R$ 50.000) | Conta nova que o cliente vai ver na declaração de 2027. |
| Faixa de transição | 0,20 | 1 se a base está entre R$ 600 mil e R$ 1,2 mi; 0,5 se está a até 10% abaixo de R$ 600 mil; 0 fora disso | Alíquota marginal de até 30% sobre o bruto: é onde alocação e calendário mais mudam o resultado. |
| Retenção a restituir | 0,15 | mín(1, a restituir ÷ R$ 20.000) | Dinheiro parado até a restituição: conversa sobre o calendário de dividendos. |
| Retenção mensal | 0,15 | mín(1, IRRF do ano ÷ R$ 30.000) | Impacto de caixa ao longo de 2026. |
| Dado faltando | 0,10 | 1 se há IRPFM bruto e falta o IRPF do ajuste ou a alíquota efetiva de alguma PJ | O número pode mudar com um dado que o contador tem. |

Desempate: maior IRPFM a pagar e, depois, código do cliente (ordem alfabética), para o ranking ser sempre o mesmo para a mesma entrada.

## Ajuste

Os valores de referência (R$ 50 mil, R$ 20 mil, R$ 30 mil) são os pontos em que cada componente satura. Um escritório com clientes de patrimônio maior pode subir as referências; um que quer priorizar caixa pode subir o peso da retenção. Os pesos devem somar 1 (há teste).
