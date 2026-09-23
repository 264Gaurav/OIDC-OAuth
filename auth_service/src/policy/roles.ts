export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  PARTNER_ADMIN: "PARTNER_ADMIN",
  PARTNER_USER: "PARTNER_USER",
  CUSTOMER_ADMIN: "CUSTOMER_ADMIN",
  CUSTOMER_USER: "CUSTOMER_USER"
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const SCOPE_LEVELS = {
  PLATFORM: "PLATFORM",
  PARTNER: "PARTNER",
  CUSTOMER: "CUSTOMER"
} as const;

export type ScopeLevel = (typeof SCOPE_LEVELS)[keyof typeof SCOPE_LEVELS];

export const ROLE_SCOPE: Record<Role, ScopeLevel> = {
  SUPER_ADMIN: SCOPE_LEVELS.PLATFORM,
  PARTNER_ADMIN: SCOPE_LEVELS.PARTNER,
  PARTNER_USER: SCOPE_LEVELS.PARTNER,
  CUSTOMER_ADMIN: SCOPE_LEVELS.CUSTOMER,
  CUSTOMER_USER: SCOPE_LEVELS.CUSTOMER
};

export const ROLE_PRIORITY: readonly Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.PARTNER_ADMIN,
  ROLES.PARTNER_USER,
  ROLES.CUSTOMER_ADMIN,
  ROLES.CUSTOMER_USER
];

const ROLE_VALUES = new Set<string>(Object.values(ROLES));

export function isRole(value: string): value is Role {
  return ROLE_VALUES.has(value);
}

export function isPartnerRole(role: Role): boolean {
  return role === ROLES.PARTNER_ADMIN || role === ROLES.PARTNER_USER;
}

export function isCustomerRole(role: Role): boolean {
  return role === ROLES.CUSTOMER_ADMIN || role === ROLES.CUSTOMER_USER;
}

export function membershipScopeKey(role: Role, partnerId: string | null, customerId: string | null): string {
  if (role === ROLES.SUPER_ADMIN) return SCOPE_LEVELS.PLATFORM;
  if (isPartnerRole(role) && partnerId) return `${SCOPE_LEVELS.PARTNER}:${partnerId}`;
  if (isCustomerRole(role) && customerId) return `${SCOPE_LEVELS.CUSTOMER}:${customerId}`;
  throw new Error("Invalid membership scope");
}
