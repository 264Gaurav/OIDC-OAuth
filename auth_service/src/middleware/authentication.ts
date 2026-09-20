import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { verifyAccessToken } from "../security/tokens.js";
import { AuthError } from "../auth/auth.service.js";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; roles: string[] };
    }
  }
}

export const authentication: RequestHandler = (request, _response, next) => {
  const value = request.header("authorization");
  if (!value?.startsWith("Bearer ")) {
    next(new AuthError(401, "Authentication required"));
    return;
  }
  const claims = verifyAccessToken(value.slice(7), env.ACCESS_TOKEN_SECRET);
  if (!claims) {
    next(new AuthError(401, "Invalid access token"));
    return;
  }
  request.auth = { userId: claims.sub, roles: claims.roles };
  next();
};