import { NextResponse } from "next/server";
import { authenticateBff } from "@/lib/bff-auth";
import { issueServiceToken, NerveApiError } from "@/lib/nerve-api";

export async function POST(request: Request) {
  const session = await authenticateBff();
  if (session instanceof NextResponse) return session;

  let body: { scopes?: string[]; ttl_seconds?: number; rotate?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.scopes || body.scopes.length === 0) {
    return NextResponse.json(
      { error: "At least one scope is required" },
      { status: 400 },
    );
  }

  try {
    const result = await issueServiceToken(
      session.orgId,
      body.scopes,
      body.ttl_seconds,
      body.rotate,
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NerveApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
