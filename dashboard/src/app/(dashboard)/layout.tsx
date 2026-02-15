import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { Sidebar } from "@/components/sidebar";
import { BrandLogo } from "@/components/brand-logo";
import { UserMenu } from "@/components/user-menu";

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
        <BrandLogo
          size={32}
          animated
          wordmarkClassName="font-heading text-lg font-semibold text-ink"
        />
        <UserMenu email={user.email ?? ""} />
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
