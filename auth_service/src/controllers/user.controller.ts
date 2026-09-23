import type { Request, Response } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { parseUuidParam } from "../http/parse-body.js";
import { requireAuth } from "../http/require-auth.js";
import { getUser } from "../services/tenancy.service.js";

export const getUserHandler = asyncHandler(async (request: Request, response: Response) => {
  const id = parseUuidParam(request.params.id, "user id");
  response.status(200).json(await getUser(requireAuth(request), id));
});
