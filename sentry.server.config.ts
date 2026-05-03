import * as Sentry from "@sentry/nextjs";

// Only initialised if SENTRY_DSN is set (checked in instrumentation.ts before import).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  debug: false,
});
