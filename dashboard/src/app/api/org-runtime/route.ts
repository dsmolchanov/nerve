import { NextResponse } from "next/server";
import { authenticateBff } from "@/lib/bff-auth";
import {
  getOrgRuntimeConfig,
  updateOrgRuntimeConfig,
  NerveApiError,
} from "@/lib/nerve-api";

const DEFAULT_MCP_ENDPOINT =
  process.env.NERVE_DEFAULT_MCP_ENDPOINT?.trim() ||
  "https://nerve-runtime.fly.dev/mcp";

export async function GET() {
  const session = await authenticateBff();
  if (session instanceof NextResponse) return session;

  try {
    const result = await getOrgRuntimeConfig(session.orgId);
    return NextResponse.json({
      ...result,
      default_mcp_endpoint: DEFAULT_MCP_ENDPOINT,
    });
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
    return NextResponse.json({
      ...result,
      default_mcp_endpoint: DEFAULT_MCP_ENDPOINT,
    });
  } catch (err) {
    if (err instanceof NerveApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
