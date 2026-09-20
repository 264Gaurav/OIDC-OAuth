import type { RequestHandler } from "express";
import { verifyAccessToken } from "../security/tokens.js";
import { AuthError } from "../auth/auth.service.js";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; roles: string[] };
    }
  }
}

export const authentication: RequestHandler = async (request, _response, next) => {
  const value = request.header("authorization");
  if (!value?.startsWith("Bearer ")) {
    next(new AuthError(401, "Authentication required"));
    return;
  }
  const claims = await verifyAccessToken(value.slice(7));
  if (!claims) {
    next(new AuthError(401, "Invalid access token"));
    return;
  }
  request.auth = { userId: claims.sub, roles: claims.roles };
  next();
};