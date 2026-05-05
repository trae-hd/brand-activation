import { defineConfig } from "prisma/config";

// Replaces the deprecated `package.json#prisma` block (removed in Prisma 7).
// Note: Prisma CLI no longer auto-loads `.env` when this file is present.
// In Railway production all variables are platform-injected, so no loading is
// needed. For local Prisma CLI commands (`pnpm prisma migrate dev`, etc.),
// invoke them with env vars already in scope — e.g. via `pnpm dlx dotenv -e
// .env.local -- pnpm prisma <command>` — or rely on a shell that has them set.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
