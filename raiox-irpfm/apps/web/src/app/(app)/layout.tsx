import { MobileBar, type NavUser, Sidebar } from "@/components/app/nav";
import { isManager, ROLE_LABEL } from "@/server/context";
import { requireContext } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const user: NavUser = {
    name: ctx.userName,
    roleLabel: ROLE_LABEL[ctx.role],
    orgName: ctx.orgName,
    isManager: isManager(ctx),
    advisorCode: ctx.advisorCode,
  };
  return (
    <div className="flex min-h-dvh">
      <Sidebar user={user} />
      <div className="min-w-0 flex-1">
        <MobileBar user={user} />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
