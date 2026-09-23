import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";
import { authorize, type Action } from "../policy/index.js";
import type { ResourceAttrs } from "../policy/attributes.js";

export function requireAction(action: Action, resourceFrom?: (request: Parameters<RequestHandler>[0]) => ResourceAttrs): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      next(new AppError(401, "Authentication required"));
      return;
    }
    const resource = resourceFrom?.(request);
    if (!authorize({ action, subject: request.auth, ...(resource ? { resource } : {}) })) {
      next(new AppError(403, "Insufficient permissions"));
      return;
    }
    next();
  };
}
