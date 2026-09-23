import express from "express";
import helmet from "helmet";

import { healthRoutes } from "../routes/health.routes";
import { authRoutes } from "../routes/auth.routes";
import { partnerRoutes } from "../routes/partner.routes";
import { customerRoutes } from "../routes/customer.routes";
import { userRoutes } from "../routes/user.routes";
import { utilsRoutes } from "../routes/utils.routes";
import { errorHandler } from "../middleware/error-handler";
import { notFound } from "../middleware/not-found";
import { requestId } from "../middleware/request-id";
import { createOidcProvider } from "../oidc/provider.js";

export async function createApp() {
  const app = express();
  const oidcProvider = await createOidcProvider();

  app.disable("x-powered-by");

  app.use(helmet());
  app.use(requestId);

  app.use(express.json({ limit: "32kb" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));

  app.use("/health", healthRoutes);
  app.use("/oidc", oidcProvider.callback() as express.RequestHandler);
  app.use("/api/auth", authRoutes);
  app.use("/api/partners", partnerRoutes);
  app.use("/api/customers", customerRoutes);
  app.use("/api/users", userRoutes);
  app.use("/utils", utilsRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}