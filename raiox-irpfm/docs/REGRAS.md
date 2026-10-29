# Regras do motor: ano-calendário 2026 (exercício 2027)

Este documento é a especificação jurídica do motor. Cada regra tem um identificador (`R-...`) usado no código (`packages/engine/src/rules/2026.ts`), na trilha de cálculo, na tela Premissas e no PDF. Um teste automatizado (`rules-doc.test.ts`) garante que todo ID do código existe aqui e vice-versa.

**Status**
- **CONFIRMADA**: está no texto literal da lei/IN, ou na resposta oficial da Receita, sem margem razoável de dúvida.
- **PENDENTE**: interpretação incerta, controvérsia pública ou dependência de regulamentação. Toda regra PENDENTE tem uma opção configurável, uma escolha padrão e uma escolha do **modo conservador** (a que nunca subestima o imposto).

**Fontes** (cópias em `docs/fontes/`)
- [L] Lei 15.270, de 26/11/2025 (DOU 27/11/2025), que inseriu os arts. 6º-A, 16-A e 16-B na Lei 9.250/1995 e alterou a Lei 9.249/1995.
- [IN] IN RFB 2.299, de 17/12/2025 (DOU 18/12/2025), que inseriu o art. 23-A na IN RFB 1.500/2014 e trouxe as tabelas de 2026. **Ela regulamenta só a retenção; não regulamenta o IRPFM nem o redutor.**
- [PR] Receita Federal, "Perguntas e Respostas: Tributação de Altas Rendas, considerações sobre lucros e dividendos", v2 (dez/2025).
- [STF] ADIs 7.912 e 7.914: liminar do min. Nunes Marques (26/12/2025) que prorrogou para 31/01/2026 o prazo de aprovação da distribuição dos lucros de 2025. O referendo foi destacado para o plenário presencial e, até a data deste documento, não encontrei o resultado final.

Leitura em 29/10/2026. O portal planalto.gov.br bloqueia acesso automatizado; o texto foi obtido da Câmara dos Deputados (publicação original) e os trechos críticos foram conferidos frase a frase com uma impressão do Planalto.

---

## 1. Retenção mensal sobre lucros e dividendos (art. 6º-A da Lei 9.250)

| ID | Regra | Origem | Status |
|---|---|---|---|
| R-6A-01 | Lucros e dividendos pagos, creditados, empregados ou entregues por **uma mesma PJ** a **uma mesma PF residente** em montante **superior a R$ 50.000,00 no mesmo mês** sofrem IRRF de **10% sobre o total** do mês (não só sobre o excedente). | L art. 6º-A caput; IN 1.500 art. 23-A; PR 4 e 5 | CONFIRMADA |
| R-6A-02 | Nenhuma dedução da base de cálculo da retenção. | L art. 6º-A §1º | CONFIRMADA |
| R-6A-03 | Vários pagamentos da mesma PJ no mesmo mês são somados e a retenção é recalculada sobre o total do mês. | L art. 6º-A §2º | CONFIRMADA |
| R-6A-04 | Exatamente R$ 50.000,00 no mês: **sem retenção** ("superior a"). | L art. 6º-A caput; PR 7 | CONFIRMADA |
| R-6A-05 | A soma é por par (PJ, PF). Pagamentos de PJs diferentes não se somam. | L art. 6º-A caput ("uma mesma pessoa jurídica") | CONFIRMADA |
| R-6A-06 | Regra de transição: não se sujeitam à retenção os lucros que cumpram **cumulativamente** (I) resultados apurados até 2025, (II) distribuição aprovada até 31/12/2025 pelo órgão societário competente e (III) exigíveis, com pagamento nos termos originalmente previstos no ato de aprovação. Uma proposta da administração não supre a deliberação. | L art. 6º-A §3º; PR 7, 8 e 9 | CONFIRMADA |
| R-6A-07 | Os lucros da transição **não entram na soma** que testa o limite de R$ 50.000 do mês. | Interpretação do §3º ("não se sujeitam ao IRPF de que trata este artigo") | PENDENTE |
| R-6A-08 | Empresas do **Simples Nacional**: a Receita entende que a retenção se aplica (a isenção do art. 14 da LC 123/2006 "deixou de ser aplicada"). Há especialistas contra (hierarquia de lei complementar). | PR 10 | PENDENTE |
| R-6A-09 | A **capitalização de lucros** é "emprego": sofre retenção e entra na base do IRPFM. | PR 12 | CONFIRMADA |
| R-6A-10 | A retenção é **antecipação**: é deduzida do IRPFM (art. 16-A §5º) e o excesso é restituído no ajuste (§6º). Quem tem rendimentos de até R$ 600 mil recebe a retenção inteira de volta. | L art. 16-A §§5º e 6º; PR 4 | CONFIRMADA |
| R-6A-11 | Prazo de aprovação da transição: a lei diz 31/12/2025, e a liminar do STF estendeu para 31/01/2026, ainda sem referendo. O motor **não decide** isso: o escritório marca cada linha de dividendo como "regra de transição: S/N". | L §3º II; STF ADI 7.912 | PENDENTE |

