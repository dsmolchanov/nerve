import { NextResponse } from "next/server";
import { authenticateBff } from "@/lib/bff-auth";
import { createBillingPortal, NerveApiError } from "@/lib/nerve-api";

export async function POST() {
  const session = await authenticateBff();
  if (session instanceof NextResponse) return session;

  try {
    const result = await createBillingPortal(session.orgId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NerveApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
