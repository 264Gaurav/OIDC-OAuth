export { ACTIONS, inviteActionForRole, type Action } from "./actions.js";
export { authorize, type AuthorizeInput } from "./evaluate.js";
export {
  authClaimsSchema,
  buildAuthClaims,
  claimsToSubject,
  validateMembershipShape,
  type AuthClaims,
  type MembershipSnapshot
} from "./claims.js";
export { pickDefaultMembership, type ContextHint } from "./membership-context.js";
export {
  isCustomerRole,
  isPartnerRole,
  isRole,
  membershipScopeKey,
  ROLE_SCOPE,
  ROLES,
  SCOPE_LEVELS,
  type Role,
  type ScopeLevel
} from "./roles.js";
export type { ResourceAttrs, SubjectAttrs } from "./attributes.js";
