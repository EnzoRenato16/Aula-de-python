# Briefing: Raio-X IRPFM (nome provisório)

> Briefing original do fundador, salvo sem alterações. Divergências encontradas entre este briefing e o texto oficial da lei estão em `docs/REGRAS.md`, seção "Divergências em relação ao briefing".

## Seu papel
Você é o CTO e engenheiro de software sênior fundador deste produto. Decide a arquitetura, escreve código de produção, testa tudo e me explica as decisões importantes em linguagem simples. Eu sou o fundador: engenheiro de dados (Python, SQL), conheço o negócio de assessoria de investimentos, mas não sou dev web sênior. Eu reviso e aprovo cada fase.

## O produto
SaaS B2B para escritórios de assessoria e consultorias de investimento. O escritório sobe uma planilha anonimizada com a renda e a carteira dos clientes, e o sistema:
1. calcula, cliente a cliente, o impacto da Lei 15.270/2025: retenção de 10% sobre dividendos e tributação mínima anual (IRPFM) do ano-calendário 2026, declaração 2027;
2. ranqueia a base por oportunidade: quem vai pagar IRPFM, quem está na faixa de transição, quem tem imposto a restituir;
3. simula cenários (mudar alocação, mudar o calendário de dividendos), comparando o rendimento líquido depois de TODOS os impostos;
4. gera uma página em PDF por cliente, com a marca do escritório, e uma mensagem sugerida para o assessor enviar.

## Regras de ouro (inegociáveis)
1. Correção tributária acima de tudo. Nunca invente regra. As fontes da verdade são: o texto oficial da Lei 15.270/2025 no planalto.gov.br (ela alterou a Lei 9.250/1995, incluindo os arts. 6º-A, 16-A e 16-B, e também a Lei 9.249/1995), a IN RFB 2.299/2025 e o "Perguntas e Respostas" da Receita sobre a lei. Antes de codar o motor, leia esses textos e escreva docs/REGRAS.md: cada regra com o artigo/inciso de origem e um status, CONFIRMADA ou PENDENTE (interpretação incerta ou dependente de regulamentação).
2. Regras são dados versionados por ano-calendário, nunca números mágicos espalhados no código.
3. Dinheiro nunca em float: decimal.js no código, NUMERIC no banco, regra de arredondamento definida em um único lugar.
4. A IA nunca faz conta. O motor determinístico calcula; o LLM só escreve texto a partir do JSON de resultado. Todo número no texto gerado é conferido contra o resultado; se não bater, usa um template fixo.
5. LGPD: o sistema não pede nem guarda CPF nem nome completo. Cliente = código pseudônimo + apelido opcional. Nenhum dado pessoal em logs nem enviado à API de IA. Isolamento total entre escritórios, com testes automatizados que provem isso.
6. É ferramenta para profissional credenciado. Telas e PDFs falam em "simulação" e "cenário", nunca em "recomendação". Todo PDF traz o aviso: não é recomendação de investimento nem consultoria tributária; valide com o contador.
7. Versões: use as versões estáveis mais recentes, confirmando com `npm view <pacote> version` antes de instalar. Não confie na memória.
8. Qualidade: TypeScript strict, testes do motor escritos antes do código, CI verde antes de avançar de fase, commits pequenos. Nunca diga que algo funciona sem ter rodado.

## Stack
- Monorepo com pnpm workspaces:
  - packages/engine: motor de cálculo puro em TypeScript (só depende de decimal.js);
  - packages/io: template de importação, leitura de CSV/XLSX (biblioteca mantida e sem vulnerabilidades conhecidas), validação com Zod, erros por linha;
  - apps/cli: roda o motor numa planilha e gera ranking em CSV e PDFs. É o que vou usar nos primeiros pilotos, antes de o app web existir;
  - apps/web: Next.js (App Router, React, Server Actions), Tailwind CSS + shadcn/ui, TanStack Table, Recharts, React Hook Form + Zod.
- PostgreSQL + Drizzle ORM (migrations versionadas); Docker Compose para rodar local.
- Autenticação: Better Auth com plugin de organizações. Papéis: dono, admin e assessor (o assessor só vê os próprios clientes).
- PDF: @react-pdf/renderer. Processamento em lote: pg-boss.
- IA: SDK oficial da Anthropic, com o modelo definido por variável de ambiente.
- Testes: Vitest (unitários, golden tests, property-based com fast-check) e Playwright (e2e). Lint/format: Biome. CI: GitHub Actions (lint, typecheck, testes, build).
- Deploy (última fase): Postgres gerenciado em São Paulo + Vercel com região São Paulo (ou equivalente). Escreva docs/DEPLOY.md passo a passo para iniciante, incluindo backups.
- Interface 100% em pt-BR (R$, dd/mm/aaaa, vírgula decimal), responsiva (o assessor usa no celular) e acessível. Código, nomes e commits em inglês.