**Opções configuráveis:**
- `simplesNacionalWithholding` (R-6A-08): padrão `true` (posição da Receita); conservador `true`.
- R-6A-07 não tem opção: excluir os lucros da transição da soma é a única leitura compatível com "não se sujeitam". Fica PENDENTE só porque nenhum texto oficial trata do caso misto.

## 2. Tributação mínima anual: IRPFM (art. 16-A da Lei 9.250)

### 2.1 Sujeição e regime

| ID | Regra | Origem | Status |
|---|---|---|---|
| R-16A-01 | Fica sujeita ao IRPFM a PF cuja **soma de todos os rendimentos recebidos no ano** seja **superior a R$ 600.000,00**. O motor testa o limite sobre o total bruto de rendimentos (inclusive os excluídos da base). **A escolha não altera nenhum valor**: se a base for de até R$ 600 mil, a alíquota do §2º é zero de qualquer forma. Ela só muda o alerta "sujeito ao IRPFM". Há uma propriedade testada que prova isso. | L art. 16-A caput e §2º | PENDENTE |
| R-16A-02 | **Regime de caixa**: contam os rendimentos **recebidos** no ano-calendário (ex.: CDB conta no resgate ou no vencimento; come-cotas conta quando ocorre). | L art. 16-A caput e §1º ("recebidos no ano-calendário") | CONFIRMADA |
| R-16A-03 | Primeiro ano: **exercício 2027, ano-calendário 2026**. | L art. 16-A caput; PR 3 | CONFIRMADA |

### 2.2 Base de cálculo (§1º)

| ID | Regra | Origem | Status |
|---|---|---|---|
| R-16A-04 | A base inclui o **resultado da atividade rural** e **todos os rendimentos recebidos**, inclusive os de tributação **exclusiva ou definitiva** e os **isentos ou sujeitos à alíquota zero ou reduzida**, deduzidas **exclusivamente** as parcelas da lista taxativa abaixo. | L art. 16-A §1º caput | CONFIRMADA |
| R-16A-05 | Ganhos líquidos em **bolsa ou balcão organizado** tributados pelo ganho líquido **entram** na base (exceção do inciso I). Inclui day trade, swing trade, opções, futuros, ETFs e venda de cotas de FII/Fiagro em bolsa. | L §1º I (parte final) | CONFIRMADA |
| R-16A-06 | **Ganhos isentos em ações** (vendas de até R$ 20 mil/mês): o motor os **inclui** por padrão. Motivo: são operações em bolsa do regime de ganho líquido (ficam fora da exclusão do inciso I), e o inciso XI exclui rendimentos isentos de TVM, **"exceto os rendimentos de ações"**. Leitura contrária: "sujeitas à tributação" exigiria tributação efetiva. | L §1º I e XI | PENDENTE |
| R-16A-07 | Rendimentos **distribuídos** por FII e Fiagro com cotas negociadas exclusivamente em bolsa/balcão e com pelo menos 100 cotistas: **excluídos** (V-i, V-j). Os que não cumprem os requisitos entram (tipo `FII_TRIBUTADO`). | L §1º V "i" e "j" | CONFIRMADA |
| R-16A-08 | Lucros e dividendos de PJ brasileira (inclusive de Simples Nacional, lucro presumido e capitalização) **entram**, salvo os da transição (R-16A-EX-XII). | L §1º caput; Lei 9.249 art. 10 caput (nova redação); PR 12 | CONFIRMADA |
| R-16A-09 | Só as exclusões da lista são admitidas. Qualquer outro rendimento isento entra (ex.: pensão alimentícia, lucro na venda de ações até R$ 20 mil, conforme R-16A-06). | L §1º ("deduzindo-se, exclusivamente") | CONFIRMADA |

