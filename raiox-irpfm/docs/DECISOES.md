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

## D-010: Bibliotecas de planilha (29/10/2026)
Leitura com `read-excel-file` e escrita com `write-excel-file`: mantidas (releases em 2026), dependências mínimas e `pnpm audit` limpo. Descartadas: `xlsx` (a versão do npm tem CVEs conhecidas e não recebe correções lá) e `exceljs` (sem release desde 2023, dependências antigas). Na leitura, números chegam como o **texto bruto da célula** (`parseNumber`), e não como `number` do JavaScript.

## D-011: Fonte do PDF (29/10/2026)
IBM Plex Sans (OFL-1.1, pacote oficial `@ibm/plex-sans`): sóbria, com cara de documento financeiro, e com todos os símbolos da trilha (− ≤ → × ÷ §), que faltam na Helvetica padrão do PDF. O pacote vem só em WOFF, e, medido aqui, renderizar a partir de WOFF era ~3,5 vezes mais lento que a partir de TTF. Por isso a fonte é convertida para TTF **uma vez, em memória**: cada PDF passou de ~950 ms para ~85 ms. O script de telemetria de instalação do pacote é negado (`allowBuilds`).

## D-012: Conferência por dupla implementação (29/10/2026)
`tools/conferencia/irpfm_referencia.py` reimplementa o cálculo a partir de `docs/REGRAS.md`, só com a biblioteca padrão do Python, que o fundador lê. A CI compara as duas implementações em 3 sementes × 1.000 clientes sintéticos, ao centavo. Se alguém mudar uma regra em um lado só, a CI quebra.

## D-013: Trilha auditável à mão (29/10/2026)
Na faixa de transição, a alíquota tem infinitas casas decimais; multiplicar uma alíquota impressa pela base pode errar 1 centavo (um teste de propriedade achou o caso R$ 1.199.999,75). A trilha mostra a fórmula exata equivalente, `base² ÷ 6.000.000 − 10% × base`, que fecha em qualquer calculadora.

## D-014: IR informado em rendimento do ajuste é ignorado, com aviso (29/10/2026)
O IR retido sobre salário ou aluguel já está dentro do "IRPF devido no ajuste" (dedução I). Somá-lo também na dedução II contaria o imposto duas vezes. A importação ignora esse valor e avisa na linha.

## D-015: Alíquota marginal só onde o IR próprio é conhecido (29/10/2026)
13º, PLR, RRA e ganho de capital têm IR próprio por tabela que o MVP não modela. Mostrar a marginal deles sem esse IR seria enganoso, por isso ficam fora do painel de alíquota marginal.

## D-016: Seed com perfis realistas para 2026 (29/10/2026)
Além de executivos, empresários, médicos com PJ, rentistas, investidores, aposentados e agro, o seed inclui o **sócio que distribui até R$ 50 mil por mês por empresa** para fugir da retenção. É ele que costuma ter IRPFM a pagar no ajuste: quem recebe mais de R$ 50 mil por mês costuma ter a retenção cobrindo o IRPFM e sobrando restituição. Isso é um insight de produto: para a maioria, a conversa é sobre caixa e calendário, não sobre imposto novo.

## D-017: TypeScript 7 também no app web (29/10/2026)
O Next.js ainda não usa o compilador nativo do TypeScript 7 no build. O `next build` roda com `typescript.ignoreBuildErrors: true` e a checagem de tipos fica com `tsc` 7 (`pnpm typecheck`), o mesmo compilador do resto do monorepo; a CI roda os dois. Assim não há dois compiladores com regras diferentes.

## D-018: Dependências do shadcn e do drizzle-kit (29/10/2026)
O instalador do shadcn adicionou o pacote `cn` do npm e o `next-themes`; os dois saíram (o `cn` é a função de `src/lib/utils.ts`, e o app não tem tema escuro no MVP). O `pnpm audit` acusou um esbuild antigo dentro do drizzle-kit: um `override` fixa o esbuild 0.28.2, e o drizzle-kit continua gerando as migrations.

