# Roteiro de conferência manual (critério de pronto da Fase 1)

O critério de pronto da Fase 1 é **rodar o motor no seed e o fundador conferir 5 clientes à mão**. Este roteiro escolhe 5 clientes do seed (semente 42, 200 clientes) que cobrem situações diferentes:

| Cliente | Por que foi escolhido |
|---|---|
| CLI-0130 | Rendimentos acima de R$ 600 mil, mas **base abaixo** (CRA fica fora): alíquota zero; retenção de um mês com mais de R$ 50 mil, **100% restituída**; empresa do Simples |
| CLI-0108 | Rentista (aluguéis) na faixa de transição com **IRPF do ajuste estimado** (desconto simplificado): o IRPF já devido cobre o IRPFM |
| CLI-0003 | Sócio que distribui **até R$ 50 mil por mês** por empresa: sem retenção no ano, **IRPFM a pagar** na declaração |
| CLI-0087 | Faixa de transição, retenção em parte dos meses, **saldo a pagar** |
| CLI-0194 | Alíquota cheia (10%), **redutor do art. 16-B**, **lucros da regra de transição** fora da base, **restituição** |

## Como conferir

1. Gere a mesma base e os PDFs:
   ```bash
   cd raiox-irpfm
   pnpm raiox seed --saida ./demo/clientes-sinteticos.xlsx
   pnpm raiox calcular --entrada ./demo/clientes-sinteticos.xlsx --saida ./demo/resultado
   ```
2. Para cada cliente abaixo, refaça as contas da coluna "Conta" numa planilha ou calculadora, usando só as entradas da tabela e as regras de `docs/REGRAS.md`. O PDF `./demo/resultado/pdf/<cliente>.pdf` traz a mesma trilha.
3. Pontos que mais pegam na conferência manual:
   - **Faixa de transição:** o IRPFM bruto é `base² ÷ 6.000.000 − 10% × base`, que é o mesmo que `alíquota × base` com a alíquota **sem arredondar**. Se você arredondar a alíquota (ex.: 1,6667%), a conta pode errar centavos.
   - **Retenção:** é 10% sobre o **total do mês daquela empresa**, só quando o total passa de R$ 50.000,00; lucros da transição não contam.
   - **Ordem:** as deduções I a V param no zero (§4º); a retenção é abatida **depois** (§5º) e só ela gera restituição.
4. Conferência automática adicional: `pnpm conferir` recalcula 3.000 clientes com uma implementação independente em Python (`tools/conferencia/irpfm_referencia.py`) e compara ao centavo.

> Valores gerados com o motor de regras `2026.1.0`. Se o gerador do seed mudar, rode de novo o script de geração deste roteiro (os PDFs sempre trazem a trilha atualizada).

## Clientes

### CLI-0130 (perfil sintético: medicoSimples)

**Entradas**

| Tipo | Mês | Empresa | Transição | Valor | IR informado |
|---|---|---|---|---:|---:|
| SALARIO | — | — | — | R$ 56.000,00 | — |
| DIVIDENDOS | jan | EMP-0154 | N | R$ 48.060,00 | — |
| DIVIDENDOS | fev | EMP-0154 | N | R$ 41.830,00 | — |
| DIVIDENDOS | mar | EMP-0154 | N | R$ 44.055,00 | — |
| DIVIDENDOS | abr | EMP-0154 | N | R$ 52.510,00 | — |
| DIVIDENDOS | mai | EMP-0154 | N | R$ 40.495,00 | — |
| DIVIDENDOS | jun | EMP-0154 | N | R$ 37.380,00 | — |
| DIVIDENDOS | jul | EMP-0154 | N | R$ 36.045,00 | — |
| DIVIDENDOS | ago | EMP-0154 | N | R$ 47.615,00 | — |
| DIVIDENDOS | set | EMP-0154 | N | R$ 49.840,00 | — |
| DIVIDENDOS | out | EMP-0154 | N | R$ 43.165,00 | — |
| DIVIDENDOS | nov | EMP-0154 | N | R$ 44.500,00 | — |
| DIVIDENDOS | dez | EMP-0154 | N | R$ 41.830,00 | — |
| RENDA_FIXA | — | — | — | R$ 13.200,00 | — |
| CRA | — | — | — | R$ 29.100,00 | — |

