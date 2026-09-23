import type { Request, Response } from "express";
import { parseBody } from "../http/parse-body.js";
import { asyncHandler } from "../http/async-handler.js";
import { contextSchema, loginSchema, refreshSchema, registerSchema } from "../http/schemas.js";
import { login, logout, refresh, register, switchContext } from "../auth/auth.service.js";
import { AppError } from "../errors/app-error.js";
import { requireAuth } from "../http/require-auth.js";
import type { ContextHint } from "../policy/index.js";

function toHint(input: ContextHint): ContextHint | undefined {
  if (!input.role && !input.partnerId && !input.customerId) return undefined;
  const hint: ContextHint = {};
  if (input.role) hint.role = input.role;
  if (input.partnerId) hint.partnerId = input.partnerId;
  if (input.customerId) hint.customerId = input.customerId;
  return hint;
}

export const registerHandler = asyncHandler(async (request: Request, response: Response) => {
  const body = parseBody(registerSchema, request.body);
  response.status(201).json(await register(body.email, body.password, body.name, body.address, body.phone));
});

export const loginHandler = asyncHandler(async (request: Request, response: Response) => {
  const body = parseBody(loginSchema, request.body);
  response.status(200).json(await login(body.email, body.password, toHint(body)));
});

export const refreshHandler = asyncHandler(async (request: Request, response: Response) => {
  const body = parseBody(refreshSchema, request.body);
  response.status(200).json(await refresh(body.refreshToken));
});

export const logoutHandler = asyncHandler(async (request: Request, response: Response) => {
  const body = parseBody(refreshSchema, request.body);
  await logout(body.refreshToken);
  response.status(204).send();
});

export const contextHandler = asyncHandler(async (request: Request, response: Response) => {
  const actor = requireAuth(request);
  const body = parseBody(contextSchema, request.body);
  const hint = toHint(body);
  if (!hint) throw new AppError(400, "Invalid request body");
  response.status(200).json(await switchContext(actor.sub, hint));
});
