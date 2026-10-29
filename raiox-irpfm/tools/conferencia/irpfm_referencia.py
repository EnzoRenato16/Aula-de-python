#!/usr/bin/env python3
"""
Implementação de REFERÊNCIA, independente do motor TypeScript.

Escrita direto a partir de docs/REGRAS.md (Lei 15.270/2025), só com a
biblioteca padrão do Python, para conferir o motor por "dupla implementação":
se as duas chegarem ao mesmo centavo em todos os clientes, é muito improvável
que ambas tenham o mesmo erro.

Cobre o modo padrão do motor (não conservador): estratégia INCREMENTAL_NET do
redutor, denominador IN_BASE, estimativas ligadas, Simples com retenção e
ganho isento em ações na base.

Uso (a partir de raiox-irpfm/):
    pnpm raiox calcular --entrada base.xlsx --saida ./resultado --sem-pdf
    python3 tools/conferencia/irpfm_referencia.py ./resultado
"""

import json
import sys
from decimal import ROUND_HALF_UP, Decimal, getcontext
from pathlib import Path

getcontext().prec = 40
ZERO = Decimal("0")
CENT = Decimal("0.01")


def r2(value: Decimal) -> Decimal:
    """Arredondamento único: centavos, meio para cima (R-ARR-01)."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


# Catálogo (docs/REGRAS.md, seção 5): tipo -> (entra na base?, regime, alíquota de estimativa)
INCLUIDO, EXCLUIDO, SUBTRAI = "incluido", "excluido", "subtrai"
CATALOGO = {
    "SALARIO": (INCLUIDO, "AJUSTE", None),
    "ALUGUEL": (INCLUIDO, "AJUSTE", None),
    "APOSENTADORIA": (INCLUIDO, "AJUSTE", None),
    "ATIVIDADE_RURAL": (INCLUIDO, "AJUSTE", None),
    "OUTROS_TRIBUTAVEIS": (INCLUIDO, "AJUSTE", None),
    "DECIMO_TERCEIRO": (INCLUIDO, "EXCLUSIVA", None),
    "PLR": (INCLUIDO, "EXCLUSIVA", None),
    "JCP": (INCLUIDO, "EXCLUSIVA", Decimal("0.175")),
    "RENDA_FIXA": (INCLUIDO, "EXCLUSIVA", Decimal("0.15")),
    "FUNDOS": (INCLUIDO, "EXCLUSIVA", Decimal("0.15")),
    "PREVIDENCIA": (INCLUIDO, "EXCLUSIVA", Decimal("0.10")),
    "FII_TRIBUTADO": (INCLUIDO, "EXCLUSIVA", Decimal("0.20")),
    "OUTROS_EXCLUSIVOS": (INCLUIDO, "EXCLUSIVA", None),
    "GANHO_BOLSA": (INCLUIDO, "DEFINITIVA", Decimal("0.15")),
    "EXTERIOR_14754": (INCLUIDO, "LEI_14754", Decimal("0.15")),
    "DIVIDENDOS": (INCLUIDO, "DIVIDENDO", None),
    "GANHO_BOLSA_ISENTO": (INCLUIDO, "ISENTO", None),
    "OUTROS_ISENTOS": (INCLUIDO, "ISENTO", None),
    "GANHO_CAPITAL": (EXCLUIDO, "DEFINITIVA", None),
    "RRA_EXCLUSIVO": (EXCLUIDO, "EXCLUSIVA", None),
    "REPASSE_CARTORIO": (SUBTRAI, "BASE_DEDUCTION", None),
}
for _codigo in [
    "DOACAO_HERANCA", "POUPANCA", "LH", "LCI", "CRI", "LIG", "LCD", "DEBENTURE_INCENTIVADA",
    "FUNDO_INFRA", "FIP_IE", "FII_ISENTO", "FIAGRO_ISENTO", "LCA", "CRA", "CDCA", "CDA_WA",
    "CPR", "RURAL_ISENTA", "INDENIZACAO", "MOLESTIA_GRAVE", "TVM_ISENTO_OUTROS",
]:
    CATALOGO[_codigo] = (EXCLUIDO, "ISENTO", None)

TRIBUTADOS = {"EXCLUSIVA", "DEFINITIVA", "LEI_14754"}
LIMIAR_IRPFM = Decimal("600000")
ALIQUOTA_CHEIA_A_PARTIR = Decimal("1200000")
LIMIAR_RETENCAO = Decimal("50000")
LIMITES_REDUTOR = {"GERAL": Decimal("0.34"), "FINANCEIRA": Decimal("0.40"), "BANCO": Decimal("0.45")}

# Tabela progressiva anual a partir do exercício 2027 (IN 1.500, Anexo VII, X)
TABELA_ANUAL = [
    (Decimal("29145.60"), Decimal("0"), Decimal("0")),
    (Decimal("33919.80"), Decimal("0.075"), Decimal("2185.92")),
    (Decimal("45012.60"), Decimal("0.15"), Decimal("4729.91")),
    (Decimal("55976.16"), Decimal("0.225"), Decimal("8105.85")),
    (None, Decimal("0.275"), Decimal("10904.66")),
]


def aliquota_irpfm(base: Decimal) -> Decimal:
    """Art. 16-A, §2º."""
    if base <= LIMIAR_IRPFM:
        return ZERO
    if base >= ALIQUOTA_CHEIA_A_PARTIR:
        return Decimal("0.10")
    return (base / Decimal("60000") - Decimal("10")) / Decimal("100")


def irpf_estimado(tributavel: Decimal) -> Decimal:
    """Estimativa do IRPF do ajuste: desconto simplificado + tabela 2026 + redução do art. 11-A."""
    if tributavel <= 0:
        return ZERO
    desconto = min(tributavel * Decimal("0.20"), Decimal("17640"))
    base = max(ZERO, tributavel - desconto)
    for teto, aliquota, parcela in TABELA_ANUAL:
        if teto is None or base <= teto:
            imposto = max(ZERO, base * aliquota - parcela)
            break
    if tributavel <= Decimal("60000"):
        reducao = min(imposto, Decimal("2694.15"))
    elif tributavel <= Decimal("88200"):
        reducao = min(imposto, max(ZERO, Decimal("8429.73") - Decimal("0.095575") * tributavel))
    else:
        reducao = ZERO
    return r2(imposto - reducao)


def calcular(cliente: dict) -> dict:
    linhas = cliente["incomes"]
    empresas = {p["code"]: p for p in cliente.get("payers", [])}

    total = incluido = repasses = ZERO
    tributavel_ajuste = ZERO
    ded = {"EXCLUSIVA": ZERO, "LEI_14754": ZERO, "DEFINITIVA": ZERO}
    div_por_empresa: dict[str, Decimal] = {}
    pares: dict[tuple[str, int], Decimal] = {}

    for linha in linhas:
        tipo = linha["type"]
        valor = Decimal(linha["amount"])
        tratamento, regime, estimativa = CATALOGO[tipo]
        transicao = tipo == "DIVIDENDOS" and linha.get("transition") is True
        na_base = tratamento == INCLUIDO and not transicao

        if tratamento == SUBTRAI:
            repasses += valor
            continue
        total += valor
        if na_base:
            incluido += valor
        if regime == "AJUSTE":
            tributavel_ajuste += valor
        if regime in TRIBUTADOS and na_base:
            informado = linha.get("taxWithheld")
            if informado is not None:
                ded[regime] += Decimal(informado)
            elif estimativa is not None:
                ded[regime] += r2(valor * estimativa)
        if tipo == "DIVIDENDOS" and not transicao:
            empresa = linha["payerCode"]
            div_por_empresa[empresa] = div_por_empresa.get(empresa, ZERO) + valor
            chave = (empresa, int(linha["month"]))
            pares[chave] = pares.get(chave, ZERO) + valor

    base = incluido - min(repasses, incluido)
    sujeito = total > LIMIAR_IRPFM
    aliquota = aliquota_irpfm(base) if sujeito else ZERO
    bruto = r2(aliquota * base)

    irpf = cliente.get("irpfAdjustmentDue")
    irpf = r2(Decimal(irpf)) if irpf is not None else irpf_estimado(tributavel_ajuste)
    deducoes = irpf + r2(ded["EXCLUSIVA"]) + r2(ded["LEI_14754"]) + r2(ded["DEFINITIVA"])

    # Redutor (art. 16-B), estratégia INCREMENTAL_NET
    redutor = ZERO
    dividendos = sum(div_por_empresa.values(), ZERO)
    if bruto > 0 and dividendos > 0:
        base_sem = max(ZERO, incluido - dividendos - min(repasses, incluido))
        devido_com = max(ZERO, bruto - deducoes)
        devido_sem = max(ZERO, r2(aliquota_irpfm(base_sem) * base_sem) - deducoes)
        aliq_irpfm = (devido_com - devido_sem) / dividendos
        for codigo, valor in div_por_empresa.items():
            empresa = empresas.get(codigo, {})
            aliq_pj = empresa.get("effectiveRate")
            if aliq_pj is None:
                continue
            limite = LIMITES_REDUTOR[empresa.get("limitCategory", "GERAL")]
            excesso = Decimal(aliq_pj) + aliq_irpfm - limite
            redutor += r2(valor * max(ZERO, excesso))

    devido = r2(max(ZERO, bruto - deducoes - redutor))
    retencao = sum(
        (r2(v * Decimal("0.10")) for v in pares.values() if v > LIMIAR_RETENCAO), ZERO
    )
    return {
        "base": r2(base),
        "grossMinimumTax": bruto,
        "reducer": r2(redutor),
        "minimumTaxDue": devido,
        "withholding": r2(retencao),
        "finalBalance": r2(devido - retencao),
    }


def main() -> int:
    pasta = Path(sys.argv[1] if len(sys.argv) > 1 else "resultado")
    entradas = json.loads((pasta / "entradas.json").read_text(encoding="utf-8"))
    resultados = json.loads((pasta / "resultados.json").read_text(encoding="utf-8"))
    if entradas.get("options", {}).get("conservative") or entradas.get("options", {}).get("choices"):
        print("A referência cobre só o modo padrão: rode a CLI sem opções de premissas.")
        return 2

    motor = {item["result"]["clientCode"]: item["result"] for item in resultados}
    divergencias = 0
    for cliente in entradas["clients"]:
        esperado = calcular(cliente)
        obtido = motor[cliente["clientCode"]]
        valores_motor = {
            "base": obtido["base"],
            "grossMinimumTax": obtido["grossMinimumTax"],
            "reducer": obtido["deductions"]["reducer"],
            "minimumTaxDue": obtido["minimumTaxDue"],
            "withholding": obtido["withholding"]["total"],
            "finalBalance": obtido["finalBalance"],
        }
        for campo, valor in esperado.items():
            if Decimal(valores_motor[campo]) != valor:
                divergencias += 1
                print(f"{cliente['clientCode']} {campo}: motor={valores_motor[campo]} referência={valor}")

    n = len(entradas["clients"])
    if divergencias:
        print(f"✗ {divergencias} divergência(s) em {n} clientes")
        return 1
    print(f"✓ {n} clientes conferidos: motor e referência independente batem ao centavo em 6 campos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
