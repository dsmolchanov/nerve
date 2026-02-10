import { NextResponse } from "next/server";
import { authenticateBff } from "@/lib/bff-auth";
import { getCurrentSubscription, NerveApiError } from "@/lib/nerve-api";

export async function GET() {
  const session = await authenticateBff();
  if (session instanceof NextResponse) return session;

  try {
    const sub = await getCurrentSubscription(session.orgId);
    return NextResponse.json(sub);
  } catch (err) {
    if (err instanceof NerveApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
