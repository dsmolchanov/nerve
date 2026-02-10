import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface BffSession {
  userId: string;
  email: string;
  orgId: string;
}

/**
 * Validates the Supabase session and resolves the org_id from the profiles table.
 * Returns { userId, email, orgId } on success, or a NextResponse error.
 */
export async function authenticateBff(): Promise<BffSession | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json(
      { error: "Profile not found. Complete onboarding first." },
      { status: 403 },
    );
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    orgId: profile.org_id,
  };
}
