import { createHmac, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getSigningMaterial, SIGNING_KEY_ID } from "../oidc/signing-keys.js";
import { authClaimsSchema, type AuthClaims } from "../policy/claims.js";

export type AccessClaims = AuthClaims & { iat: number; exp: number };

function tenancyPayload(claims: AuthClaims): AuthClaims {
  return {
    sub: claims.sub,
    role: claims.role,
    scope: claims.scope,
    partner_id: claims.partner_id,
    customer_id: claims.customer_id
  };
}

export async function createAccessToken(claims: AuthClaims, ttlSeconds: number): Promise<string> {
  const { privateKey, issuer } = await getSigningMaterial();
  const now = Math.floor(Date.now() / 1000);
  const payload = tenancyPayload(claims);
  return new SignJWT({
    role: payload.role,
    scope: payload.scope,
    partner_id: payload.partner_id,
    customer_id: payload.customer_id
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: SIGNING_KEY_ID })
    .setIssuer(issuer)
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(privateKey);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { publicKey, issuer } = await getSigningMaterial();
    const { payload } = await jwtVerify(token, publicKey, { issuer, algorithms: ["RS256"] });
    const parsed = authClaimsSchema.safeParse({
      sub: payload.sub,
      role: payload.role,
      scope: payload.scope,
      partner_id: payload.partner_id ?? null,
      customer_id: payload.customer_id ?? null
    });
    if (!parsed.success) return null;
    return {
      ...parsed.data,
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
  claims: AuthClaims,
  profile: { email: string; name: string; address: string; phone: string | null },
  issuer: string,
  audience: string,
  ttlSeconds: number
): Promise<string> {
  const { privateKey } = await getSigningMaterial();
  const now = Math.floor(Date.now() / 1000);
  const payload = tenancyPayload(claims);
  return new SignJWT({
    email: profile.email,
    name: profile.name,
    address: profile.address,
    ...(profile.phone ? { phone: profile.phone } : {}),
    role: payload.role,
    scope: payload.scope,
    partner_id: payload.partner_id,
    customer_id: payload.customer_id
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: SIGNING_KEY_ID })
    .setIssuer(issuer)
    .setSubject(payload.sub)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(privateKey);
}
