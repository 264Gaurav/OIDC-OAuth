export const ACTIONS = {
  PARTNER_CREATE: "partner.create",
  CUSTOMER_GROUP_CREATE: "customer_group.create",
  MEMBER_INVITE_PARTNER_ADMIN: "member.invite.partner_admin",
  MEMBER_INVITE_PARTNER_USER: "member.invite.partner_user",
  MEMBER_INVITE_CUSTOMER_ADMIN: "member.invite.customer_admin",
  MEMBER_INVITE_CUSTOMER_USER: "member.invite.customer_user",
  RESOURCE_MANAGE: "resource.manage",
  RESOURCE_READ: "resource.read"
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

export function inviteActionForRole(role: "PARTNER_ADMIN" | "PARTNER_USER" | "CUSTOMER_ADMIN" | "CUSTOMER_USER"): Action {
  switch (role) {
    case "PARTNER_ADMIN":
      return ACTIONS.MEMBER_INVITE_PARTNER_ADMIN;
    case "PARTNER_USER":
      return ACTIONS.MEMBER_INVITE_PARTNER_USER;
    case "CUSTOMER_ADMIN":
      return ACTIONS.MEMBER_INVITE_CUSTOMER_ADMIN;
    case "CUSTOMER_USER":
      return ACTIONS.MEMBER_INVITE_CUSTOMER_USER;
  }
}
