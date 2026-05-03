import { NextResponse, type NextRequest } from "next/server";

const ADMIN_HOST = "admin.mrqlive.co.uk";
const PARTICIPANT_HOST = "mrqlive.co.uk";

export function proxy(req: NextRequest) {
  const host = req.headers.get("host")?.toLowerCase() ?? "";
  const path = req.nextUrl.pathname;

  // In local development all routes are reachable on localhost.
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return NextResponse.next();
  }

  // Health endpoint is reachable on any host.
  if (path === "/api/health") return NextResponse.next();

  // NextAuth handler is reachable only on the admin host.
  if (path.startsWith("/api/auth/")) {
    return host === ADMIN_HOST ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // tRPC handler is reachable only on the admin host.
  if (path.startsWith("/api/trpc/")) {
    return host === ADMIN_HOST ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // Participant Route Handlers are reachable only on the participant host.
  if (path === "/api/register" || path === "/api/verify") {
    return host === PARTICIPANT_HOST ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // Admin pages: only on admin host.
  if (
    path === "/" ||
    path.startsWith("/activations/") ||
    path.startsWith("/dashboard/") ||
    path.startsWith("/admin/") ||
    path.startsWith("/auth/")
  ) {
    return host === ADMIN_HOST ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // Everything else (participant pages: /:slug, /:slug/verify, etc.) is participant-host only.
  return host === PARTICIPANT_HOST ? NextResponse.next() : new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)"],
};
