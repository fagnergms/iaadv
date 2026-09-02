import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/app/actions/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <nav>
        <Link href="/clientes">Clientes</Link>
        {session.user.isAdmin && <Link href="/admin/advogados">Advogados</Link>}
        <form action={signOutAction}>
          <button type="submit">Sair</button>
        </form>
      </nav>
      <main>{children}</main>
    </div>
  );
}
