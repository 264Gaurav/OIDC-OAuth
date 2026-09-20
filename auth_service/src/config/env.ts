import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(3000),

  ISSUER_URL: z.url(),
  OIDC_ISSUER_URL: z.url().optional(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.url(),
  OIDC_SIGNING_PRIVATE_JWK: z.string().min(1).optional(),
  ID_TOKEN_AUDIENCE: z.string().min(1).default("auth-api"),

  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  ID_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  AUTHORIZATION_CODE_TTL: z.coerce.number().int().positive().default(300),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000)
});

export const env = envSchema.parse(process.env);