Empresas: EMP-0154: alíquota efetiva não informada, limite GERAL, Simples.

IRPF devido no ajuste: R$ 0,00 (informado).

**Trilha esperada**

| Passo | Conta |
|---|---|
| Rendimentos recebidos no ano | Soma de 15 linha(s) de rendimento recebidas no ano-calendário (regime de caixa) |
| Exclusões da base (lista taxativa) | CRA R$ 29.100,00 |
| · CRA | R$ 29.100,00 fora da base |
| Base de cálculo do IRPFM | R$ 625.625,00 − R$ 29.100,00 = R$ 596.525,00 |
| Sujeito à tributação mínima? | R$ 625.625,00 > R$ 600.000,00 → sim |
| Alíquota da tributação mínima | Base R$ 596.525,00 ≤ R$ 600.000,00 → 0% |
| IRPFM bruto | 0,0000% × R$ 596.525,00 = R$ 0,00 |
| (−) I. IRPF devido no ajuste anual | R$ 0,00 (informado pelo contador) |
| (−) II. IR retido exclusivamente na fonte (rendimentos da base) | R$ 1.980,00 |
| · Renda fixa tributada | R$ 1.980,00 (dos quais R$ 1.980,00 ESTIMADOS) |
| (−) III. IR da Lei 14.754/2023 (exterior) | R$ 0,00 |
| (−) IV. IR pago definitivamente (rendimentos da base) | R$ 0,00 |
| (−) V. Redutor (art. 16-B) | Alíquota efetiva do IRPFM = acréscimo do IRPFM devido (já com deduções I a IV) pela inclusão dos dividendos |
| · Empresa EMP-0154 (limite 34%) | IRPFM bruto zero → redutor não se aplica |
| IRPFM devido | máx(0; R$ 0,00 − R$ 0,00 − R$ 1.980,00 − R$ 0,00 − R$ 0,00 − R$ 0,00) = R$ 0,00 |
| (−) IRRF antecipado sobre dividendos (art. 6º-A) | R$ 5.251,00 |
| · Empresa EMP-0154, jan | R$ 48.060,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0154, fev | R$ 41.830,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0154, mar | R$ 44.055,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0154, abr | 10% × R$ 52.510,00 = R$ 5.251,00 |
| · Empresa EMP-0154, mai | R$ 40.495,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0154, jun | R$ 37.380,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0154, jul | R$ 36.045,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0154, ago | R$ 47.615,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0154, set | R$ 49.840,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0154, out | R$ 43.165,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0154, nov | R$ 44.500,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0154, dez | R$ 41.830,00 ≤ R$ 50.000,00 → sem retenção |
| Saldo do IRPFM na declaração | R$ 0,00 − R$ 5.251,00 = R$ −5.251,00 (a restituir) |
| Carga efetiva total sobre os rendimentos | (IRPF R$ 0,00 + IR das linhas R$ 1.980,00 + IRPFM R$ 0,00) ÷ R$ 625.625,00 = 0,32% |

### CLI-0108 (perfil sintético: rentista)

**Entradas**

| Tipo | Mês | Empresa | Transição | Valor | IR informado |
|---|---|---|---|---:|---:|
| ALUGUEL | — | — | — | R$ 833.000,00 | — |
| FII_ISENTO | — | — | — | R$ 131.600,00 | — |
| LCI | — | — | — | R$ 168.100,00 | — |
| RENDA_FIXA | — | — | — | R$ 214.700,00 | R$ 41.630,33 |

IRPF devido no ajuste: não informado (o motor estima).

**Trilha esperada**

