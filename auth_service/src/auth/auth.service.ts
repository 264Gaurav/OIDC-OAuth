import { Prisma } from "@prisma/client";
import { createAccessToken, createIdToken, createRefreshToken, hashToken } from "../security/tokens.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { AppError, AuthError } from "../errors/app-error.js";
import { normalizeEmail } from "../utils/email.js";
import { userRepository } from "../repositories/user.repository.js";
import { membershipRepository } from "../repositories/membership.repository.js";
import { sessionRepository } from "../repositories/session.repository.js";
import {
  buildAuthClaims,
  pickDefaultMembership,
  ROLES,
  type AuthClaims,
  type ContextHint,
  type MembershipSnapshot
} from "../policy/index.js";
import type { DbClient } from "../repositories/types.js";

export { AppError, AuthError };

export type AuthResult = {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  claims: AuthClaims;
};

type Profile = { id: string; email: string; name: string; address: string; phone: string | null };

export type StoredMembership = MembershipSnapshot & { id: string };

function oidcIssuer(): string {
  return env.OIDC_ISSUER_URL ?? `${env.ISSUER_URL.replace(/\/$/, "")}/oidc`;
}

export function toStoredMembership(row: {
  id: string;
  userId: string;
  role: MembershipSnapshot["role"];
  partnerId: string | null;
  customerId: string | null;
}): StoredMembership {
  return {
    id: row.id,
    userId: row.userId,
    role: row.role,
    partnerId: row.partnerId,
    customerId: row.customerId
  };
}

async function issueTokens(user: Profile, membership: StoredMembership, db: DbClient = prisma): Promise<AuthResult> {
  const claims = buildAuthClaims(membership);
  const refreshToken = createRefreshToken();
  await sessionRepository(db).create({
    userId: user.id,
    membershipId: membership.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000)
  });
  return {
    accessToken: await createAccessToken(claims, env.ACCESS_TOKEN_TTL),
    idToken: await createIdToken(claims, user, oidcIssuer(), env.ID_TOKEN_AUDIENCE, env.ID_TOKEN_TTL),
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL,
    claims
  };
}

function selectMembership(memberships: StoredMembership[], hint?: ContextHint): StoredMembership {
  const selected = pickDefaultMembership(memberships, hint);
  const record = memberships.find(
    (item) =>
      selected &&
      item.role === selected.role &&
      item.partnerId === selected.partnerId &&
      item.customerId === selected.customerId
  );
  if (!record) throw new AppError(403, "No matching tenant membership");
  return record;
}

export async function register(
  email: string,
  password: string,
  name: string,
  address: string,
  phone?: string
): Promise<AuthResult> {
  const normalizedEmail = normalizeEmail(email);
  try {
    return await prisma.$transaction(async (tx) => {
      const users = userRepository(tx);
      const memberships = membershipRepository(tx);
      const existing = await users.findByEmail(normalizedEmail);
      if (existing) throw new AppError(409, "An account with this email already exists");
      if ((await memberships.countByRole(ROLES.SUPER_ADMIN)) > 0) {
        throw new AppError(403, "Registration is invite-only");
      }
      const user = await users.createWithCredential({
        email: normalizedEmail,
        name: name.trim(),
        address: address.trim(),
        phone: phone?.trim() || null,
        status: "ACTIVE",
        passwordHash: await hashPassword(password)
      });
      const membership = await memberships.create({
        userId: user.id,
        role: ROLES.SUPER_ADMIN,
        partnerId: null,
        customerId: null
      });
      return issueTokens(user, toStoredMembership(membership), tx);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "An account with this email already exists");
    }
    throw error;
  }
}

export async function login(email: string, password: string, hint?: ContextHint): Promise<AuthResult> {
  const user = await userRepository().findByEmailWithAuth(normalizeEmail(email));
  if (!user?.credential || !(await verifyPassword(user.credential.passwordHash, password))) {
    throw new AppError(401, "Invalid email or password");
  }
  if (user.status !== "ACTIVE") throw new AppError(403, "This account is not active");
  return issueTokens(user, selectMembership(user.memberships.map(toStoredMembership), hint));
}

export async function switchContext(userId: string, hint: ContextHint): Promise<AuthResult> {
  const user = await userRepository().findByIdWithMemberships(userId);
  if (!user || user.status !== "ACTIVE") throw new AppError(403, "This account is not active");
  return issueTokens(user, selectMembership(user.memberships.map(toStoredMembership), hint));
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  const session = await sessionRepository().findByTokenHash(hashToken(refreshToken));
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
    throw new AppError(401, "Invalid refresh token");
  }

  return prisma.$transaction(async (tx) => {
    await sessionRepository(tx).revoke(session.id);
    const memberships = (await membershipRepository(tx).listByUser(session.userId)).map(toStoredMembership);
    const persisted = session.membershipId
      ? memberships.find((item) => item.id === session.membershipId)
      : undefined;
    return issueTokens(session.user, persisted ?? selectMembership(memberships), tx);
  });
}

export async function logout(refreshToken: string): Promise<void> {
  await sessionRepository().revokeByTokenHash(hashToken(refreshToken));
}
