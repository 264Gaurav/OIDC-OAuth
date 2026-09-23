import { Prisma, type Role } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { AppError } from "../errors/app-error.js";
import { hashPassword } from "../security/password.js";
import { normalizeEmail } from "../utils/email.js";
import { userRepository } from "../repositories/user.repository.js";
import { membershipRepository } from "../repositories/membership.repository.js";
import { partnerRepository } from "../repositories/partner.repository.js";
import { customerRepository } from "../repositories/customer.repository.js";
import { ACTIONS, authorize, inviteActionForRole, type AuthClaims, ROLES } from "../policy/index.js";
import { assertAuthorized, assertCanRead } from "../policy/assert.js";

type ProfileInput = {
  email: string;
  password?: string | undefined;
  name: string;
  address: string;
  phone?: string | undefined;
};

function publicUser(user: { id: string; email: string; name: string; address: string; phone: string | null; status: string }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    address: user.address,
    phone: user.phone,
    status: user.status
  };
}

async function findOrCreateUser(input: ProfileInput, tx: Parameters<typeof userRepository>[0]) {
  const users = userRepository(tx);
  const email = normalizeEmail(input.email);
  const existing = await users.findByEmail(email);
  if (existing) {
    if (existing.status === "DISABLED") throw new AppError(403, "This account is not active");
    return existing;
  }
  if (!input.password) throw new AppError(400, "Password is required for a new user");
  return users.createWithCredential({
    email,
    name: input.name.trim(),
    address: input.address.trim(),
    phone: input.phone?.trim() || null,
    status: "ACTIVE",
    passwordHash: await hashPassword(input.password)
  });
}

async function assignMembership(
  tx: Parameters<typeof membershipRepository>[0],
  input: { userId: string; role: Role; partnerId: string | null; customerId: string | null }
) {
  const memberships = membershipRepository(tx);
  const duplicate = await memberships.findDuplicate(input);
  if (duplicate) throw new AppError(409, "User already has this membership");
  try {
    return memberships.create(input);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "User already has this membership");
    }
    throw error;
  }
}

export async function createPartner(
  actor: AuthClaims,
  input: { name: string; admin: ProfileInput }
) {
  assertAuthorized(ACTIONS.PARTNER_CREATE, actor);
  return prisma.$transaction(async (tx) => {
    const admin = await findOrCreateUser(input.admin, tx);
    const partner = await partnerRepository(tx).create(input.name.trim(), admin.id);
    const membership = await assignMembership(tx, {
      userId: admin.id,
      role: ROLES.PARTNER_ADMIN,
      partnerId: partner.id,
      customerId: null
    });
    return {
      partner: { id: partner.id, name: partner.name },
      admin: publicUser(admin),
      membershipId: membership.id
    };
  });
}

export async function createCustomer(actor: AuthClaims, partnerId: string, name: string) {
  const partner = await partnerRepository().findById(partnerId);
  if (!partner) throw new AppError(404, "Partner not found");
  assertAuthorized(ACTIONS.CUSTOMER_GROUP_CREATE, actor, { partnerId: partner.id });
  const customer = await customerRepository().create(name.trim(), partner.id);
  return { id: customer.id, name: customer.name, partnerId: customer.partnerId };
}

export async function invitePartnerMember(
  actor: AuthClaims,
  partnerId: string,
  input: ProfileInput & { role: typeof ROLES.PARTNER_ADMIN | typeof ROLES.PARTNER_USER }
) {
  const partner = await partnerRepository().findById(partnerId);
  if (!partner) throw new AppError(404, "Partner not found");
  assertAuthorized(inviteActionForRole(input.role), actor, { partnerId: partner.id });
  return prisma.$transaction(async (tx) => {
    const user = await findOrCreateUser(input, tx);
    const membership = await assignMembership(tx, {
      userId: user.id,
      role: input.role,
      partnerId: partner.id,
      customerId: null
    });
    return { user: publicUser(user), membershipId: membership.id, role: membership.role };
  });
}

export async function inviteCustomerMember(
  actor: AuthClaims,
  customerId: string,
  input: ProfileInput & { role: typeof ROLES.CUSTOMER_ADMIN | typeof ROLES.CUSTOMER_USER }
) {
  const customer = await customerRepository().findById(customerId);
  if (!customer) throw new AppError(404, "Customer not found");
  assertAuthorized(inviteActionForRole(input.role), actor, {
    partnerId: customer.partnerId,
    customerId: customer.id
  });
  return prisma.$transaction(async (tx) => {
    const user = await findOrCreateUser(input, tx);
    const membership = await assignMembership(tx, {
      userId: user.id,
      role: input.role,
      partnerId: customer.partnerId,
      customerId: customer.id
    });
    return { user: publicUser(user), membershipId: membership.id, role: membership.role };
  });
}

export async function getPartner(actor: AuthClaims, partnerId: string) {
  const partner = await partnerRepository().findById(partnerId);
  if (!partner) throw new AppError(404, "Partner not found");
  assertCanRead(actor, { partnerId: partner.id });
  return { id: partner.id, name: partner.name };
}

export async function getCustomer(actor: AuthClaims, customerId: string) {
  const customer = await customerRepository().findById(customerId);
  if (!customer) throw new AppError(404, "Customer not found");
  assertCanRead(actor, { partnerId: customer.partnerId, customerId: customer.id });
  return { id: customer.id, name: customer.name, partnerId: customer.partnerId };
}

export async function getUser(actor: AuthClaims, userId: string) {
  const user = await userRepository().findByIdWithMemberships(userId);
  if (!user) throw new AppError(404, "User not found");
  const canViewSelf = actor.sub === user.id;
  const canViewTenant = user.memberships.some((membership) =>
    authorize({
      action: ACTIONS.RESOURCE_READ,
      subject: actor,
      resource: { partnerId: membership.partnerId, customerId: membership.customerId }
    })
  );
  if (actor.role !== ROLES.SUPER_ADMIN && !canViewSelf && !canViewTenant) {
    throw new AppError(403, "Insufficient permissions");
  }
  return {
    ...publicUser(user),
    memberships: user.memberships.map((membership) => ({
      id: membership.id,
      role: membership.role,
      partnerId: membership.partnerId,
      customerId: membership.customerId
    }))
  };
}
