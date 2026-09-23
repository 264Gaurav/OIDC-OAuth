import { Router } from "express";
import { getCustomerHandler, inviteCustomerMemberHandler } from "../controllers/customer.controller.js";
import { authentication } from "../middleware/authentication.js";

export const customerRoutes = Router();

customerRoutes.use(authentication);
customerRoutes.get("/:id", getCustomerHandler);
customerRoutes.post("/:id/members", inviteCustomerMemberHandler);
