# Registro de decisões

Formato: contexto curto, decisão, motivo. Decisões tributárias detalhadas ficam em `docs/REGRAS.md`; aqui ficam as escolhas de produto e engenharia. O fundador deu autonomia total em 29/10/2026, então as perguntas que eu faria viraram decisões explícitas e reversíveis, marcadas com **[revisar]**.

## D-001: Onde o código mora (29/10/2026)
A integração do GitHub desta sessão não tem permissão para criar repositórios (`403 Resource not accessible by integration`). O monorepo está na subpasta `raiox-irpfm/` do repositório `Aula-de-python`, no branch `claude/raiox-irpfm`. A CI fica em `.github/workflows/raiox-ci.yml` e roda só quando algo nessa pasta muda.
**[revisar]** Crie um repositório privado `raiox-irpfm` e extraia o histórico com `git subtree split --prefix raiox-irpfm -b raiox-only`.

## D-002: pnpm 12 com quarentena de versões (29/10/2026)
pnpm 12.16.1 (a mais recente). O workspace define `minimumReleaseAge: 4320` (3 dias): versão publicada há menos tempo que isso não é instalada. Isso protege contra pacotes sequestrados, que costumam ser detectados e removidos em horas. Por isso o Biome está em 2.6.3 e não em 2.6.4 (publicado na véspera).

## D-003: TypeScript 7 e Node 22 (29/10/2026)
TypeScript 7.0.2 (o compilador nativo, bem mais rápido) e Node 22 LTS. Configuração strict máxima: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.

## D-004: Fontes oficiais obtidas fora do Planalto (29/10/2026)
O planalto.gov.br bloqueia acesso automatizado. Usei a publicação original na Câmara dos Deputados e conferi os artigos críticos com uma impressão da página do Planalto. A IN 2.299 veio da cópia do DOU, e o Perguntas e Respostas, do gov.br/receitafederal. Os textos estão em `docs/fontes/`.

## D-005: Dinheiro como string decimal nas fronteiras (29/10/2026)
O motor só aceita `string` canônica (`"1234.56"`) ou `Decimal`, nunca `number`. Assim, um `0.1 + 0.2` vindo do Excel ou do JSON não chega ao cálculo. A conversão de formatos brasileiros ("1.234,56", "32%") é responsabilidade do `packages/io`.

## D-006: Modo conservador sobrepõe todas as escolhas PENDENTES (29/10/2026)
No modo conservador, cada regra PENDENTE assume a opção que nunca subestima o imposto: ganho isento em ações entra na base; o redutor fica com o menor valor entre todas as estratégias; IRPF do ajuste ausente vale zero; IR de linha ausente vale zero. Escolhas manuais são ignoradas nesse modo, para que o botão signifique sempre a mesma coisa.

## D-007: Estimativas ligadas por padrão, sempre sinalizadas (29/10/2026)
Sem o IRPF do ajuste, tratar o valor como zero superestimaria muito o IRPFM de quem é assalariado e distorceria o ranking. Por padrão, o motor estima (tabela 2026 com desconto simplificado), marca como ESTIMATIVA e emite alerta. **[revisar]** Se preferir o contrário, basta mudar o padrão de `estimateIrpfWhenMissing`.

## D-008: Transição marcada na planilha, não deduzida de datas (29/10/2026)
Se um dividendo é da regra de transição depende de três condições societárias (apuração, aprovação e exigibilidade) e de um prazo sob discussão no STF. Quem sabe isso é o contador. A linha de dividendo tem a coluna `regra_transicao` (S/N), e o motor obedece.

## D-009: Empresas pagadoras pseudonimizadas (29/10/2026)
O template não pede CNPJ: o CNPJ de uma empresa pequena identifica o sócio. Cada empresa é um `codigo_empresa` definido pelo escritório. Os atributos que o redutor exige (alíquota efetiva, categoria do limite, Simples) ficam na aba `empresas`.
