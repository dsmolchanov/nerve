import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = await getProfile();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold text-ink">Settings</h1>

      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
          Account
        </h2>
        <p className="mt-2 text-sm text-ink">{user?.email ?? "No email"}</p>
        {profile ? (
          <p className="mt-1 text-xs text-muted">Org ID: {profile.org_id}</p>
        ) : null}
      </div>
    </div>
  );
}