| Passo | Conta |
|---|---|
| Rendimentos recebidos no ano | Soma de 4 linha(s) de rendimento recebidas no ano-calendário (regime de caixa) |
| Exclusões da base (lista taxativa) | LCI R$ 168.100,00 + FII com rendimento isento R$ 131.600,00 |
| · LCI | R$ 168.100,00 fora da base |
| · FII com rendimento isento | R$ 131.600,00 fora da base |
| Base de cálculo do IRPFM | R$ 1.347.400,00 − R$ 299.700,00 = R$ 1.047.700,00 |
| Sujeito à tributação mínima? | R$ 1.347.400,00 > R$ 600.000,00 → sim |
| Alíquota da tributação mínima | R$ 1.047.700,00 ÷ 60.000 − 10 = 7,46166667% (sem arredondar) |
| IRPFM bruto | R$ 1.047.700,00² ÷ 6.000.000 − 10% × R$ 1.047.700,00 = R$ 78.175,88 (igual a alíquota × base, sem arredondar a alíquota) |
| (−) I. IRPF devido no ajuste anual | R$ 213.319,34 (ESTIMATIVA: tabela 2026 com desconto simplificado) |
| (−) II. IR retido exclusivamente na fonte (rendimentos da base) | R$ 41.630,33 |
| · Renda fixa tributada | R$ 41.630,33 |
| (−) III. IR da Lei 14.754/2023 (exterior) | R$ 0,00 |
| (−) IV. IR pago definitivamente (rendimentos da base) | R$ 0,00 |
| (−) V. Redutor (art. 16-B) | Sem lucros e dividendos na base |
| IRPFM devido | máx(0; R$ 78.175,88 − R$ 213.319,34 − R$ 41.630,33 − R$ 0,00 − R$ 0,00 − R$ 0,00) = R$ 0,00 |
| (−) IRRF antecipado sobre dividendos (art. 6º-A) | R$ 0,00 |
| Saldo do IRPFM na declaração | R$ 0,00 − R$ 0,00 = R$ 0,00 (sem saldo) |
| Carga efetiva total sobre os rendimentos | (IRPF R$ 213.319,34 + IR das linhas R$ 41.630,33 + IRPFM R$ 0,00) ÷ R$ 1.347.400,00 = 18,92% |

### CLI-0003 (perfil sintético: socioAbaixoDoLimite)

**Entradas**

| Tipo | Mês | Empresa | Transição | Valor | IR informado |
|---|---|---|---|---:|---:|
| SALARIO | — | — | — | R$ 230.000,00 | — |
| DIVIDENDOS | jan | EMP-0004 | N | R$ 31.000,00 | — |
| DIVIDENDOS | fev | EMP-0004 | N | R$ 31.000,00 | — |
| DIVIDENDOS | mar | EMP-0004 | N | R$ 31.000,00 | — |
| DIVIDENDOS | abr | EMP-0004 | N | R$ 31.000,00 | — |
| DIVIDENDOS | mai | EMP-0004 | N | R$ 31.000,00 | — |
| DIVIDENDOS | jun | EMP-0004 | N | R$ 31.000,00 | — |
| DIVIDENDOS | jul | EMP-0004 | N | R$ 31.000,00 | — |
| DIVIDENDOS | ago | EMP-0004 | N | R$ 31.000,00 | — |
| DIVIDENDOS | set | EMP-0004 | N | R$ 31.000,00 | — |
| DIVIDENDOS | out | EMP-0004 | N | R$ 31.000,00 | — |
| DIVIDENDOS | nov | EMP-0004 | N | R$ 31.000,00 | — |
| DIVIDENDOS | dez | EMP-0004 | N | R$ 31.000,00 | — |
| DIVIDENDOS | jan | EMP-0005 | N | R$ 47.000,00 | — |
| DIVIDENDOS | fev | EMP-0005 | N | R$ 47.000,00 | — |
| DIVIDENDOS | mar | EMP-0005 | N | R$ 47.000,00 | — |
| DIVIDENDOS | abr | EMP-0005 | N | R$ 47.000,00 | — |
| DIVIDENDOS | mai | EMP-0005 | N | R$ 47.000,00 | — |
| DIVIDENDOS | jun | EMP-0005 | N | R$ 47.000,00 | — |
| DIVIDENDOS | jul | EMP-0005 | N | R$ 47.000,00 | — |
| DIVIDENDOS | ago | EMP-0005 | N | R$ 47.000,00 | — |
| DIVIDENDOS | set | EMP-0005 | N | R$ 47.000,00 | — |
| DIVIDENDOS | out | EMP-0005 | N | R$ 47.000,00 | — |
| DIVIDENDOS | nov | EMP-0005 | N | R$ 47.000,00 | — |
| DIVIDENDOS | dez | EMP-0005 | N | R$ 47.000,00 | — |
| RENDA_FIXA | — | — | — | R$ 34.000,00 | R$ 6.691,20 |