**Lista taxativa de exclusões (§1º e §7º).** O briefing listava 9 grupos; o texto tem 12 incisos mais o §7º. Os itens marcados com ★ não estavam no briefing.

| ID | Exclusão | Origem | Tipos de rendimento no template | Status |
|---|---|---|---|---|
| R-16A-EX-I | Ganhos de capital, **exceto** os de bolsa/balcão organizado tributados pelo ganho líquido | §1º I | `GANHO_CAPITAL` | CONFIRMADA |
| R-16A-EX-II | RRA tributados exclusivamente na fonte (art. 12-A da Lei 7.713), se o contribuinte não optou pelo ajuste | §1º II | `RRA_EXCLUSIVO` | CONFIRMADA |
| R-16A-EX-III | Doação em adiantamento da legítima ou da herança | §1º III | `DOACAO_HERANCA` | CONFIRMADA |
| R-16A-EX-IV | Rendimentos de caderneta de poupança | §1º IV | `POUPANCA` | CONFIRMADA |
| R-16A-EX-V | Remuneração de LH, LCI, CRI, LIG, LCD, debêntures incentivadas (art. 2º da Lei 12.431), fundos de infraestrutura (art. 3º da Lei 12.431, com ≥ 85% em incentivadas), ★ fundos da Lei 11.478 (FIP-IE e FIP-PD&I), ★ FII e Fiagro qualificados | §1º V "a" a "j" | `LH`, `LCI`, `CRI`, `LIG`, `LCD`, `DEBENTURE_INCENTIVADA`, `FUNDO_INFRA`, `FIP_IE`, `FII_ISENTO`, `FIAGRO_ISENTO` | CONFIRMADA |
| R-16A-EX-VI | Remuneração de CDA, WA, CDCA, LCA, CRA | §1º VI | `CDA_WA`, `CDCA`, `LCA`, `CRA` | CONFIRMADA |
| R-16A-EX-VII | Remuneração de CPR com liquidação financeira, **desde que negociada no mercado financeiro** | §1º VII | `CPR` | CONFIRMADA |
| R-16A-EX-VIII | Parcela isenta relativa à atividade rural | §1º VIII | `RURAL_ISENTA` | CONFIRMADA |
| R-16A-EX-IX | Indenização por acidente de trabalho, danos materiais (inclusive corporais) ou morais, **ressalvados os lucros cessantes** | §1º IX | `INDENIZACAO` | CONFIRMADA |
| R-16A-EX-X | ★ Rendimentos isentos dos incisos XIV e XXI do art. 6º da Lei 7.713 (proventos de aposentadoria/reforma e pensão de portador de **moléstia grave**) | §1º X | `MOLESTIA_GRAVE` | CONFIRMADA |
| R-16A-EX-XI | ★ Rendimentos de TVM **isentos ou sujeitos à alíquota zero**, **exceto** rendimentos de ações e demais participações societárias | §1º XI | `TVM_ISENTO_OUTROS` | CONFIRMADA |
| R-16A-EX-XII | Lucros e dividendos da transição: (a) resultados até 2025, (b) distribuição aprovada até 31/12/2025, (c) pagamento ★ **nos anos-calendário 2026, 2027 e 2028** e nos termos do ato de aprovação | §1º XII | `DIVIDENDOS` com `regra_transicao = S` | CONFIRMADA |
| R-16A-EX-§7 | ★ Repasses obrigatórios sobre emolumentos de **titulares de cartórios** (art. 236 da CF) | §7º | `REPASSE_CARTORIO` (valor subtraído da base) | CONFIRMADA |

### 2.3 Alíquota (§2º)

