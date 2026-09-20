import type { RequestHandler } from "express";
import { AuthError } from "../auth/auth.service.js";

export function requireRole(...roles: string[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth || !roles.some((role) => request.auth?.roles.includes(role))) {
      next(new AuthError(403, "Insufficient permissions"));
      return;
    }
    next();
  };
}