## O motor (ponto de partida: CONFIRME tudo no texto oficial)

Retenção mensal (art. 6º-A)
- Lucros/dividendos pagos pela mesma PJ à mesma PF residente acima de R$ 50.000 no mês: IRRF de 10% sobre o TOTAL do mês, não só sobre o excedente.
- É antecipação: abate do IRPFM, e o que exceder é restituído no ajuste (tudo, se a renda anual não passar de R$ 600 mil).
- Lucros apurados até 2025, com distribuição aprovada até 31/12/2025, ficam fora da retenção e da base do IRPFM (regra de transição).

IRPFM (art. 16-A)
- Aplica-se a quem soma mais de R$ 600 mil de rendimentos no ano.
- A base é ampla: todos os rendimentos recebidos no ano, inclusive isentos e de tributação exclusiva/definitiva, menos uma lista TAXATIVA de exclusões (§1º). Implemente a lista completa do texto. Conheço pelo menos:
  - ganhos de capital, exceto os de bolsa/balcão organizado tributados pelo ganho líquido;
  - RRA tributados exclusivamente na fonte;
  - doações em adiantamento da legítima ou herança;
  - poupança;
  - LCI, LIG, CRI, LCD, debêntures incentivadas e fundos correlatos;
  - títulos do agro (LCA, CRA, CDCA, CDA/WA) e CPR;
  - parcela isenta da atividade rural;
  - indenizações;
  - lucros da regra de transição.
- Alíquota (§2º): até R$ 600 mil = 0%; entre R$ 600 mil e R$ 1,2 milhão = (BASE ÷ 60.000) − 10, em pontos percentuais; a partir de R$ 1,2 milhão = 10%.
- Valor devido (§3º) = alíquota × base, menos:
  - o IRPF devido no ajuste anual (tabela progressiva);
  - o IR retido exclusivamente na fonte sobre rendimentos incluídos na base;
  - o IR pago definitivamente sobre rendimentos incluídos (inclusive aplicações no exterior, Lei 14.754/2023);
  - o IRRF de dividendos do art. 6º-A;
  - o redutor do art. 16-B.
  O resultado nunca é negativo, e o excesso do IRRF de dividendos vira restituição. Confirme a ordem e os limites de cada dedução.
- Regime de caixa: só conta o rendimento recebido/realizado no ano (ex.: CDB conta no resgate ou no vencimento).

Redutor (art. 16-B), calculado por empresa pagadora
- Redutor = dividendos pagos × [(alíquota efetiva da PJ + alíquota efetiva do IRPFM) − limite], só quando positivo.
- Limite: 34% em geral; 40% para seguradoras, capitalização e instituições financeiras listadas; 45% para bancos.
- Alíquota efetiva da PJ = (IRPJ + CSLL devidos) ÷ lucro contábil do exercício a que os lucros se referem. É um dado informado; sem ele, redutor = 0 e um alerta.
- A definição exata de "alíquota efetiva do IRPFM" para o redutor tem leituras diferentes publicadas. Leia o texto, implemente como estratégia plugável e marque PENDENTE.

Pontos controversos (status PENDENTE, configuráveis e exibidos na tela Premissas)
- Dividendos de empresas do Simples Nacional: a Receita entende que a retenção se aplica, e há especialistas contra.
- Ganhos isentos em ações (vendas até R$ 20 mil/mês), FII e Fiagro: entram na base?
- Holdings no lucro presumido; regras de arredondamento.

Fora do motor no MVP
- O IRPF da tabela progressiva não é recalculado. É um campo informado (vindo do contador), com uma estimativa opcional claramente marcada como estimativa. Por isso, no MVP, os cenários mexem só em investimentos e dividendos.

Golden tests obrigatórios (além dos que você derivar do texto)
- Base de R$ 500 mil → IRPFM 0; dividendos retidos → 100% restituíveis.
- Base de R$ 600 mil → 0%.
- Base de R$ 900 mil → 5% → IRPFM bruto de R$ 45.000.
- Base de R$ 1,2 milhão → 10% → R$ 120.000.
- Base de R$ 2 milhões → R$ 200.000.
- R$ 60.000 de uma PJ no mês → retenção de R$ 6.000.
- Exatamente R$ 50.000 no mês → sem retenção.
- Duas PJs pagando R$ 40.000 cada no mesmo mês → sem retenção.
- Dividendos da regra de transição → fora da base e sem retenção.
- Redutor com dividendos de R$ 1.000.000, PJ 32%, IRPFM 6,66% e limite 34% → R$ 46.600.
- Propriedades (fast-check): o IRPFM devido nunca é negativo; aumentar um rendimento excluído nunca altera o IRPFM; o resultado não depende da ordem das linhas.

