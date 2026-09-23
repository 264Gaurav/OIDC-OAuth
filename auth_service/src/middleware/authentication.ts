import type { RequestHandler } from "express";
import { verifyAccessToken } from "../security/tokens.js";
import { AppError } from "../errors/app-error.js";
import type { AuthClaims } from "../policy/claims.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthClaims;
    }
  }
}

export const authentication: RequestHandler = async (request, _response, next) => {
  const value = request.header("authorization");
  if (!value?.startsWith("Bearer ")) {
    next(new AppError(401, "Authentication required"));
    return;
  }
  const claims = await verifyAccessToken(value.slice(7));
  if (!claims) {
    next(new AppError(401, "Invalid access token"));
    return;
  }
  request.auth = {
    sub: claims.sub,
    role: claims.role,
    scope: claims.scope,
    partner_id: claims.partner_id,
    customer_id: claims.customer_id
  };
  next();
};
