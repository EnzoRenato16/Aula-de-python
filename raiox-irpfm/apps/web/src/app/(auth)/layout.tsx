import { DEFAULT_CALENDAR_YEAR, formatBRL, formatPercent, getRuleSet } from "@raiox/engine";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const rules = getRuleSet(DEFAULT_CALENDAR_YEAR);
  const rate = (value: Parameters<typeof formatPercent>[0]) => formatPercent(value, 0);
  const amount = (value: Parameters<typeof formatBRL>[0]) => formatBRL(value).replace(",00", "");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between bg-sidebar px-12 py-10 text-sidebar-foreground lg:flex">
        <div>
          <p className="font-semibold tracking-tight text-white">Raio-X IRPFM</p>
          <p className="mt-1 text-xs tracking-[0.18em] text-sidebar-foreground/70">
            LEI 15.270/2025 · ANO-CALENDÁRIO {rules.calendarYear}
          </p>
        </div>
        <div className="max-w-md space-y-5">
          <p className="text-2xl leading-snug font-medium text-white">
            Quem da sua base vai pagar tributação mínima, quem tem retenção a restituir e o que muda
            com outro calendário de dividendos.
          </p>
          <dl className="grid grid-cols-3 gap-4 border-t border-white/15 pt-5 text-sm">
            <div>
              <dt className="text-sidebar-foreground/70">Retenção</dt>
              <dd className="mt-1 font-medium text-white">
                {rate(rules.monthlyWithholding.rate)} acima de{" "}
                {amount(rules.monthlyWithholding.threshold)}/mês
              </dd>
            </div>
            <div>
              <dt className="text-sidebar-foreground/70">IRPFM</dt>
              <dd className="mt-1 font-medium text-white">
                até {rate(rules.minimumTax.maxRate)} acima de {amount(rules.minimumTax.threshold)}
                /ano
              </dd>
            </div>
            <div>
              <dt className="text-sidebar-foreground/70">Trilha</dt>
              <dd className="mt-1 font-medium text-white">cada número com o artigo da lei</dd>
            </div>
          </dl>
        </div>
        <p className="text-xs text-sidebar-foreground/60">
          Ferramenta de simulação para profissionais. Não é recomendação de investimento nem
          consultoria tributária.
        </p>
      </aside>
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
