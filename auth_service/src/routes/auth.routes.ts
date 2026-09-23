import { Router } from "express";
import {
  contextHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  registerHandler
} from "../controllers/auth.controller.js";
import { authentication } from "../middleware/authentication.js";

export const authRoutes = Router();

authRoutes.post("/register", registerHandler);
authRoutes.post("/login", loginHandler);
authRoutes.post("/refresh", refreshHandler);
authRoutes.post("/logout", logoutHandler);
authRoutes.post("/context", authentication, contextHandler);