Saídas do motor
- Base, exclusões detalhadas, alíquota, IRPFM bruto, cada dedução, redutor por empresa, IRPFM a pagar ou valor a restituir, carga efetiva total.
- Trilha de cálculo: cada passo com valor, fórmula e artigo da lei, mostrada na tela e no PDF para auditoria.
- Alíquota marginal efetiva por tipo de rendimento, calculada por diferença finita no próprio motor (+R$ 1.000).
- Alertas:
  - faixa de transição (R$ 600 mil a R$ 1,2 milhão);
  - retenção mensal ocorrendo;
  - IRRF restituível;
  - dado faltando (IRPF do ajuste, alíquota efetiva da PJ);
  - regra PENDENTE usada no cálculo.
- Cenários: aplicar mudanças (mover R$ X de uma classe para outra com taxa Y; redistribuir dividendos ao longo dos meses) e comparar lado a lado com o cenário base. A comparação é sempre pelo rendimento líquido após todos os impostos, nunca só pelo imposto economizado.
- Score de oportunidade para ranquear a base, com fórmula documentada e ajustável.

## Produto (MVP)
1. O escritório cria a conta, sobe logo e cor e convida os assessores.
2. Importação: baixar o template XLSX e subir preenchido. O template tem formato longo (uma linha por cliente × tipo de rendimento × mês), aba de dicionário de dados com exemplos e aba opcional de posições (classe, saldo, taxa esperada) usada nos cenários. Depois de subir: ver erros por linha, pré-visualizar e confirmar. Também cadastro manual de um cliente.
3. Painel: base ranqueada (IRPFM estimado, carga efetiva, oportunidade, alertas), filtros por assessor e por alerta, exportação em CSV.
4. Ficha do cliente: gráfico em cascata do cálculo, trilha de cálculo, alíquota marginal por classe, simulador de cenários.
5. PDF de uma página por cliente, com a marca do escritório, mais uma mensagem sugerida para WhatsApp/e-mail gerada por IA (editável, sem promessa de rentabilidade, com aviso legal). Geração em lote (ZIP).
6. Tela Premissas: todas as regras do ano com artigo e status, e um "modo conservador".
7. Log de auditoria; exclusão dos dados de um cliente ou do escritório inteiro.
8. Seed com ~200 clientes sintéticos e realistas. Nunca dados reais no repositório.

Fora do MVP (só deixe a arquitetura preparada): leitura por IA de informe de rendimentos/extrato em PDF, com tela de revisão humana; link seguro para o contador do cliente preencher a renda; integração com corretoras; cobrança por assinatura.

## Fases e critério de pronto
- Fase 0, fundação: monorepo, lint, typecheck, Vitest, CI, Docker Compose, CLAUDE.md. Pronto = CI verde.
- Fase 1, motor + CLI (prioridade máxima): docs/REGRAS.md, motor com todos os golden e property tests, trilha de cálculo, e a CLI `pnpm raiox calcular --entrada clientes.xlsx --saida ./resultado` gerando ranking CSV e PDF simples por cliente. Pronto = rodar no seed e eu conferir 5 clientes à mão.
- Fase 2, importação: template, validação, relatório de erros.
- Fase 3, app web: autenticação, organizações, papéis, painel, ficha, simulador.
- Fase 4: PDF com marca, mensagens com IA, geração em lote.
- Fase 5, endurecimento: testes de isolamento entre escritórios, rate limit (login e IA), limites de upload, cabeçalhos de segurança, revisão OWASP, LGPD (exclusão, retenção, política), logs estruturados sem dados pessoais, e2e com Playwright, DEPLOY.md e deploy.
Em toda fase, rode os testes e mostre a evidência. Se descobrir que algo deste briefing está errado, pare e me avise antes de seguir.

## Como trabalhar comigo
- Salve este briefing em docs/BRIEFING.md. Crie um CLAUDE.md com convenções, comandos e decisões, e mantenha-o atualizado.
- Ao fim de cada fase, me diga o que foi feito, como eu testo (comandos exatos) e o que ficou pendente.

## Sua primeira resposta
Não escreva código ainda. Me entregue: 1) sua leitura da lei, com as dúvidas abertas; 2) arquitetura e modelo de dados; 3) plano de fases com estimativa; 4) perguntas para mim.

> Nota do CTO (29/10/2026): depois do briefing, o fundador deu autonomia total ("não pergunte nada, só faça"). Por isso as perguntas viraram decisões documentadas em `docs/DECISOES.md`, todas reversíveis.