## D-019: Papéis e o que cada um faz (29/10/2026)
Os papéis do Better Auth são `owner`, `admin` e `member`, mostrados como Dono, Admin e Assessor. Dono e admin veem todos os clientes e fazem tudo, exceto mudar papéis, que é só do dono. O assessor vê só os clientes com o `codigo_assessor` dele (sem código, não vê nenhum), simula e salva cenários e baixa PDFs desses clientes; não importa, não edita, não exclui, não muda premissas, não gerencia a equipe e não vê a auditoria. Ninguém muda o próprio acesso pela tela Equipe.

## D-020: Importação em dois passos, mesclar ou substituir (29/10/2026)
O upload gera uma prévia (nada muda na base) com erros e avisos por linha. Na confirmação, **mesclar** (padrão) cria e atualiza os clientes da planilha e mantém os demais; **substituir** também remove os clientes do ano que não estão na planilha. Planilha com erros só entra se a pessoa marcar que quer importar apenas as linhas válidas. Depois da confirmação, o conteúdo da planilha não fica guardado; ficam o hash, as contagens e o relatório de problemas.

## D-021: Cadastro manual validado pelo importador (29/10/2026)
O formulário de cliente vira uma planilha de um cliente e passa pelo mesmo `importWorkbook` da importação. As duas portas de entrada seguem exatamente as mesmas regras (LGPD, códigos, meses, empresas, D-014), e os problemas voltam para o campo certo do formulário.

## D-022: A ficha calcula na hora; o painel usa a última rodada (29/10/2026)
O painel lê os resultados gravados na última rodada de cálculo. A ficha e o PDF recalculam o cliente com as premissas atuais, o que dá o resultado completo do motor para o resumo e o PDF. Os dois coincidem porque toda mudança de cliente, importação ou premissa dispara o recálculo do escritório.

## D-023: Row-Level Security fica para a fase 5 **[revisar]** (29/10/2026)
A arquitetura previa RLS no Postgres já na fase 3. Ficou para a fase 5: com conexão em pool, cada requisição precisaria de uma transação com `SET LOCAL app.org_id`, o que muda o acesso ao banco inteiro. Hoje o isolamento está na camada de serviço (todo acesso a tabela de negócio filtra por `org_id`, e por assessor quando é o caso) e é provado por testes automatizados de leitura, alteração e exclusão entre escritórios e entre assessores. RLS entra como segunda camada na fase 5.

## D-024: Convite por link, sem e-mail (29/10/2026)
O app ainda não envia e-mail. O convite gera um link que o dono ou admin copia e manda para a pessoa; o link só vale para o e-mail convidado e expira em 7 dias. O código de assessor vai no convite e é aplicado quando ele é aceito. Envio de e-mail entra com o provedor de e-mail, na fase 5.

## D-025: Premissas guardam só o que difere do padrão (29/10/2026)
O escritório guarda apenas as escolhas PENDENTES que diferem do padrão do motor. Se uma nova versão das regras mudar um padrão, ele chega a quem nunca mexeu naquela escolha. O denominador do redutor (R-16B-05) não é configurável: a alternativa contraria o art. 16-A, §1º, XII.

## D-026: Cascata mostra o que cada dedução abate (29/10/2026)
O IRPFM devido nunca fica negativo (§4º), então uma dedução maior que o IRPFM restante só abate até zerar. Na ficha e no PDF, a barra de cada dedução mostra a parte usada, e o valor cheio continua escrito ao lado. A retenção sobre dividendos aparece inteira: ela é antecipação e pode gerar restituição.

## D-027: Fontes do PDF no app web (29/10/2026)
O bundler do Next reescreve a resolução de módulos dentro dos pacotes, e o PDF quebrava ao procurar a fonte. O gerador de PDF recebe a pasta dos arquivos da fonte; a CLI continua resolvendo pelo Node, e o app web informa a pasta dele e inclui os arquivos no build de produção.