| ID | Regra | Origem | Status |
|---|---|---|---|
| R-16A-10 | Base de até R$ 600.000,00: alíquota **0**. | §2º (o inciso II só começa "acima de 600.000") | CONFIRMADA |
| R-16A-11 | Base acima de R$ 600.000,00 e abaixo de R$ 1.200.000,00: **alíquota % = BASE ÷ 60.000 − 10**, linear de 0 a 10%. | §2º II | CONFIRMADA |
| R-16A-12 | Base **igual ou superior** a R$ 1.200.000,00: **10%**. | §2º I | CONFIRMADA |
| R-16A-13 | A alíquota **não é arredondada** (a lei não manda arredondar). O motor guarda a alíquota com precisão total (40 dígitos significativos) e só arredonda os valores em reais (R-ARR-01). | silêncio da lei | PENDENTE |

> **Observação para o produto.** Na faixa de transição, a alíquota **marginal** do IRPFM bruto é alta: d(alíquota × base)/d(base) = base ÷ 3.000.000 − 0,1. Isso dá 10% logo acima de R$ 600 mil, 20% em R$ 900 mil e quase 30% perto de R$ 1,2 milhão; acima disso cai para 10%. Isso vale antes das deduções. É o principal argumento comercial da "faixa de transição", e o motor calcula a marginal real por diferença finita.

### 2.4 Valor devido, deduções e saldo (§§3º a 6º)

A ordem é a da lei, e ela importa:

```
IRPFM bruto           = alíquota × base                                      (§3º caput)
(−) I   IRPF devido no ajuste anual (art. 12)                                (§3º I)
(−) II  IR retido exclusivamente na fonte sobre rendimentos da base          (§3º II)
(−) III IR apurado na forma dos arts. 1º a 13 da Lei 14.754/2023              (§3º III)
(−) IV  IR pago definitivamente sobre rendimentos da base, não contado em I a III (§3º IV)
(−) V   redutor do art. 16-B                                                 (§3º V)
= IRPFM devido        = máx(0, resultado)                                    (§4º)
(−) IRRF antecipado do art. 6º-A                                             (§5º)
= saldo do IRPFM: positivo = a pagar; negativo = a restituir               (§6º, somado ao saldo do ajuste)
```

| ID | Regra | Origem | Status |
|---|---|---|---|
| R-16A-14 | IRPFM bruto = alíquota × base. | §3º caput | CONFIRMADA |
| R-16A-15 | Dedução I: **IRPF devido** na declaração de ajuste (art. 12, já com as deduções de incentivo), e não o IRPF pago nem o retido. No MVP é **informado** pelo contador. | §3º I | CONFIRMADA |
| R-16A-16 | Deduções II e IV: **só** o imposto sobre rendimentos **incluídos na base**. O IR sobre ganho de capital de imóvel, por exemplo, não abate. | §3º II e IV ("incidente sobre os rendimentos incluídos", "referente aos rendimentos computados") | CONFIRMADA |
| R-16A-17 | Dedução III: IR da Lei 14.754/2023 (aplicações financeiras no exterior, entidades controladas, trusts). | §3º III | CONFIRMADA |
| R-16A-18 | Dedução V: redutor do art. 16-B (seção 3). | §3º V | CONFIRMADA |
| R-16A-19 | **Piso zero**: se o resultado de §3º for negativo, o IRPFM devido é zero. | §4º | CONFIRMADA |
| R-16A-20 | O IRRF do art. 6º-A é deduzido **depois** do piso. Por isso o saldo final **pode ser negativo** (restituição). As deduções I a V nunca geram restituição; só a retenção de dividendos gera. | §§4º e 5º | CONFIRMADA |
| R-16A-21 | O saldo do §5º é somado ao saldo a pagar ou a restituir do ajuste anual. O motor mostra o saldo do IRPFM separado. | §6º; art. 13 (nova redação) | CONFIRMADA |

### 2.5 Dados que o motor recebe e não calcula

