import { ACTIONS, type Action } from "./actions.js";
import type { ResourceAttrs } from "./attributes.js";
import type { AuthClaims } from "./claims.js";
import { isCustomerRole, isPartnerRole, ROLES } from "./roles.js";

function samePartner(subject: AuthClaims, resource: ResourceAttrs): boolean {
  return subject.partner_id !== null && resource.partnerId === subject.partner_id;
}

function sameCustomer(subject: AuthClaims, resource: ResourceAttrs): boolean {
  return subject.customer_id !== null && resource.customerId === subject.customer_id;
}

export function passesAbac(action: Action, subject: AuthClaims, resource: ResourceAttrs): boolean {
  if (subject.role === ROLES.SUPER_ADMIN) return true;

  switch (action) {
    case ACTIONS.PARTNER_CREATE:
      return false;
    case ACTIONS.CUSTOMER_GROUP_CREATE:
    case ACTIONS.MEMBER_INVITE_PARTNER_ADMIN:
    case ACTIONS.MEMBER_INVITE_PARTNER_USER:
      return isPartnerRole(subject.role) && samePartner(subject, resource);
    case ACTIONS.MEMBER_INVITE_CUSTOMER_ADMIN:
      return isPartnerRole(subject.role) && samePartner(subject, resource);
    case ACTIONS.MEMBER_INVITE_CUSTOMER_USER:
      if (subject.role === ROLES.CUSTOMER_ADMIN) return sameCustomer(subject, resource);
      return isPartnerRole(subject.role) && samePartner(subject, resource);
    case ACTIONS.RESOURCE_MANAGE:
    case ACTIONS.RESOURCE_READ:
      if (isCustomerRole(subject.role)) return sameCustomer(subject, resource);
      if (isPartnerRole(subject.role)) return samePartner(subject, resource);
      return false;
    default:
      return false;
  }
}
