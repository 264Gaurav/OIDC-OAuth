import type { Request, Response } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { parseBody, parseUuidParam } from "../http/parse-body.js";
import { requireAuth } from "../http/require-auth.js";
import { createCustomerSchema, createPartnerSchema, invitePartnerMemberSchema } from "../http/schemas.js";
import { createCustomer, createPartner, getPartner, invitePartnerMember } from "../services/tenancy.service.js";

export const createPartnerHandler = asyncHandler(async (request: Request, response: Response) => {
  const body = parseBody(createPartnerSchema, request.body);
  response.status(201).json(await createPartner(requireAuth(request), body));
});

export const getPartnerHandler = asyncHandler(async (request: Request, response: Response) => {
  const id = parseUuidParam(request.params.id, "partner id");
  response.status(200).json(await getPartner(requireAuth(request), id));
});

export const createCustomerHandler = asyncHandler(async (request: Request, response: Response) => {
  const partnerId = parseUuidParam(request.params.id, "partner id");
  const body = parseBody(createCustomerSchema, request.body);
  response.status(201).json(await createCustomer(requireAuth(request), partnerId, body.name));
});

export const invitePartnerMemberHandler = asyncHandler(async (request: Request, response: Response) => {
  const partnerId = parseUuidParam(request.params.id, "partner id");
  const body = parseBody(invitePartnerMemberSchema, request.body);
  response.status(201).json(await invitePartnerMember(requireAuth(request), partnerId, body));
});
