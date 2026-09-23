import type { AuthClaims } from "../policy/claims.js";
import { ACTIONS, type Action } from "../policy/actions.js";
import { authorize } from "../policy/evaluate.js";
import type { ResourceAttrs } from "../policy/attributes.js";
import { AppError } from "../errors/app-error.js";

export function assertAuthorized(action: Action, subject: AuthClaims, resource?: ResourceAttrs): void {
  if (!authorize({ action, subject, ...(resource ? { resource } : {}) })) {
    throw new AppError(403, "Insufficient permissions");
  }
}

export function assertCanRead(subject: AuthClaims, resource: ResourceAttrs): void {
  assertAuthorized(ACTIONS.RESOURCE_READ, subject, resource);
}

export function assertCanManage(subject: AuthClaims, resource: ResourceAttrs): void {
  assertAuthorized(ACTIONS.RESOURCE_MANAGE, subject, resource);
}