Empresas: EMP-0004: alíquota efetiva não informada, limite GERAL, Simples; EMP-0005: alíquota efetiva não informada, limite GERAL.

IRPF devido no ajuste: R$ 47.494,34 (informado).

**Trilha esperada**

| Passo | Conta |
|---|---|
| Rendimentos recebidos no ano | Soma de 26 linha(s) de rendimento recebidas no ano-calendário (regime de caixa) |
| Exclusões da base (lista taxativa) | Nenhum rendimento excluído |
| Base de cálculo do IRPFM | R$ 1.200.000,00 − R$ 0,00 = R$ 1.200.000,00 |
| Sujeito à tributação mínima? | R$ 1.200.000,00 > R$ 600.000,00 → sim |
| Alíquota da tributação mínima | Base R$ 1.200.000,00 ≥ R$ 1.200.000,00 → 10,0000% |
| IRPFM bruto | 10,0000% × R$ 1.200.000,00 = R$ 120.000,00 |
| (−) I. IRPF devido no ajuste anual | R$ 47.494,34 (informado pelo contador) |
| (−) II. IR retido exclusivamente na fonte (rendimentos da base) | R$ 6.691,20 |
| · Renda fixa tributada | R$ 6.691,20 |
| (−) III. IR da Lei 14.754/2023 (exterior) | R$ 0,00 |
| (−) IV. IR pago definitivamente (rendimentos da base) | R$ 0,00 |
| (−) V. Redutor (art. 16-B) | Alíquota efetiva do IRPFM = acréscimo do IRPFM devido (já com deduções I a IV) pela inclusão dos dividendos |
| · Empresa EMP-0004 (limite 34%) | Alíquota efetiva da empresa não informada → redutor zero |
| · Empresa EMP-0005 (limite 34%) | Alíquota efetiva da empresa não informada → redutor zero |
| IRPFM devido | máx(0; R$ 120.000,00 − R$ 47.494,34 − R$ 6.691,20 − R$ 0,00 − R$ 0,00 − R$ 0,00) = R$ 65.814,46 |
| (−) IRRF antecipado sobre dividendos (art. 6º-A) | R$ 0,00 |
| · Empresa EMP-0004, jan | R$ 31.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0004, fev | R$ 31.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0004, mar | R$ 31.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0004, abr | R$ 31.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0004, mai | R$ 31.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0004, jun | R$ 31.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0004, jul | R$ 31.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0004, ago | R$ 31.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0004, set | R$ 31.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0004, out | R$ 31.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0004, nov | R$ 31.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0004, dez | R$ 31.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0005, jan | R$ 47.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0005, fev | R$ 47.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0005, mar | R$ 47.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0005, abr | R$ 47.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0005, mai | R$ 47.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0005, jun | R$ 47.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0005, jul | R$ 47.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0005, ago | R$ 47.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0005, set | R$ 47.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0005, out | R$ 47.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0005, nov | R$ 47.000,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0005, dez | R$ 47.000,00 ≤ R$ 50.000,00 → sem retenção |
| Saldo do IRPFM na declaração | R$ 65.814,46 − R$ 0,00 = R$ 65.814,46 (a pagar) |
| Carga efetiva total sobre os rendimentos | (IRPF R$ 47.494,34 + IR das linhas R$ 6.691,20 + IRPFM R$ 65.814,46) ÷ R$ 1.200.000,00 = 10,00% |

### CLI-0087 (perfil sintético: medicoSimples)

**Entradas**

