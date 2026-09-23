import { Router } from "express";
import { getUserHandler } from "../controllers/user.controller.js";
import { authentication } from "../middleware/authentication.js";

export const userRoutes = Router();

userRoutes.use(authentication);
userRoutes.get("/:id", getUserHandler);
