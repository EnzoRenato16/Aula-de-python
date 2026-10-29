#!/usr/bin/env node
import { Command, Option } from "commander";
import { calcular } from "./commands/calcular.ts";
import { regras } from "./commands/regras.ts";
import { seed } from "./commands/seed.ts";
import { template } from "./commands/template.ts";
import { consoleLogger } from "./util.ts";

const program = new Command()
  .name("raiox")
  .description("Raio-X IRPFM: simulação do impacto da Lei 15.270/2025 numa base de clientes")
  .showHelpAfterError();

const run = (action: () => Promise<number> | number) => async () => {
  try {
    process.exitCode = await action();
  } catch (error) {
    consoleLogger.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

program
  .command("calcular")
  .description("calcula todos os clientes de uma planilha e gera ranking CSV, JSON e PDFs")
  .requiredOption("-e, --entrada <arquivo>", "planilha .xlsx, arquivo .csv ou pasta com .csv")
  .requiredOption("-s, --saida <pasta>", "pasta de saída")
  .option("--conservador", "modo conservador: escolhas PENDENTES que nunca subestimam o imposto")
  .option("--sem-pdf", "não gera os PDFs")
  .option("--ignorar-erros", "calcula as linhas válidas mesmo com erros de importação")
  .option("--escritorio <nome>", "nome do escritório no PDF")
  .option("--cor <hex>", "cor principal do PDF (ex.: #12343B)")
  .option("--logo <arquivo>", "logo PNG/JPG para o PDF")
  .addOption(
    new Option(
      "--estrategia-redutor <estrategia>",
      "alíquota efetiva do IRPFM no redutor (R-16B-04)",
    ).choices(["INCREMENTAL_NET", "INCREMENTAL_GROSS", "NOMINAL_RATE"]),
  )
  .option("--simples-sem-retencao", "não retém dividendos de empresas do Simples (R-6A-08)")
  .option("--ganho-isento-fora", "exclui da base o ganho isento em ações (R-16A-06)")
  .option("--sem-estimativas", "não estima IRPF do ajuste nem IR de linhas ausentes")
  .action((options) =>
    run(() =>
      calcular(
        {
          ...options,
          pdf: options.semPdf !== true,
        },
        consoleLogger,
      ),
    )(),
  );

program
  .command("template")
  .description("gera o template XLSX de importação (com dicionário de dados)")
  .requiredOption("-s, --saida <arquivo>", "arquivo .xlsx de saída")
  .option("--ano <ano>", "ano-calendário")
  .action((options) => run(() => template(options, consoleLogger))());

program
  .command("seed")
  .description("gera uma base de clientes SINTÉTICOS no formato do template")
  .requiredOption("-s, --saida <arquivo>", "arquivo .xlsx de saída")
  .option("-n, --clientes <n>", "quantidade de clientes", "200")
  .option("--semente <n>", "semente do gerador (mesma semente → mesma base)", "42")
  .action((options) => run(() => seed(options, consoleLogger))());

program
  .command("regras")
  .description("lista as regras do ano com artigo de origem e status")
  .option("--ano <ano>", "ano-calendário")
  .option("--pendentes", "só as regras PENDENTES")
  .action((options) => run(() => regras(options, consoleLogger))());

await program.parseAsync();
