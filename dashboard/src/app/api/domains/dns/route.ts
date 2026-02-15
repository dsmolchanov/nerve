import { NextResponse } from "next/server";
import { authenticateBff } from "@/lib/bff-auth";
import { getOrgDomainDNS, NerveApiError } from "@/lib/nerve-api";

export async function GET(request: Request) {
  const session = await authenticateBff();
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const domainId = (url.searchParams.get("domain_id") || "").trim();
  if (!domainId) {
    return NextResponse.json({ error: "Missing domain_id" }, { status: 400 });
  }

  try {
    const result = await getOrgDomainDNS(session.orgId, domainId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NerveApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

