import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),

  // NextAuth
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_WORKSPACE_DOMAIN: z.string().min(1),

  // Email
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email(),

  // Auth domain allowlist
  ALLOWED_EMAIL_DOMAIN: z.string().min(1),

  // Crypto keys — min 32 chars (256-bit hex or base64url)
  EMAIL_HASH_HMAC_KEY: z.string().min(32),
  IP_HMAC_KEY: z.string().min(32),
  OTP_HMAC_KEY: z.string().min(32),
  PENDING_TOKEN_SECRET: z.string().min(32),
  INVITE_TOKEN_HMAC_KEY: z.string().min(32),
  RESET_TOKEN_HMAC_KEY: z.string().min(32),

  // Hosts
  PARTICIPANT_HOST: z.string().min(1),
  ADMIN_HOST: z.string().min(1),
  PUBLIC_BASE_URL: z.string().url(),

  // Bootstrap (optional — only needed for seeding the first admin)
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),

  // Linear integration (optional — feedback tickets skipped if absent)
  LINEAR_API_KEY: z.string().min(1).optional(),
  LINEAR_TEAM_ID: z.string().min(1).optional(),

  // Observability (optional — Sentry is skipped if absent)
  SENTRY_DSN: z.string().url().optional(),
});

type Env = z.infer<typeof schema>;

// During `next build` on Railway, runtime variables are not injected into the
// build container. SKIP_ENV_VALIDATION=1 lets the build complete; validation
// still runs at server startup where all variables must be present.
function loadEnv(): Env {
  if (process.env.SKIP_ENV_VALIDATION) {
    return process.env as unknown as Env;
  }

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "❌  Invalid environment variables:\n",
      JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
    );
    throw new Error(
      "Invalid environment variables — copy .env.example to .env.local and fill in values.",
    );
  }
  return parsed.data;
}

export const env = loadEnv();
