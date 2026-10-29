import type { AlertCode, Severity } from "@raiox/engine";

/** Short labels for badges and filters (full messages come from the engine). */
export const ALERT_LABEL: Record<AlertCode, string> = {
  IRPFM_A_PAGAR: "IRPFM a pagar",
  FAIXA_TRANSICAO: "Faixa de transição",
  PROXIMO_DO_LIMIAR: "Perto do limite",
  RETENCAO_MENSAL: "Retenção mensal",
  IRRF_RESTITUIVEL: "A restituir",
  IRPF_AJUSTE_ESTIMADO: "IRPF estimado",
  IRPF_AJUSTE_AUSENTE: "Sem IRPF do ajuste",
  IR_LINHA_ESTIMADO: "IR estimado",
  IR_LINHA_AUSENTE: "IR não informado",
  ALIQUOTA_PJ_AUSENTE: "Sem alíquota da PJ",
  DIVIDENDOS_TRANSICAO: "Lucros da transição",
  SIMPLES_NACIONAL_RETENCAO: "Simples Nacional",
  REGRA_PENDENTE: "Regra pendente",
};

export const ALERT_SEVERITY: Record<AlertCode, Severity> = {
  IRPFM_A_PAGAR: "critico",
  IRPF_AJUSTE_AUSENTE: "critico",
  FAIXA_TRANSICAO: "atencao",
  RETENCAO_MENSAL: "atencao",
  IRPF_AJUSTE_ESTIMADO: "atencao",
  IR_LINHA_AUSENTE: "atencao",
  ALIQUOTA_PJ_AUSENTE: "atencao",
  PROXIMO_DO_LIMIAR: "info",
  IRRF_RESTITUIVEL: "info",
  IR_LINHA_ESTIMADO: "info",
  DIVIDENDOS_TRANSICAO: "info",
  SIMPLES_NACIONAL_RETENCAO: "info",
  REGRA_PENDENTE: "info",
};

/** Alerts worth a badge in the ranking (the rest stay on the client page). */
export const BADGE_ALERTS: readonly AlertCode[] = [
  "IRPFM_A_PAGAR",
  "FAIXA_TRANSICAO",
  "IRRF_RESTITUIVEL",
  "RETENCAO_MENSAL",
  "IRPF_AJUSTE_AUSENTE",
  "IRPF_AJUSTE_ESTIMADO",
  "ALIQUOTA_PJ_AUSENTE",
  "PROXIMO_DO_LIMIAR",
];

export const SEVERITY_CLASS: Record<Severity, string> = {
  critico: "border-pay/30 bg-pay/8 text-pay",
  atencao: "border-attention/30 bg-attention-bg text-attention",
  info: "border-border bg-muted text-muted-foreground",
};

export const BAND_LABEL = {
  abaixo: "Abaixo do limite",
  transicao: "Faixa de transição",
  cheia: "Alíquota cheia",
} as const;
