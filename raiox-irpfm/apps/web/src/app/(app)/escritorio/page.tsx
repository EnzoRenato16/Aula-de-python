import { DEFAULT_PRIMARY } from "@raiox/report";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { OfficeForm } from "@/components/settings/office-form";
import { formatDate } from "@/lib/format";
import { db } from "@/server/db";
import { getOffice } from "@/server/services/office";
import { getSettings } from "@/server/services/settings";
import { requireManagerContext } from "@/server/session";

export const metadata: Metadata = { title: "Escritório" };

export default async function OfficePage() {
  const ctx = await requireManagerContext();
  const [office, settings] = await Promise.all([
    getOffice(db(), ctx),
    getSettings(db(), ctx.orgId),
  ]);
  return (
    <>
      <PageHeader
        title="Escritório"
        description={`Ano-calendário simulado: ${settings.calendarYear}.${office.createdAt ? ` Conta criada em ${formatDate(office.createdAt)}.` : ""}`}
      />
      <div className="max-w-2xl">
        <Panel title="Identidade">
          <OfficeForm
            name={office.name}
            primaryColor={settings.primaryColor}
            defaultColor={DEFAULT_PRIMARY}
          />
        </Panel>
      </div>
    </>
  );
}