| Tipo | Mês | Empresa | Transição | Valor | IR informado |
|---|---|---|---|---:|---:|
| SALARIO | — | — | — | R$ 67.000,00 | — |
| DIVIDENDOS | jan | EMP-0104 | N | R$ 34.760,00 | — |
| DIVIDENDOS | fev | EMP-0104 | N | R$ 31.205,00 | — |
| DIVIDENDOS | mar | EMP-0104 | N | R$ 35.155,00 | — |
| DIVIDENDOS | abr | EMP-0104 | N | R$ 48.190,00 | — |
| DIVIDENDOS | mai | EMP-0104 | N | R$ 38.315,00 | — |
| DIVIDENDOS | jun | EMP-0104 | N | R$ 45.425,00 | — |
| DIVIDENDOS | jul | EMP-0104 | N | R$ 46.215,00 | — |
| DIVIDENDOS | ago | EMP-0104 | N | R$ 48.980,00 | — |
| DIVIDENDOS | set | EMP-0104 | N | R$ 38.710,00 | — |
| DIVIDENDOS | out | EMP-0104 | N | R$ 42.660,00 | — |
| DIVIDENDOS | nov | EMP-0104 | N | R$ 32.390,00 | — |
| DIVIDENDOS | dez | EMP-0104 | N | R$ 41.475,00 | — |
| DIVIDENDOS | mar | EMP-0105 | N | R$ 85.250,00 | — |
| DIVIDENDOS | jun | EMP-0105 | N | R$ 85.250,00 | — |
| DIVIDENDOS | set | EMP-0105 | N | R$ 85.250,00 | — |
| DIVIDENDOS | dez | EMP-0105 | N | R$ 85.250,00 | — |
| RENDA_FIXA | — | — | — | R$ 95.600,00 | R$ 18.967,04 |
| CRA | — | — | — | R$ 65.800,00 | — |

Empresas: EMP-0104: alíquota efetiva não informada, limite GERAL, Simples; EMP-0105: alíquota efetiva 9,51%, limite GERAL.

IRPF devido no ajuste: R$ 1.850,83 (informado).

**Trilha esperada**

| Passo | Conta |
|---|---|
| Rendimentos recebidos no ano | Soma de 19 linha(s) de rendimento recebidas no ano-calendário (regime de caixa) |
| Exclusões da base (lista taxativa) | CRA R$ 65.800,00 |
| · CRA | R$ 65.800,00 fora da base |
| Base de cálculo do IRPFM | R$ 1.052.880,00 − R$ 65.800,00 = R$ 987.080,00 |
| Sujeito à tributação mínima? | R$ 1.052.880,00 > R$ 600.000,00 → sim |
| Alíquota da tributação mínima | R$ 987.080,00 ÷ 60.000 − 10 = 6,45133333% (sem arredondar) |
| IRPFM bruto | R$ 987.080,00² ÷ 6.000.000 − 10% × R$ 987.080,00 = R$ 63.679,82 (igual a alíquota × base, sem arredondar a alíquota) |
| (−) I. IRPF devido no ajuste anual | R$ 1.850,83 (informado pelo contador) |
| (−) II. IR retido exclusivamente na fonte (rendimentos da base) | R$ 18.967,04 |
| · Renda fixa tributada | R$ 18.967,04 |
| (−) III. IR da Lei 14.754/2023 (exterior) | R$ 0,00 |
| (−) IV. IR pago definitivamente (rendimentos da base) | R$ 0,00 |
| (−) V. Redutor (art. 16-B) | Alíquota efetiva do IRPFM = acréscimo do IRPFM devido (já com deduções I a IV) pela inclusão dos dividendos |
| · Empresa EMP-0104 (limite 34%) | Alíquota efetiva da empresa não informada → redutor zero |
| · Empresa EMP-0105 (limite 34%) | R$ 341.000,00 × máx(0; 9,5100% + 5,1987% − 34,0000%) = R$ 0,00 |
| IRPFM devido | máx(0; R$ 63.679,82 − R$ 1.850,83 − R$ 18.967,04 − R$ 0,00 − R$ 0,00 − R$ 0,00) = R$ 42.861,95 |
| (−) IRRF antecipado sobre dividendos (art. 6º-A) | R$ 34.100,00 |
| · Empresa EMP-0104, jan | R$ 34.760,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0104, fev | R$ 31.205,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0104, mar | R$ 35.155,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0104, abr | R$ 48.190,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0104, mai | R$ 38.315,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0104, jun | R$ 45.425,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0104, jul | R$ 46.215,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0104, ago | R$ 48.980,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0104, set | R$ 38.710,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0104, out | R$ 42.660,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0104, nov | R$ 32.390,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0104, dez | R$ 41.475,00 ≤ R$ 50.000,00 → sem retenção |
| · Empresa EMP-0105, mar | 10% × R$ 85.250,00 = R$ 8.525,00 |
| · Empresa EMP-0105, jun | 10% × R$ 85.250,00 = R$ 8.525,00 |
| · Empresa EMP-0105, set | 10% × R$ 85.250,00 = R$ 8.525,00 |
| · Empresa EMP-0105, dez | 10% × R$ 85.250,00 = R$ 8.525,00 |
| Saldo do IRPFM na declaração | R$ 42.861,95 − R$ 34.100,00 = R$ 8.761,95 (a pagar) |
| Carga efetiva total sobre os rendimentos | (IRPF R$ 1.850,83 + IR das linhas R$ 18.967,04 + IRPFM R$ 42.861,95) ÷ R$ 1.052.880,00 = 6,05% |

