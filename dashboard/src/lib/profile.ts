import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface Profile {
  id: string;
  org_id: string;
  display_name: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Reads the current user's profile from Supabase.
 * Returns null if the user has no profile (not yet onboarded).
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error && error.code === "PGRST116") return null; // row not found
  if (error) throw error;

  return data as Profile;
}

/**
 * Convenience helper that throws if the user is not onboarded.
 */
export async function requireOrgId(): Promise<string> {
  const profile = await getProfile();
  if (!profile) throw new Error("User not onboarded");
  return profile.org_id;
}

/**
 * Creates a profile record for a newly onboarded user.
 */
export async function createProfile(
  userId: string,
  displayName: string,
  orgId: string,
): Promise<Profile> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .insert({
      id: userId,
      org_id: orgId,
      display_name: displayName,
      onboarded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
}
