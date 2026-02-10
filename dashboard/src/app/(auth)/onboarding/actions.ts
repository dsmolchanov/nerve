"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createOrg } from "@/lib/nerve-api";
import { createProfile } from "@/lib/profile";

export async function onboardAction(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const orgName = (formData.get("orgName") as string)?.trim();
  if (!orgName) {
    return { error: "Organization name is required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  try {
    const { org_id } = await createOrg(orgName);
    await createProfile(user.id, user.email ?? orgName, org_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    return { error: message };
  }

  redirect("/");
}
