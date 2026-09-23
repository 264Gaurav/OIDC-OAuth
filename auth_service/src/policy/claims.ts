import { z } from "zod";
import { isCustomerRole, isPartnerRole, ROLE_SCOPE, ROLES, type Role } from "./roles.js";
import type { SubjectAttrs } from "./attributes.js";

const ROLE_ENUM = [
  ROLES.SUPER_ADMIN,
  ROLES.PARTNER_ADMIN,
  ROLES.PARTNER_USER,
  ROLES.CUSTOMER_ADMIN,
  ROLES.CUSTOMER_USER
] as const;

export const authClaimsSchema = z.object({
  sub: z.string().min(1),
  role: z.enum(ROLE_ENUM),
  scope: z.enum(["PLATFORM", "PARTNER", "CUSTOMER"]),
  partner_id: z.string().min(1).nullable(),
  customer_id: z.string().min(1).nullable()
});

export type AuthClaims = z.infer<typeof authClaimsSchema>;

export type MembershipSnapshot = {
  userId: string;
  role: Role;
  partnerId: string | null;
  customerId: string | null;
};

export function validateMembershipShape(membership: MembershipSnapshot): boolean {
  const { role, partnerId, customerId } = membership;
  if (role === ROLES.SUPER_ADMIN) return partnerId === null && customerId === null;
  if (isPartnerRole(role)) return partnerId !== null && customerId === null;
  if (isCustomerRole(role)) return partnerId !== null && customerId !== null;
  return false;
}

export function buildAuthClaims(membership: MembershipSnapshot): AuthClaims {
  if (!validateMembershipShape(membership)) {
    throw new Error("Membership does not match role tenancy rules");
  }
  return {
    sub: membership.userId,
    role: membership.role,
    scope: ROLE_SCOPE[membership.role],
    partner_id: membership.partnerId,
    customer_id: membership.customerId
  };
}

export function claimsToSubject(claims: AuthClaims): SubjectAttrs {
  return {
    userId: claims.sub,
    role: claims.role,
    scope: claims.scope,
    partnerId: claims.partner_id,
    customerId: claims.customer_id
  };
}
