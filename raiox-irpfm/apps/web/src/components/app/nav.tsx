"use client";

import {
  Building2,
  FileSpreadsheet,
  LayoutList,
  type LucideIcon,
  Menu,
  Scale,
  ScrollText,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SignOutButton } from "./sign-out-button";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  managerOnly?: boolean;
}

const ITEMS: NavItem[] = [
  { href: "/painel", label: "Painel", icon: LayoutList },
  { href: "/importar", label: "Importar planilha", icon: FileSpreadsheet, managerOnly: true },
  { href: "/premissas", label: "Premissas", icon: Scale },
  { href: "/equipe", label: "Equipe", icon: Users, managerOnly: true },
  { href: "/auditoria", label: "Auditoria", icon: ScrollText, managerOnly: true },
  { href: "/escritorio", label: "Escritório", icon: Building2, managerOnly: true },
];

export interface NavUser {
  name: string;
  roleLabel: string;
  orgName: string;
  isManager: boolean;
  advisorCode: string | null;
}

function Links({ user, onNavigate }: { user: NavUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação principal" className="grid gap-0.5">
      {ITEMS.filter((item) => user.isManager || !item.managerOnly).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => onNavigate?.()}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-white/8 hover:text-white",
              active && "bg-white/12 font-medium text-white",
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBlock({ user }: { user: NavUser }) {
  return (
    <div className="space-y-3 border-t border-white/12 pt-4 text-sm">
      <div>
        <p className="font-medium text-white">{user.name}</p>
        <p className="text-xs text-sidebar-foreground/70">
          {user.roleLabel}
          {user.advisorCode ? ` · ${user.advisorCode}` : ""}
        </p>
      </div>
      <SignOutButton />
    </div>
  );
}

function Brand({ orgName }: { orgName: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.16em] text-sidebar-foreground/60">RAIO-X IRPFM</p>
      <p className="mt-0.5 truncate font-semibold text-white" title={orgName}>
        {orgName}
      </p>
    </div>
  );
}

export function Sidebar({ user }: { user: NavUser }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between bg-sidebar px-3 py-5 lg:flex">
      <div className="space-y-6">
        <div className="px-2.5">
          <Brand orgName={user.orgName} />
        </div>
        <Links user={user} />
      </div>
      <div className="px-2.5">
        <UserBlock user={user} />
      </div>
    </aside>
  );
}

export function MobileBar({ user }: { user: NavUser }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-3 lg:hidden">
      <Brand orgName={user.orgName} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 hover:text-white"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-72 border-none bg-sidebar p-4 text-sidebar-foreground"
        >
          <SheetHeader className="p-0 pb-4">
            <SheetTitle className="text-left text-white">{user.orgName}</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col justify-between pb-6">
            <Links user={user} onNavigate={() => setOpen(false)} />
            <UserBlock user={user} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