| ID | Regra | Origem | Status |
|---|---|---|---|
| R-16A-22 | **IRPF devido no ajuste**: dado informado. Se faltar, o motor pode **estimar** (marcado como ESTIMATIVA) com a tabela anual de 2026 (IN 1.500, Anexo VII, item X, inserido pela IN 2.299) sobre os rendimentos tributáveis menos o desconto simplificado (20%, limitado a R$ 17.640,00, Lei 9.250 art. 10 X), com a redução do art. 11-A (que é zero acima de R$ 88.200). No modo conservador, IRPF ausente vale zero (o que maximiza o IRPFM). | IN 2.299 art. 7º; L art. 2º (arts. 10 X e 11-A) | CONFIRMADA (como estimativa) |
| R-16A-23 | **IR retido ou pago de cada linha**: informado. Se faltar, o motor estima com a alíquota padrão do tipo (tabela de tipos abaixo, marcada como ESTIMATIVA). No modo conservador, IR ausente vale zero. | decisão de produto | CONFIRMADA (como estimativa) |
| R-16A-24 | Alíquota de estimativa do **JCP**: 17,5% a partir de 2026 (LC 224/2025, art. 8º, que alterou o art. 9º §2º da Lei 9.249). Usada só quando o IR do JCP não é informado. | LC 224/2025 (fontes secundárias e Nota Cetad/Coest 9/2026, sem leitura do texto primário) | PENDENTE |

## 3. Redutor (art. 16-B da Lei 9.250)

| ID | Regra | Origem | Status |
|---|---|---|---|
| R-16B-01 | Calculado **por PJ pagadora**: `redutor_PJ = dividendos_PJ × máx(0, (alíquota efetiva PJ + alíquota efetiva IRPFM) − limite)`. | §2º | CONFIRMADA |
| R-16B-02 | Limite: **34%** em geral; **40%** para seguradoras, capitalização e instituições dos incisos II a VII, IX e X do §1º do art. 1º da LC 105/2001 (distribuidoras, corretoras, administradoras de cartão, arrendamento mercantil, crédito imobiliário, sociedades de crédito, cooperativas de crédito etc.); **45%** para os bancos de qualquer espécie (inciso I). | §1º | CONFIRMADA |
| R-16B-03 | Alíquota efetiva da PJ = (IRPJ + CSLL **devidos**) ÷ **lucro contábil** (resultado antes dos tributos sobre a renda), **do exercício a que se referem os lucros**. É dado **informado** por PJ. Sem ele, o redutor da PJ é zero e o motor emite alerta. | §3º I e III | CONFIRMADA |
| R-16B-04 | **Alíquota efetiva do IRPFM** = acréscimo do IRPFM devido **antes do redutor**, resultante da inclusão dos dividendos na base, ÷ montante dos dividendos do ano. A lei não diz se o "valor devido" antes do redutor já desconta as deduções I a IV. Estratégias plugáveis: **`INCREMENTAL_NET`** (padrão, mais literal: compara o IRPFM com e sem os dividendos, já com as deduções I a IV e o piso zero), **`INCREMENTAL_GROSS`** (compara só o bruto, alíquota × base) e **`NOMINAL_RATE`** (simplificação de mercado: usa a própria alíquota do IRPFM). Modo conservador: o **menor** redutor entre as estratégias. | §3º II | PENDENTE |
| R-16B-05 | Denominador da alíquota efetiva do IRPFM: "o montante dos lucros e dividendos recebidos pela pessoa física no ano-calendário". Padrão: os dividendos **computados na base** (`IN_BASE`). Alternativa: **todos** os recebidos, inclusive os da transição (`ALL_RECEIVED`). A alternativa quebra a propriedade "aumentar um rendimento excluído nunca altera o IRPFM", o que é um argumento contra ela. Modo conservador: o menor redutor. | §3º II "b" | PENDENTE |
| R-16B-06 | Só entram no redutor os dividendos **incluídos na base** (os da transição não geram IRPFM a reduzir). | decorre do §3º II "a" | CONFIRMADA |
| R-16B-07 | O redutor depende de demonstrações financeiras e de **regulamento** que ainda não saiu. A Receita poderá calcular o redutor na declaração pré-preenchida. Empresas fora do lucro real podem usar o lucro contábil simplificado (faturamento menos despesas listadas). Cabe ao escritório informar a alíquota efetiva já nesse critério. | §§4º a 8º | PENDENTE |
| R-16B-08 | Holdings (inclusive no lucro presumido): a alíquota efetiva da holding sobre os lucros é a que for informada. O motor não "olha através" da holding (§5º permite demonstrações consolidadas, na forma de regulamento). | §§5º e 6º | PENDENTE |

