import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { ClientFormView } from "@/components/client/client-form";
import type { ClientForm } from "@/lib/client-form";
import { NotFoundError } from "@/server/context";
import { db } from "@/server/db";
import { advisorCodes } from "@/server/services/calculation";
import { clientFormOptions, clientFormValues } from "@/server/services/client-form";
import { requireManagerContext } from "@/server/session";

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return { title: `Editar ${decodeURIComponent((await params).code)}` };
}

export default async function EditClientPage({ params }: Params) {
  const ctx = await requireManagerContext();
  const code = decodeURIComponent((await params).code);
  let values: ClientForm;
  try {
    values = await clientFormValues(db(), ctx, code);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  return (
    <>
      <PageHeader
        title={`Editar cliente ${code}`}
        description="Os rendimentos, as empresas e as posições salvos substituem os atuais deste cliente."
      />
      <ClientFormView
        mode="edit"
        defaultValues={values}
        advisorCodes={await advisorCodes(db(), ctx)}
        {...clientFormOptions(ctx.calendarYear)}
      />
    </>
  );
}
