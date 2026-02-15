import { NextResponse } from "next/server";
import { authenticateBff } from "@/lib/bff-auth";
import { createInbox, deleteInbox, listInboxes, NerveApiError } from "@/lib/nerve-api";

export async function GET() {
  const session = await authenticateBff();
  if (session instanceof NextResponse) return session;

  try {
    const result = await listInboxes(session.orgId);
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

  let body: { address?: string; domain_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = (body.address || "").trim();
  const domainId = (body.domain_id || "").trim();
  if (!address) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 });
  }

  try {
    const result = await createInbox(session.orgId, address, domainId);
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
  const inboxId = (url.searchParams.get("id") || "").trim();
  if (!inboxId) {
    return NextResponse.json({ error: "Missing inbox id" }, { status: 400 });
  }

  try {
    const result = await deleteInbox(session.orgId, inboxId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NerveApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

