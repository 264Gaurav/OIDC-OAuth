import { exportJWK, generateKeyPair, importJWK, type JWK } from "jose";
import { env } from "../config/env.js";

export const SIGNING_KEY_ID = "sig-1";

type SigningMaterial = {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  jwks: { keys: JWK[] };
  issuer: string;
};

let cache: Promise<SigningMaterial> | undefined;

function oidcIssuer(): string {
  return env.OIDC_ISSUER_URL ?? `${env.ISSUER_URL.replace(/\/$/, "")}/oidc`;
}

function publicJwkFromPrivate(jwk: JWK): JWK {
  const { d, p, q, dp, dq, qi, ...publicJwk } = jwk;
  return publicJwk;
}

async function loadSigningMaterial(): Promise<SigningMaterial> {
  const issuer = oidcIssuer();
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;
  let jwk: JWK;

  if (env.OIDC_SIGNING_PRIVATE_JWK) {
    jwk = JSON.parse(env.OIDC_SIGNING_PRIVATE_JWK) as JWK;
    jwk.kid ??= SIGNING_KEY_ID;
    jwk.alg = "RS256";
    jwk.use = "sig";
    privateKey = (await importJWK(jwk, "RS256")) as CryptoKey;
    publicKey = (await importJWK(publicJwkFromPrivate(jwk), "RS256")) as CryptoKey;
  } else {
    const pair = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
    jwk = await exportJWK(privateKey);
    jwk.kid = SIGNING_KEY_ID;
    jwk.alg = "RS256";
    jwk.use = "sig";
  }

  return {
    privateKey,
    publicKey,
    issuer,
    jwks: {
      keys: [{ ...jwk, kid: jwk.kid ?? SIGNING_KEY_ID, alg: "RS256", use: "sig" }]
    }
  };
}

export function getSigningMaterial(): Promise<SigningMaterial> {
  cache ??= loadSigningMaterial();
  return cache;
}
