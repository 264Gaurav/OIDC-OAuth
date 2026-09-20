import { createPublicKey } from "node:crypto";
import { exportJWK, exportSPKI, type JWK } from "jose";
import { z } from "zod";
import { getSigningMaterial, SIGNING_KEY_ID } from "../oidc/signing-keys.js";

export const rsaPublicJwkSchema = z.object({
  kty: z.literal("RSA"),
  n: z.string().min(1),
  e: z.string().min(1),
  alg: z.string().optional(),
  kid: z.string().optional(),
  use: z.string().optional()
});

export type RsaPublicJwkInput = z.infer<typeof rsaPublicJwkSchema>;

export function createPublicKeyPem(jwk: RsaPublicJwkInput): string {
  const publicKey = createPublicKey({
    key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
    format: "jwk"
  });
  return publicKey.export({ type: "spki", format: "pem" }).toString();
}

export type IssuerPublicKeyDocument = {
  issuer: string;
  jwksUrl: string;
  kid: string;
  alg: string;
  use: string;
  kty: string;
  publicKeyPem: string;
  jwk: Pick<JWK, "kty" | "n" | "e" | "kid" | "alg" | "use">;
};

export async function getIssuerPublicKeyDocument(): Promise<IssuerPublicKeyDocument> {
  const { publicKey, issuer, jwks } = await getSigningMaterial();
  const publicKeyPem = await exportSPKI(publicKey);
  const exported = await exportJWK(publicKey);
  const kid = typeof jwks.keys[0]?.kid === "string" ? jwks.keys[0].kid : SIGNING_KEY_ID;
  if (typeof exported.n !== "string" || typeof exported.e !== "string" || exported.kty !== "RSA") {
    throw new Error("Invalid signing public key");
  }
  return {
    issuer,
    jwksUrl: `${issuer.replace(/\/$/, "")}/jwks`,
    kid,
    alg: "RS256",
    use: "sig",
    kty: "RSA",
    publicKeyPem,
    jwk: { kty: "RSA", n: exported.n, e: exported.e, kid, alg: "RS256", use: "sig" }
  };
}

export function renderIssuerPublicKeyHtml(document: IssuerPublicKeyDocument): string {
  const escape = (value: string): string =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>OIDC signing public key</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5; max-width: 52rem; }
    pre { background: #f4f4f5; padding: 1rem; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
    dl { display: grid; grid-template-columns: 8rem 1fr; gap: 0.35rem 1rem; }
    dt { font-weight: 600; }
    h1 { font-size: 1.25rem; }
  </style>
</head>
<body>
  <h1>Current OIDC signing public key</h1>
  <dl>
    <dt>Issuer</dt><dd>${escape(document.issuer)}</dd>
    <dt>JWKS</dt><dd><a href="${escape(document.jwksUrl)}">${escape(document.jwksUrl)}</a></dd>
    <dt>Key ID</dt><dd>${escape(document.kid)}</dd>
    <dt>Algorithm</dt><dd>${escape(document.alg)}</dd>
  </dl>
  <h2>PEM (SPKI)</h2>
  <pre>${escape(document.publicKeyPem)}</pre>
  <h2>Public JWK</h2>
  <pre>${escape(JSON.stringify(document.jwk, null, 2))}</pre>
</body>
</html>`;
}
