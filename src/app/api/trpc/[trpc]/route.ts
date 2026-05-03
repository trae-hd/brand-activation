import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { appRouter } from "@/server/trpc/root";

const handler = async (req: Request) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => ({
      session: await getServerSession(authOptions),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0",
    }),
  });
};

export { handler as GET, handler as POST };
