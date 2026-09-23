import type { Request } from "express";
import { AppError } from "../errors/app-error.js";
import type { AuthClaims } from "../policy/claims.js";

export function requireAuth(request: Request): AuthClaims {
  if (!request.auth) throw new AppError(401, "Authentication required");
  return request.auth;
}
