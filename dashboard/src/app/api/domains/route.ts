import { NextResponse } from "next/server";
import { authenticateBff } from "@/lib/bff-auth";
import {
  createOrgDomain,
  deleteOrgDomain,
  listOrgDomains,
  NerveApiError,
} from "@/lib/nerve-api";

export async function GET() {
  const session = await authenticateBff();
  if (session instanceof NextResponse) return session;

  try {
    const result = await listOrgDomains(session.orgId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NerveApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await authenticateBff();
  if (session instanceof NextResponse) return session;

  let body: { domain?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const domain = (body.domain || "").trim();
  if (!domain) {
    return NextResponse.json({ error: "Domain is required" }, { status: 400 });
  }

  try {
    const result = await createOrgDomain(session.orgId, domain);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NerveApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await authenticateBff();
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const domainId = (url.searchParams.get("id") || "").trim();
  if (!domainId) {
    return NextResponse.json({ error: "Missing domain id" }, { status: 400 });
  }

  try {
    const result = await deleteOrgDomain(session.orgId, domainId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NerveApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

