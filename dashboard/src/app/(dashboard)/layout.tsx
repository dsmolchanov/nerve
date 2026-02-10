import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-bg-0">
      {/* Sidebar placeholder */}
      <aside className="hidden w-60 shrink-0 border-r border-line bg-card lg:block">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <Image src="/logo-nerve.svg" alt="Nerve" width={32} height={32} />
          <span className="font-heading text-lg font-semibold text-ink">
            Nerve
          </span>
        </div>
        <nav className="p-4 text-sm text-muted">
          {/* Navigation items will go here */}
          <p className="px-2 py-1">Dashboard</p>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-card/80 px-6 py-3 backdrop-blur-sm">
          <h2 className="font-heading text-lg font-semibold text-ink">
            Dashboard
          </h2>
          <span className="text-sm text-muted">{user.email}</span>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
