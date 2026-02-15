import { NextResponse } from "next/server";
import { authenticateBff } from "@/lib/bff-auth";
import { verifyOrgDomain, NerveApiError } from "@/lib/nerve-api";

export async function POST(request: Request) {
  const session = await authenticateBff();
  if (session instanceof NextResponse) return session;

  let body: { domain_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const domainId = (body.domain_id || "").trim();
  if (!domainId) {
    return NextResponse.json({ error: "Missing domain_id" }, { status: 400 });
  }

  try {
    const result = await verifyOrgDomain(session.orgId, domainId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NerveApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

