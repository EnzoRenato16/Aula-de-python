"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Trash2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  cancelInvitationAction,
  changeRoleAction,
  inviteAction,
  removeMemberAction,
  setAdvisorCodeAction,
} from "@/app/(app)/equipe/actions";
import { Field, invalidProps } from "@/components/app/field";
import { Panel } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL, type OrgRole as Role } from "@/lib/roles";

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  advisorCode: string | null;
  isSelf: boolean;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: Role;
  advisorCode: string | null;
  expiresAt: string;
  link: string;
}

const inviteForm = z.object({
  email: z.email("E-mail inválido"),
  role: z.enum(["member", "admin"]),
  advisorCode: z.string().max(40, "Até 40 caracteres"),
});
type InviteForm = z.infer<typeof inviteForm>;

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Copiado" : "Copiar link"}
    </Button>
  );
}

function AdvisorCodeEditor({ member }: { member: MemberRow }) {
  const [value, setValue] = useState(member.advisorCode ?? "");
  const [pending, startTransition] = useTransition();
  const changed = value.trim().toUpperCase() !== (member.advisorCode ?? "");
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await setAdvisorCodeAction(member.id, value);
          if (result.ok) toast.success("Código de assessor salvo.");
          else toast.error(result.error);
        });
      }}
    >
      <Input
        aria-label={`Código de assessor de ${member.name}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="sem código"
        className="h-8 w-32 uppercase"
      />
      {changed ? (
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Salvar
        </Button>
      ) : null}
    </form>
  );
}

export function TeamManager({
  members,
  invitations,
  canChangeRoles,
}: {
  members: MemberRow[];
  invitations: InvitationRow[];
  canChangeRoles: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [lastLink, setLastLink] = useState<string | null>(null);
  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteForm),
    defaultValues: { email: "", role: "member", advisorCode: "" },
  });
  const errors = form.formState.errors;

  function invite(values: InviteForm) {
    startTransition(async () => {
      const result = await inviteAction(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLastLink(result.data.link);
      form.reset({ email: "", role: values.role, advisorCode: "" });
      toast.success("Convite criado. Envie o link para a pessoa.");
    });
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error ?? "Não foi possível concluir.");
    });
  }

  return (
    <div className="grid gap-6">
      <Panel
        title="Convidar"
        description="O assessor só vê os clientes com o código de assessor dele. Dono e admin veem todos."
      >
        <form
          onSubmit={form.handleSubmit(invite)}
          className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start"
          noValidate
        >
          <Field id="convite-email" label="E-mail" error={errors.email?.message}>
            <Input
              id="convite-email"
              type="email"
              autoComplete="off"
              {...invalidProps("convite-email", errors.email?.message)}
              {...form.register("email")}
            />
          </Field>
          <Field id="convite-papel" label="Papel">
            <NativeSelect id="convite-papel" {...form.register("role")}>
              <option value="member">Assessor</option>
              <option value="admin">Admin</option>
            </NativeSelect>
          </Field>
          <Field
            id="convite-codigo"
            label="Código de assessor"
            error={errors.advisorCode?.message}
            hint="O mesmo da coluna codigo_assessor"
          >
            <Input
              id="convite-codigo"
              autoComplete="off"
              className="uppercase"
              {...invalidProps("convite-codigo", errors.advisorCode?.message)}
              {...form.register("advisorCode")}
            />
          </Field>
          <Button type="submit" disabled={pending} className="sm:mt-6">
            <UserPlus className="size-4" /> Convidar
          </Button>
        </form>
        {lastLink ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{lastLink}</span>
            <CopyLink link={lastLink} />
          </div>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          O sistema não envia e-mail: copie o link e mande para a pessoa. O link só funciona para o
          e-mail convidado e vence na data mostrada em Convites pendentes.
        </p>
      </Panel>

      <Panel title="Membros" description={`${members.length} pessoa(s) com acesso ao escritório.`}>
        <ul className="divide-y">
          {members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">
                  {member.name}
                  {member.isSelf ? <span className="text-muted-foreground"> (você)</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">{member.email}</p>
              </div>
              {canChangeRoles && !member.isSelf ? (
                <NativeSelect
                  aria-label={`Papel de ${member.name}`}
                  value={member.role}
                  disabled={pending}
                  className="h-8 w-32"
                  onChange={(event) =>
                    run(() => changeRoleAction(member.id, event.target.value), "Papel atualizado.")
                  }
                >
                  {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <span className="w-32 text-sm">{ROLE_LABEL[member.role]}</span>
              )}
              {member.role === "member" ? (
                <AdvisorCodeEditor member={member} />
              ) : (
                <span className="w-32 text-xs text-muted-foreground">vê todos os clientes</span>
              )}
              {member.isSelf ? (
                <span className="size-9" />
              ) : (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={pending}
                  aria-label={`Remover ${member.name} do escritório`}
                  onClick={() => {
                    if (window.confirm(`Remover ${member.name} do escritório?`)) {
                      run(() => removeMemberAction(member.id), "Acesso removido.");
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {invitations.length > 0 ? (
        <Panel title="Convites pendentes">
          <ul className="divide-y">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm"
              >
                <div className="min-w-48 flex-1">
                  <p>{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABEL[invitation.role]}
                    {invitation.advisorCode ? ` · código ${invitation.advisorCode}` : ""} · vence em{" "}
                    {formatDate(invitation.expiresAt)}
                  </p>
                </div>
                <CopyLink link={invitation.link} />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(() => cancelInvitationAction(invitation.id), "Convite cancelado.")
                  }
                >
                  Cancelar
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
