import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { Sidebar } from "@/components/sidebar";

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

  const profile = await getProfile();
  if (!profile) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen bg-bg-0">
      <Sidebar />

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
