import type { Action } from "./actions.js";
import type { ResourceAttrs } from "./attributes.js";
import type { AuthClaims } from "./claims.js";
import { passesAbac } from "./abac.rules.js";
import { roleAllowsAction } from "./rbac.matrix.js";

export type AuthorizeInput = {
  action: Action;
  subject: AuthClaims;
  resource?: ResourceAttrs;
};

export function authorize(input: AuthorizeInput): boolean {
  if (!roleAllowsAction(input.subject.role, input.action)) return false;
  return passesAbac(input.action, input.subject, input.resource ?? {});
}
