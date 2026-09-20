import { exportJWK, generateKeyPair } from "jose";
import Provider from "oidc-provider";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { redis } from "../db/redis.js";
import { RedisAdapter } from "./adapter/redis.adapter.js";

type OidcAccount = {
  accountId: string;
  claims: (use: string, scope?: string) => Promise<Record<string, unknown>>;
};

async function developmentJwks(): Promise<{ keys: Record<string, unknown>[] }> {
  const { privateKey } = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
  const key = await exportJWK(privateKey);
  return { keys: [{ ...key, kid: "development", alg: "RS256", use: "sig" }] };
}

async function findAccount(_ctx: unknown, accountId: string): Promise<OidcAccount | undefined> {
  const user = await prisma.user.findUnique({ where: { id: accountId } });
  if (!user || user.status !== "ACTIVE") return undefined;
  return {
    accountId: user.id,
    claims: async (use, scope) => {
      const claims: Record<string, unknown> = { sub: user.id };
      if (use === "userinfo" || scope?.includes("profile")) claims.email = user.email;
      if (scope?.includes("email")) {
        claims.email = user.email;
        claims.email_verified = false;
      }
      return claims;
    }
  };
}

export async function createOidcProvider(): Promise<Provider> {
  const issuer = env.OIDC_ISSUER_URL ?? `${env.ISSUER_URL.replace(/\/$/, "")}/oidc`;
  const jwks = await developmentJwks();
  const provider = new Provider(issuer, {
    adapter: (model: string) => new RedisAdapter(model, redis),
    jwks,
    findAccount,
    clients: [{
      client_id: "local-web",
      client_secret: "local-web-secret",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      redirect_uris: ["http://localhost:3001/callback"],
      scope: "openid profile email offline_access"
    }],
    ttl: {
      AccessToken: env.ACCESS_TOKEN_TTL,
      IdToken: env.ID_TOKEN_TTL,
      AuthorizationCode: env.AUTHORIZATION_CODE_TTL,
      RefreshToken: env.REFRESH_TOKEN_TTL
    },
    features: {
      devInteractions: { enabled: env.NODE_ENV === "development" },
      revocation: { enabled: true },
      resourceIndicators: { enabled: true }
    }
  });
  return provider;
}