**Golden test do briefing:** dividendos de R$ 1.000.000, PJ 32%, IRPFM 6,66%, limite 34%: 1.000.000 × (0,32 + 0,0666 − 0,34) = **R$ 46.600,00**.

## 4. Arredondamento

| ID | Regra | Origem | Status |
|---|---|---|---|
| R-ARR-01 | Valores em reais são arredondados para **centavos**, meio para cima (`ROUND_HALF_UP`), **em um único lugar** (`packages/engine/src/money.ts`), nestes pontos: IRRF de cada par (PJ, mês); cada dedução; o redutor de cada PJ; o IRPFM bruto; o IRPFM devido; o saldo. Alíquotas não são arredondadas. Cálculos intermediários usam 40 dígitos significativos. | não há regra oficial publicada para o IRPFM | PENDENTE |

## 5. Tipos de rendimento (catálogo do template)

"Regime" diz qual dedução do §3º absorve o imposto da linha. A "estimativa de IR" só é usada quando o IR da linha não é informado.

| Código | Descrição | Na base? | Regime do IR | Estimativa de IR |
|---|---|---|---|---|
| `SALARIO` | Salários, pró-labore, honorários e demais rendimentos do trabalho tributáveis no ajuste | sim | ajuste (dedução I) | n/a |
| `ALUGUEL` | Aluguéis recebidos (tributáveis no ajuste/carnê-leão) | sim | ajuste | n/a |
| `APOSENTADORIA` | Aposentadoria e pensão tributáveis | sim | ajuste | n/a |
| `ATIVIDADE_RURAL` | Resultado tributável da atividade rural | sim | ajuste | n/a |
| `OUTROS_TRIBUTAVEIS` | Outros rendimentos tributáveis no ajuste | sim | ajuste | n/a |
| `DECIMO_TERCEIRO` | 13º salário (tributação exclusiva) | sim | exclusiva (II) | informar |
| `PLR` | Participação nos lucros e resultados | sim | exclusiva (II) | informar |
| `JCP` | Juros sobre capital próprio | sim | exclusiva (II) | 17,5% (R-16A-24) |
| `RENDA_FIXA` | CDB, RDB, LC, Tesouro Direto, debêntures comuns, operações compromissadas | sim | exclusiva (II) | 15% |
| `FUNDOS` | Fundos de investimento tributados (renda fixa, multimercado, ações, ETFs de renda fixa) | sim | exclusiva (II) | 15% |
| `PREVIDENCIA` | PGBL/VGBL no regime regressivo (parcela de rendimentos) | sim | exclusiva (II) | 10% |
| `FII_TRIBUTADO` | Rendimentos de FII/Fiagro sem os requisitos de isenção | sim | exclusiva (II) | 20% |
| `OUTROS_EXCLUSIVOS` | Outros rendimentos de tributação exclusiva na fonte | sim | exclusiva (II) | informar |
| `GANHO_BOLSA` | Ganho líquido tributado em bolsa/balcão organizado | sim | definitiva (IV) | 15% |
| `EXTERIOR_14754` | Aplicações financeiras e entidades controladas no exterior (Lei 14.754/2023) | sim | Lei 14.754 (III) | 15% |
| `DIVIDENDOS` | Lucros e dividendos de PJ no Brasil (inclui capitalização) | sim, salvo transição | retenção art. 6º-A (§5º) | calculada |
| `GANHO_BOLSA_ISENTO` | Ganho isento em ações (vendas ≤ R$ 20 mil/mês) | sim (R-16A-06) | isento | 0 |
| `OUTROS_ISENTOS` | Outros isentos não excluídos (ex.: pensão alimentícia) | sim | isento | 0 |
| `GANHO_CAPITAL` | Ganho de capital fora de bolsa (imóveis, participações, bens) | **não** (EX-I) | definitiva, fora do IRPFM | informar |
| `RRA_EXCLUSIVO` | RRA tributado exclusivamente na fonte | **não** (EX-II) | fora do IRPFM | informar |
| `DOACAO_HERANCA` | Doação em adiantamento da legítima, herança | **não** (EX-III) | isento | 0 |
| `POUPANCA` | Caderneta de poupança | **não** (EX-IV) | isento | 0 |
| `LH`, `LCI`, `CRI`, `LIG`, `LCD` | Títulos imobiliários e de desenvolvimento isentos | **não** (EX-V) | isento | 0 |
| `DEBENTURE_INCENTIVADA`, `FUNDO_INFRA`, `FIP_IE` | Infraestrutura (Leis 12.431 e 11.478) | **não** (EX-V) | isento/alíquota zero | 0 |
| `FII_ISENTO`, `FIAGRO_ISENTO` | Rendimentos distribuídos de FII/Fiagro qualificados | **não** (EX-V) | isento | 0 |
| `LCA`, `CRA`, `CDCA`, `CDA_WA` | Títulos do agronegócio | **não** (EX-VI) | isento | 0 |
| `CPR` | CPR com liquidação financeira negociada no mercado financeiro | **não** (EX-VII) | isento | 0 |
| `RURAL_ISENTA` | Parcela isenta da atividade rural | **não** (EX-VIII) | isento | 0 |
| `INDENIZACAO` | Indenizações (exceto lucros cessantes) | **não** (EX-IX) | isento | 0 |
| `MOLESTIA_GRAVE` | Aposentadoria e pensão isentas por moléstia grave | **não** (EX-X) | isento | 0 |
| `TVM_ISENTO_OUTROS` | Outros TVM isentos ou de alíquota zero, exceto ações | **não** (EX-XI) | isento | 0 |
| `REPASSE_CARTORIO` | Repasses obrigatórios sobre emolumentos (cartórios) | subtrai da base (§7º) | n/a | n/a |

