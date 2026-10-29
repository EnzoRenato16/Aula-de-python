import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ClientFormView } from "@/components/client/client-form";
import { db } from "@/server/db";
import { advisorCodes } from "@/server/services/calculation";
import { clientFormOptions } from "@/server/services/client-form";
import { requireManagerContext } from "@/server/session";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewClientPage() {
  const ctx = await requireManagerContext();
  const options = clientFormOptions(ctx.calendarYear);
  return (
    <>
      <PageHeader
        title="Novo cliente"
        description={`Cadastro manual para o ano-calendário ${ctx.calendarYear}. Para muitos clientes, use a importação da planilha.`}
      />
      <ClientFormView
        mode="create"
        defaultValues={{
          code: "",
          nickname: "",
          advisorCode: "",
          irpfAdjustmentDue: "",
          incomes: [
            {
              type: "SALARIO",
              amount: "",
              month: "",
              payerCode: "",
              taxWithheld: "",
              transition: false,
            },
          ],
          companies: [],
          positions: [],
        }}
        advisorCodes={await advisorCodes(db(), ctx)}
        {...options}
      />
    </>
  );
}
