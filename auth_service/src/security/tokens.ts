import { createHmac, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getSigningMaterial, SIGNING_KEY_ID } from "../oidc/signing-keys.js";

type AccessClaims = { sub: string; roles: string[]; iat: number; exp: number };

export async function createAccessToken(userId: string, roles: string[], ttlSeconds: number): Promise<string> {
  const { privateKey, issuer } = await getSigningMaterial();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ roles })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: SIGNING_KEY_ID })
    .setIssuer(issuer)
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(privateKey);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { publicKey, issuer } = await getSigningMaterial();
    const { payload } = await jwtVerify(token, publicKey, { issuer, algorithms: ["RS256"] });
    const roles = payload.roles;
    if (typeof payload.sub !== "string" || !Array.isArray(roles) || !roles.every((role) => typeof role === "string")) {
      return null;
    }
    return {
      sub: payload.sub,
      roles,
      iat: payload.iat ?? 0,
      exp: payload.exp ?? 0
    };
  } catch {
    return null;
  }
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return createHmac("sha256", token).digest("hex");
}

export async function createIdToken(
  userId: string,
  email: string,
  name: string,
  address: string,
  phone: string | null,
  roles: string[],
  issuer: string,
  audience: string,
  ttlSeconds: number
): Promise<string> {
  const { privateKey } = await getSigningMaterial();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email,
    name,
    address,
    ...(phone ? { phone } : {}),
    roles
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: SIGNING_KEY_ID })
    .setIssuer(issuer)
    .setSubject(userId)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(privateKey);
}
