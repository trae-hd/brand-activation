"use client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/trpc/root";

/**
 * Vanilla tRPC proxy client for pre-auth pages (sign-in, set-password,
 * forgot-password). No React Query — calls are direct async mutations.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
    }),
  ],
});
