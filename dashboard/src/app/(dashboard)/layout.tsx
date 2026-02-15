import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { Sidebar } from "@/components/sidebar";
import { BrandLogo } from "@/components/brand-logo";

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
    <div className="flex min-h-screen flex-col bg-bg-0">
      <header className="flex items-center justify-between border-b border-line bg-card/80 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <BrandLogo
            size={32}
            animated
            wordmarkClassName="font-heading text-lg font-semibold text-ink"
          />
          <h2 className="font-heading text-lg font-semibold text-ink">
            Dashboard
          </h2>
        </div>
        <span className="text-sm text-muted">{user.email}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
