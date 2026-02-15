import { NextResponse } from "next/server";
import { authenticateBff } from "@/lib/bff-auth";
import {
  getOrgRuntimeConfig,
  updateOrgRuntimeConfig,
  NerveApiError,
} from "@/lib/nerve-api";

export async function GET() {
  const session = await authenticateBff();
  if (session instanceof NextResponse) return session;

  try {
    const result = await getOrgRuntimeConfig(session.orgId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NerveApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await authenticateBff();
  if (session instanceof NextResponse) return session;

  let body: { mcp_endpoint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.mcp_endpoint !== "string") {
    return NextResponse.json(
      { error: "mcp_endpoint must be a string" },
      { status: 400 },
    );
  }

  try {
    const result = await updateOrgRuntimeConfig(session.orgId, body.mcp_endpoint);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NerveApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
