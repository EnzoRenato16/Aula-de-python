"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteClientAction } from "@/app/(app)/clientes/[code]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Deletion asks for the client code to be typed: it removes data, results and scenarios. */
export function DeleteClientButton({ code }: { code: string }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteClientAction(code);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Cliente ${code} excluído.`);
      router.push("/painel");
    });
  }

  return (
    <Dialog onOpenChange={(open) => !open && setTyped("")}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-pay hover:text-pay">
          <Trash2 className="size-4" /> Excluir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir o cliente {code}?</DialogTitle>
          <DialogDescription>
            Apaga os rendimentos, as posições, os cenários salvos e os resultados deste cliente. Não
            dá para desfazer; o registro da exclusão fica na auditoria.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="confirmar-codigo" className="text-xs">
            Digite {code} para confirmar
          </Label>
          <Input
            id="confirmar-codigo"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={typed.trim().toUpperCase() !== code || pending}
            onClick={confirm}
          >
            {pending ? "Excluindo…" : "Excluir cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
