/**
 * Single source of truth for the import format: the template generator, the
 * data dictionary and the parser all read these definitions.
 */

export type ColumnKind =
  | "code" // pseudonymous identifier: letters, digits, . _ -
  | "nickname"
  | "money"
  | "rate"
  | "month"
  | "yesno"
  | "incomeType"
  | "assetClass"
  | "limitCategory";

export interface ColumnDefinition {
  key: string;
  label: string;
  kind: ColumnKind;
  required: boolean;
  description: string;
  example: string;
  width: number;
}

export interface SheetDefinition {
  key: SheetKey;
  title: string;
  required: boolean;
  description: string;
  columns: readonly ColumnDefinition[];
}

export type SheetKey = "clientes" | "empresas" | "rendimentos" | "posicoes";

const col = (
  key: string,
  kind: ColumnKind,
  required: boolean,
  description: string,
  example: string,
  width = 18,
): ColumnDefinition => ({ key, label: key, kind, required, description, example, width });

export const SHEETS: Record<SheetKey, SheetDefinition> = {
  clientes: {
    key: "clientes",
    title: "clientes",
    required: false,
    description:
      "Um cliente por linha. Opcional: clientes que só aparecem em 'rendimentos' são criados automaticamente.",
    columns: [
      col(
        "codigo_cliente",
        "code",
        true,
        "Código pseudônimo do cliente, definido pelo escritório. NUNCA use CPF ou nome.",
        "CLI-0001",
      ),
      col(
        "apelido",
        "nickname",
        false,
        "Apelido opcional para o assessor reconhecer o cliente (ex.: 'Dr. R.', 'Cliente Pinheiros'). Não use nome completo.",
        "Dr. R.",
        22,
      ),
      col(
        "codigo_assessor",
        "code",
        false,
        "Código do assessor responsável (filtra o painel; o assessor só vê os próprios clientes).",
        "ASS-07",
      ),
      col(
        "irpf_devido_ajuste",
        "money",
        false,
        "IRPF DEVIDO na declaração de ajuste de 2027 (ano-calendário 2026), informado pelo contador. Não é o imposto retido nem o pago. Em branco: o sistema estima e sinaliza.",
        "185000,00",
        20,
      ),
    ],
  },
  empresas: {
    key: "empresas",
    title: "empresas",
    required: false,
    description:
      "Empresas que pagam lucros e dividendos aos clientes. Use um código pseudônimo; não informe CNPJ.",
    columns: [
      col(
        "codigo_empresa",
        "code",
        true,
        "Código pseudônimo da empresa pagadora, definido pelo escritório.",
        "EMP-HOLDING-A",
        20,
      ),
      col(
        "aliquota_efetiva_pj",
        "rate",
        false,
        "(IRPJ + CSLL devidos) ÷ lucro contábil antes dos tributos, do exercício a que os lucros se referem (art. 16-B, §3º). Ex.: 32% ou 0,32. Em branco: redutor zero e alerta.",
        "32%",
        20,
      ),
      col(
        "categoria_limite",
        "limitCategory",
        false,
        "GERAL (34%), FINANCEIRA (40%: seguradoras, capitalização e instituições da LC 105, art. 1º, §1º, II a VII, IX e X) ou BANCO (45%). Em branco: GERAL.",
        "GERAL",
      ),
      col(
        "simples_nacional",
        "yesno",
        false,
        "S se a empresa é do Simples Nacional (retenção sobre dividendos é tema PENDENTE).",
        "N",
      ),
    ],
  },
  rendimentos: {
    key: "rendimentos",
    title: "rendimentos",
    required: true,
    description:
      "Formato longo: uma linha por cliente × tipo de rendimento × mês. Regime de caixa: valores recebidos/realizados em 2026.",
    columns: [
      col("codigo_cliente", "code", true, "Código pseudônimo do cliente.", "CLI-0001"),
      col(
        "tipo_rendimento",
        "incomeType",
        true,
        "Código do tipo de rendimento (veja a aba 'dicionario').",
        "DIVIDENDOS",
        24,
      ),
      col(
        "mes",
        "month",
        false,
        "Mês do recebimento (1 a 12). Obrigatório para DIVIDENDOS (retenção mensal). Em branco para valores anuais.",
        "3",
        8,
      ),
      col(
        "valor",
        "money",
        true,
        "Valor bruto recebido (rendimento, não o principal aplicado). Ex.: 60.000,00 ou 60000,00.",
        "60000,00",
      ),
      col(
        "ir_retido_ou_pago",
        "money",
        false,
        "IR retido na fonte ou pago (renda fixa, fundos, JCP, 13º, PLR, ganhos em bolsa, exterior). Em branco: estimativa pela alíquota mínima do regime.",
        "",
        20,
      ),
      col(
        "codigo_empresa",
        "code",
        false,
        "Empresa pagadora (obrigatório para DIVIDENDOS). Deve existir na aba 'empresas' para o redutor.",
        "EMP-HOLDING-A",
        20,
      ),
      col(
        "regra_transicao",
        "yesno",
        false,
        "Só DIVIDENDOS: S se for lucro apurado até 2025, com distribuição aprovada até 31/12/2025 e paga nos termos do ato de aprovação. Confirme com o contador.",
        "N",
      ),
    ],
  },
  posicoes: {
    key: "posicoes",
    title: "posicoes",
    required: false,
    description: "Opcional: carteira atual por classe, usada só nos cenários (mover alocação).",
    columns: [
      col("codigo_cliente", "code", true, "Código pseudônimo do cliente.", "CLI-0001"),
      col(
        "classe",
        "assetClass",
        true,
        "Classe do ativo (mesmos códigos de tipo_rendimento: RENDA_FIXA, LCI, LCA, FUNDOS...).",
        "RENDA_FIXA",
        20,
      ),
      col("saldo", "money", true, "Saldo atual aplicado na classe.", "2000000,00"),
      col(
        "taxa_esperada_aa",
        "rate",
        true,
        "Rentabilidade esperada ao ano (ex.: 12% ou 0,12). Premissa do cenário, não promessa.",
        "12%",
      ),
      col(
        "aliquota_ir",
        "rate",
        false,
        "Alíquota de IR sobre o rendimento (ex.: 15%). Em branco: alíquota mínima do regime.",
        "15%",
      ),
    ],
  },
};

export const SHEET_ORDER: readonly SheetKey[] = ["clientes", "empresas", "rendimentos", "posicoes"];

/** Lowercase, no accents, spaces and dashes as underscores. */
export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}