### CLI-0194 (perfil sintético: empresario)

**Entradas**

| Tipo | Mês | Empresa | Transição | Valor | IR informado |
|---|---|---|---|---:|---:|
| SALARIO | — | — | — | R$ 205.000,00 | — |
| DIVIDENDOS | abr | EMP-0211 | N | R$ 569.000,00 | — |
| DIVIDENDOS | mar | EMP-0212 | N | R$ 1.597.000,00 | — |
| DIVIDENDOS | mai | EMP-0212 | S | R$ 222.000,00 | — |
| RENDA_FIXA | — | — | — | R$ 237.800,00 | — |

Empresas: EMP-0211: alíquota efetiva 26,28%, limite GERAL; EMP-0212: alíquota efetiva não informada, limite GERAL.

IRPF devido no ajuste: não informado (o motor estima).

**Trilha esperada**

| Passo | Conta |
|---|---|
| Rendimentos recebidos no ano | Soma de 5 linha(s) de rendimento recebidas no ano-calendário (regime de caixa) |
| Exclusões da base (lista taxativa) | Lucros e dividendos da regra de transição R$ 222.000,00 |
| · Lucros e dividendos da regra de transição | R$ 222.000,00 fora da base |
| Base de cálculo do IRPFM | R$ 2.830.800,00 − R$ 222.000,00 = R$ 2.608.800,00 |
| Sujeito à tributação mínima? | R$ 2.830.800,00 > R$ 600.000,00 → sim |
| Alíquota da tributação mínima | Base R$ 2.608.800,00 ≥ R$ 1.200.000,00 → 10,0000% |
| IRPFM bruto | 10,0000% × R$ 2.608.800,00 = R$ 260.880,00 |
| (−) I. IRPF devido no ajuste anual | R$ 40.619,34 (ESTIMATIVA: tabela 2026 com desconto simplificado) |
| (−) II. IR retido exclusivamente na fonte (rendimentos da base) | R$ 35.670,00 |
| · Renda fixa tributada | R$ 35.670,00 (dos quais R$ 35.670,00 ESTIMADOS) |
| (−) III. IR da Lei 14.754/2023 (exterior) | R$ 0,00 |
| (−) IV. IR pago definitivamente (rendimentos da base) | R$ 0,00 |
| (−) V. Redutor (art. 16-B) | Alíquota efetiva do IRPFM = acréscimo do IRPFM devido (já com deduções I a IV) pela inclusão dos dividendos |
| · Empresa EMP-0211 (limite 34%) | R$ 569.000,00 × máx(0; 26,2800% + 8,5222% − 34,0000%) = R$ 4.564,47 |
| · Empresa EMP-0212 (limite 34%) | Alíquota efetiva da empresa não informada → redutor zero |
| IRPFM devido | máx(0; R$ 260.880,00 − R$ 40.619,34 − R$ 35.670,00 − R$ 0,00 − R$ 0,00 − R$ 4.564,47) = R$ 180.026,19 |
| (−) IRRF antecipado sobre dividendos (art. 6º-A) | R$ 216.600,00 |
| · Empresa EMP-0211, abr | 10% × R$ 569.000,00 = R$ 56.900,00 |
| · Empresa EMP-0212, mar | 10% × R$ 1.597.000,00 = R$ 159.700,00 |
| · Empresa EMP-0212, mai | R$ 222.000,00 da transição, fora do cálculo |
| Saldo do IRPFM na declaração | R$ 180.026,19 − R$ 216.600,00 = R$ −36.573,81 (a restituir) |
| Carga efetiva total sobre os rendimentos | (IRPF R$ 40.619,34 + IR das linhas R$ 35.670,00 + IRPFM R$ 180.026,19) ÷ R$ 2.830.800,00 = 9,05% |

