import { createAccessToken, createIdToken, createRefreshToken, hashToken } from "../security/tokens.js";
import { hashPassword, verifyPassword } from "../security/password.js";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";

export class AuthError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

type AuthResult = { accessToken: string; idToken: string; refreshToken: string; expiresIn: number };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function oidcIssuer(): string {
  return env.OIDC_ISSUER_URL ?? `${env.ISSUER_URL.replace(/\/$/, "")}/oidc`;
}

async function issueTokens(user: { id: string; email: string; name: string; address: string; phone: string | null }, roles: string[]): Promise<AuthResult> {
  const refreshToken = createRefreshToken();
  await prisma.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000)
    }
  });
  return {
    accessToken: await createAccessToken(user.id, roles, env.ACCESS_TOKEN_TTL),
    idToken: await createIdToken(user.id, user.email, user.name, user.address, user.phone, roles, oidcIssuer(), env.ID_TOKEN_AUDIENCE, env.ID_TOKEN_TTL),
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL
  };
}

export async function register(email: string, password: string, name: string, address: string, phone?: string): Promise<AuthResult> {
  const normalizedEmail = normalizeEmail(email);
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new AuthError(409, "An account with this email already exists");

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: name.trim(),
      address: address.trim(),
      phone: phone?.trim() || null,
      status: "ACTIVE",
      credential: { create: { passwordHash: await hashPassword(password) } }
    }
  });
  return issueTokens(user, []);
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    include: { credential: true, assignments: true }
  });
  if (!user?.credential || !(await verifyPassword(user.credential.passwordHash, password))) {
    throw new AuthError(401, "Invalid email or password");
  }
  if (user.status !== "ACTIVE") throw new AuthError(403, "This account is not active");
  return issueTokens(user, user.assignments.map((assignment) => assignment.role));
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: { include: { assignments: true } } }
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
    throw new AuthError(401, "Invalid refresh token");
  }
  return prisma.$transaction(async (transaction) => {
    await transaction.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const nextRefreshToken = createRefreshToken();
    await transaction.refreshSession.create({
      data: {
        userId: session.userId,
        tokenHash: hashToken(nextRefreshToken),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000)
      }
    });
    return {
      accessToken: await createAccessToken(session.userId, session.user.assignments.map((assignment) => assignment.role), env.ACCESS_TOKEN_TTL),
      idToken: await createIdToken(session.user.id, session.user.email, session.user.name, session.user.address, session.user.phone, session.user.assignments.map((assignment) => assignment.role), oidcIssuer(), env.ID_TOKEN_AUDIENCE, env.ID_TOKEN_TTL),
      refreshToken: nextRefreshToken,
      expiresIn: env.ACCESS_TOKEN_TTL
    };
  });
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}