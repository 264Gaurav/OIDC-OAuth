import { Router } from "express";
import {
  createCustomerHandler,
  createPartnerHandler,
  getPartnerHandler,
  invitePartnerMemberHandler
} from "../controllers/partner.controller.js";
import { authentication } from "../middleware/authentication.js";

export const partnerRoutes = Router();

partnerRoutes.use(authentication);
partnerRoutes.post("/", createPartnerHandler);
partnerRoutes.get("/:id", getPartnerHandler);
partnerRoutes.post("/:id/customers", createCustomerHandler);
partnerRoutes.post("/:id/members", invitePartnerMemberHandler);
