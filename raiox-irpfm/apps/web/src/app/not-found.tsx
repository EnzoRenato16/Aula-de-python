import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-sm text-center">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Raio-X IRPFM
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço não existe ou você não tem acesso a ele. Clientes de outro assessor não
          aparecem para você.
        </p>
        <Button asChild className="mt-6">
          <Link href="/painel">Voltar ao painel</Link>
        </Button>
      </div>
    </main>
  );
}
