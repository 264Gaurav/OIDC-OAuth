import type { Request, Response } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { parseBody, parseUuidParam } from "../http/parse-body.js";
import { requireAuth } from "../http/require-auth.js";
import { inviteCustomerMemberSchema } from "../http/schemas.js";
import { getCustomer, inviteCustomerMember } from "../services/tenancy.service.js";

export const getCustomerHandler = asyncHandler(async (request: Request, response: Response) => {
  const id = parseUuidParam(request.params.id, "customer id");
  response.status(200).json(await getCustomer(requireAuth(request), id));
});

export const inviteCustomerMemberHandler = asyncHandler(async (request: Request, response: Response) => {
  const customerId = parseUuidParam(request.params.id, "customer id");
  const body = parseBody(inviteCustomerMemberSchema, request.body);
  response.status(201).json(await inviteCustomerMember(requireAuth(request), customerId, body));
});
