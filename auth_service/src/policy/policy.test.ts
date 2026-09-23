import { ROLE_SCOPE, ROLES, type Role } from "./roles.js";
import { ACTIONS } from "./actions.js";
import { authorize } from "./evaluate.js";
import { buildAuthClaims, validateMembershipShape, type AuthClaims } from "./claims.js";
import { pickDefaultMembership } from "./membership-context.js";
import { test } from "node:test";
import assert from "node:assert/strict";

function claims(overrides: Partial<AuthClaims> & Pick<AuthClaims, "role">): AuthClaims {
  const role = overrides.role;
  return {
    sub: overrides.sub ?? "11111111-1111-4111-8111-111111111111",
    role,
    scope: overrides.scope ?? ROLE_SCOPE[role],
    partner_id: overrides.partner_id ?? (role === ROLES.SUPER_ADMIN ? null : "22222222-2222-4222-8222-222222222222"),
    customer_id:
      overrides.customer_id ??
      (role === ROLES.CUSTOMER_ADMIN || role === ROLES.CUSTOMER_USER
        ? "33333333-3333-4333-8333-333333333333"
        : null)
  };
}

test("validateMembershipShape enforces tenant fields per role", () => {
  assert.equal(
    validateMembershipShape({ userId: "u", role: ROLES.SUPER_ADMIN, partnerId: null, customerId: null }),
    true
  );
  assert.equal(
    validateMembershipShape({ userId: "u", role: ROLES.SUPER_ADMIN, partnerId: "p", customerId: null }),
    false
  );
  assert.equal(
    validateMembershipShape({ userId: "u", role: ROLES.PARTNER_ADMIN, partnerId: "p", customerId: null }),
    true
  );
  assert.equal(
    validateMembershipShape({ userId: "u", role: ROLES.CUSTOMER_USER, partnerId: "p", customerId: "c" }),
    true
  );
  assert.equal(
    validateMembershipShape({ userId: "u", role: ROLES.CUSTOMER_USER, partnerId: null, customerId: "c" }),
    false
  );
});

test("buildAuthClaims maps role to scope and tenant ids", () => {
  const built = buildAuthClaims({
    userId: "u1",
    role: ROLES.CUSTOMER_ADMIN,
    partnerId: "p1",
    customerId: "c1"
  });
  assert.deepEqual(built, {
    sub: "u1",
    role: ROLES.CUSTOMER_ADMIN,
    scope: "CUSTOMER",
    partner_id: "p1",
    customer_id: "c1"
  });
});

test("pickDefaultMembership prefers higher-privilege roles then honors hints", () => {
  const memberships = [
    { userId: "u", role: ROLES.CUSTOMER_USER as Role, partnerId: "p", customerId: "c2" },
    { userId: "u", role: ROLES.PARTNER_ADMIN as Role, partnerId: "p", customerId: null },
    { userId: "u", role: ROLES.CUSTOMER_ADMIN as Role, partnerId: "p", customerId: "c1" }
  ];
  assert.equal(pickDefaultMembership(memberships)?.role, ROLES.PARTNER_ADMIN);
  assert.equal(pickDefaultMembership(memberships, { customerId: "c1" })?.role, ROLES.CUSTOMER_ADMIN);
  assert.equal(pickDefaultMembership(memberships, {})?.role, ROLES.PARTNER_ADMIN);
});

test("RBAC+ABAC: partner admin can create customers only in own partner", () => {
  const partnerAdmin = claims({ role: ROLES.PARTNER_ADMIN });
  assert.equal(
    authorize({
      action: ACTIONS.CUSTOMER_GROUP_CREATE,
      subject: partnerAdmin,
      resource: { partnerId: partnerAdmin.partner_id }
    }),
    true
  );
  assert.equal(
    authorize({
      action: ACTIONS.CUSTOMER_GROUP_CREATE,
      subject: partnerAdmin,
      resource: { partnerId: "99999999-9999-4999-8999-999999999999" }
    }),
    false
  );
});

test("customer admin can invite customer users only in own group", () => {
  const admin = claims({ role: ROLES.CUSTOMER_ADMIN });
  assert.equal(
    authorize({
      action: ACTIONS.MEMBER_INVITE_CUSTOMER_USER,
      subject: admin,
      resource: { partnerId: admin.partner_id, customerId: admin.customer_id }
    }),
    true
  );
  assert.equal(
    authorize({
      action: ACTIONS.MEMBER_INVITE_CUSTOMER_ADMIN,
      subject: admin,
      resource: { partnerId: admin.partner_id, customerId: admin.customer_id }
    }),
    false
  );
  assert.equal(
    authorize({
      action: ACTIONS.CUSTOMER_GROUP_CREATE,
      subject: admin,
      resource: { partnerId: admin.partner_id }
    }),
    false
  );
});

test("customer user can read own group resources and cannot manage or invite", () => {
  const user = claims({ role: ROLES.CUSTOMER_USER });
  assert.equal(
    authorize({
      action: ACTIONS.RESOURCE_READ,
      subject: user,
      resource: { partnerId: user.partner_id, customerId: user.customer_id }
    }),
    true
  );
  assert.equal(
    authorize({
      action: ACTIONS.RESOURCE_MANAGE,
      subject: user,
      resource: { partnerId: user.partner_id, customerId: user.customer_id }
    }),
    false
  );
  assert.equal(
    authorize({
      action: ACTIONS.RESOURCE_READ,
      subject: user,
      resource: { partnerId: user.partner_id, customerId: "44444444-4444-4444-8444-444444444444" }
    }),
    false
  );
});

test("super admin bypasses tenant ABAC after RBAC allow", () => {
  const superAdmin = claims({ role: ROLES.SUPER_ADMIN, partner_id: null, customer_id: null });
  assert.equal(authorize({ action: ACTIONS.PARTNER_CREATE, subject: superAdmin }), true);
  assert.equal(
    authorize({
      action: ACTIONS.RESOURCE_MANAGE,
      subject: superAdmin,
      resource: { partnerId: "p", customerId: "c" }
    }),
    true
  );
});
