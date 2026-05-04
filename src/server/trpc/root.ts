import { router } from "./init";
import { activationRouter } from "./routers/activation";
import { boothRouter } from "./routers/booth";
import { registrationRouter } from "./routers/registration";
import { auditRouter } from "./routers/audit";
import { userRouter } from "./routers/user";
import { authRouter } from "./routers/auth";
import { complianceRouter } from "./routers/compliance";
import { settingsRouter } from "./routers/settings";
import { feedbackRouter } from "./routers/feedback";

export const appRouter = router({
  activation: activationRouter,
  booth: boothRouter,
  registration: registrationRouter,
  audit: auditRouter,
  user: userRouter,
  auth: authRouter,
  compliance: complianceRouter,
  settings: settingsRouter,
  feedback: feedbackRouter,
});

export type AppRouter = typeof appRouter;
