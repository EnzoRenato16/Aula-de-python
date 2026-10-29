"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.push("/entrar");
        router.refresh();
      }}
      className="flex items-center gap-2 text-xs text-sidebar-foreground/70 transition-colors hover:text-white"
    >
      <LogOut className="size-3.5" aria-hidden />
      Sair
    </button>
  );
}
