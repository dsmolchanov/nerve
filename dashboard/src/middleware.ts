import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Browsers/extensions may submit POST /login directly; normalize to GET.
  if (request.method === "POST" && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.search = "";
    return NextResponse.redirect(url, { status: 303 });
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image  (image optimisation)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public folder assets
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|logo-nerve.svg|logo-nerve-mark.png|logo-nerve-loop.mp4|apple-touch-icon.png|icon-192.png|icon-512.png).*)",
  ],
};
