import { NextResponse, type NextRequest } from "next/server";

// Per the Next.js 16 Proxy docs: proxy.ts is bundled separately from the rest
// of the app and "should not rely on shared modules or globals." We read
// process.env directly here instead of importing `@/lib/env` so the proxy
// bundle stays self-contained and can't fail to initialise on a side-effecty
// module load. Validation still runs at server startup via lib/env.ts.
export function proxy(req: NextRequest) {
  const adminHost = (process.env.ADMIN_HOST ?? "").toLowerCase();
  const participantHost = (process.env.PARTICIPANT_HOST ?? "").toLowerCase();
  const host = req.headers.get("host")?.toLowerCase() ?? "";
  const path = req.nextUrl.pathname;

  // Fail-safe: if hosts aren't configured, block all non-local traffic so a
  // misconfiguration can never accidentally expose admin pages on the
  // participant host (or vice versa).
  if (!adminHost || !participantHost) {
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
      return NextResponse.next();
    }
    return new NextResponse(null, { status: 503 });
  }

  // In local development all routes are reachable on localhost.
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return NextResponse.next();
  }

  // Health endpoint is reachable on any host.
  if (path === "/api/health") return NextResponse.next();

  // Participant-host root → serve the participant landing. We rewrite `/` to
  // `/welcome` (which lives in the participant route group) because Next.js
  // can't have two `page.tsx` files resolve to the same `/` path: the admin
  // route group already owns `/`. The URL bar still shows `/`.
  if (path === "/" && host === participantHost) {
    return NextResponse.rewrite(new URL("/welcome", req.url));
  }

  // NextAuth handler is reachable only on the admin host.
  if (path.startsWith("/api/auth/")) {
    return host === adminHost ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // tRPC handler is reachable only on the admin host.
  if (path.startsWith("/api/trpc/")) {
    return host === adminHost ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // Email preview is reachable only on the admin host.
  if (path.startsWith("/api/email-preview/")) {
    return host === adminHost ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // Participant Route Handlers are reachable only on the participant host.
  if (
    path === "/api/register" ||
    path === "/api/verify" ||
    path === "/api/resend-confirmation-email"
  ) {
    return host === participantHost ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // Admin pages: only on admin host.
  if (
    path === "/" ||
    path.startsWith("/activations/") ||
    path.startsWith("/dashboard/") ||
    path.startsWith("/admin/") ||
    path.startsWith("/auth/") ||
    path.startsWith("/settings") ||
    path.startsWith("/methodology") ||
    path.startsWith("/help") ||
    path.startsWith("/feedback")
  ) {
    return host === adminHost ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }

  // Everything else (participant pages: /:slug, /:slug/verify, etc.) is participant-host only.
  return host === participantHost ? NextResponse.next() : new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)"],
};
