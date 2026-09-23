import type { MembershipSnapshot } from "./claims.js";
import { ROLE_PRIORITY, type Role } from "./roles.js";

export type ContextHint = {
  role?: Role | undefined;
  partnerId?: string | undefined;
  customerId?: string | undefined;
};

export function pickDefaultMembership(
  memberships: readonly MembershipSnapshot[],
  hint?: ContextHint
): MembershipSnapshot | undefined {
  const hasHint = Boolean(hint?.role || hint?.partnerId || hint?.customerId);
  if (hasHint && hint) {
    return memberships.find((membership) => {
      if (hint.role && membership.role !== hint.role) return false;
      if (hint.partnerId && membership.partnerId !== hint.partnerId) return false;
      if (hint.customerId && membership.customerId !== hint.customerId) return false;
      return true;
    });
  }

  return [...memberships].sort(
    (left, right) => ROLE_PRIORITY.indexOf(left.role) - ROLE_PRIORITY.indexOf(right.role)
  )[0];
}