As alíquotas de estimativa são as **mínimas** de cada regime (ex.: 15% é a alíquota mínima da tabela regressiva de renda fixa, art. 1º da Lei 11.033/2004). Isso subestima a dedução e, portanto, não subestima o IRPFM. Todas são dados versionados em `rules/2026.ts`.

## 6. Divergências em relação ao briefing

O briefing estava certo no essencial. Pontos em que o texto oficial diz algo diferente ou a mais:

1. **Lista de exclusões incompleta.** O briefing não citava: fundos da Lei 11.478 (V-h); **FII e Fiagro qualificados** (V-i, V-j), que o briefing tratava como dúvida, mas a lei exclui expressamente; **moléstia grave** (X); **TVM isentos ou de alíquota zero, exceto ações** (XI); repasses de **cartórios** (§7º). Também não citava a condição da transição de **pagamento até 2028** (XII-c).
2. **A dúvida "FII e Fiagro entram na base?" está resolvida pela lei**: os rendimentos distribuídos dos qualificados saem (V-i, V-j), e o ganho na venda de cotas em bolsa entra (I). Continua PENDENTE só o ganho isento em ações até R$ 20 mil (R-16A-06).
3. **Ordem das deduções.** O briefing listava o IRRF de dividendos junto com as deduções do §3º. Na lei, ele vem **depois do piso zero** (§5º). Por isso a restituição só nasce da retenção de dividendos, e nunca das outras deduções (R-16A-20). O motor segue a lei.
4. **Transição em três condições cumulativas**, e não duas: além de apuração até 2025 e aprovação até 31/12/2025, os lucros precisam ser exigíveis e pagos nos termos do ato de aprovação (art. 6º-A §3º III). Para a base do IRPFM, o pagamento tem que acontecer de 2026 a 2028 (§1º XII-c).
5. **Prazo de 31/12/2025 sob liminar do STF** (31/01/2026, ADI 7.912), sem referendo até agora. O motor não codifica a data: a planilha marca a linha.
6. **Simples Nacional**: a posição oficial da Receita é que a retenção se aplica (PR 10). Continua PENDENTE por causa da controvérsia, com padrão = posição da Receita.
7. **A IN 2.299 não regulamenta o IRPFM nem o redutor.** Ela só trata da retenção (art. 23-A da IN 1.500) e das tabelas. O redutor depende de regulamento ainda não publicado (16-B §4º), por isso R-16B-07 é PENDENTE.
8. **"Alíquota efetiva do IRPFM" definida em lei.** O §3º II define a alíquota como **acréscimo do IRPFM pela inclusão dos dividendos ÷ dividendos**, o que não é a alíquota nominal. O golden test do briefing (6,66%) passa a alíquota diretamente para a função do redutor. A estratégia `NOMINAL_RATE` reproduz essa leitura simplificada.
