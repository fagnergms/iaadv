import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/app/actions/auth";
import { SidebarNav } from "@/components/ui/SidebarNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const items = [
    { href: "/clientes", label: "Clientes" },
    { href: "/atendimentos", label: "Atendimentos" },
    ...(session.user.isAdmin
      ? [{ href: "/admin/advogados", label: "Advogados" }]
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col justify-between border-r border-slate bg-paper-raised px-4 py-6">
        <div className="flex flex-col gap-8">
          <div>
            <p className="font-serif text-lg font-semibold text-ink">
              Escritório
            </p>
            <p className="truncate text-xs text-ink-muted">
              {session.user.email}
            </p>
          </div>
          <SidebarNav items={items} />
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full rounded-md border border-slate px-3 py-2 text-left text-sm font-medium text-ink-muted transition-colors hover:bg-slate-soft hover:text-ink"
          >
            Sair
          </button>
        </form>
      </aside>
      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}
