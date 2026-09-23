# Authentication & Token Claims

How identity, sessions, and JWT claims support multi-tenant authorization across the platform and microservices.

## Goals

- Users authenticate against the auth service (PostgreSQL + Prisma, Redis for session/rate-limit state).
- **Access tokens** carry authorization context for API calls.
- **ID tokens** (OIDC) carry identity (+ optional same tenancy claims for client UI).
- Downstream services authorize using **verified claims** + shared RBAC/ABAC policy (see [rbac-abac.md](./rbac-abac.md)).

## Identity model (planned)

- **User**: credentials, profile, status (`ACTIVE`, `DISABLED`, `PENDING`).
- **Partner** / **Customer**: structural tenants; customer always linked to one partner.
- **Membership**: user ↔ role ↔ tenant (`partnerId` and/or `customerId`).

Public self-registration should not create orphan platform users without an explicit product decision; prefer **invite-only** or admin-driven provisioning under a partner/customer.

## Active context (single role in token)

A user may hold **multiple** memberships (e.g. several customer groups). Each access token represents **one active context**:

- One `role`
- One `scope` level
- `partner_id` and/or `customer_id` as appropriate

Flow:

1. **Login** — resolve default membership (e.g. last used, or sole assignment).
2. **Switch context** (optional API) — e.g. `POST /api/auth/context` with `{ customerId }`; re-issue access (and optionally ID) token.
3. **Refresh** — re-load membership from DB; do not trust client for tenant ids except when switching context through a controlled endpoint.

## JWT claims (access token)

Standard OIDC/JWT fields plus tenancy:

| Claim          | Type            | Description |
|----------------|-----------------|-------------|
| `sub`          | string          | User id (canonical; same as userId) |
| `role`         | string          | `SUPER_ADMIN`, `PARTNER_ADMIN`, `PARTNER_USER`, `CUSTOMER_ADMIN`, `CUSTOMER_USER` |
| `scope`        | string          | `PLATFORM`, `PARTNER`, or `CUSTOMER` (coarse level for services) |
| `partner_id`   | string \| null  | Partner group id |
| `customer_id`  | string \| null  | Customer group id |

Also include: `iss`, `exp`, `iat`, and as needed `aud` / `azp`.

Optional:

- `authz_ver` — increment when memberships change, to detect stale tokens alongside short TTL.

Do **not** put passwords, refresh tokens, or reset tokens in JWTs. Do not log full tokens.

### Claim examples

**Partner Admin**

```json
{
  "sub": "user-uuid",
  "role": "PARTNER_ADMIN",
  "scope": "PARTNER",
  "partner_id": "partner-uuid",
  "customer_id": null
}
```

**Customer User**

```json
{
  "sub": "user-uuid",
  "role": "CUSTOMER_USER",
  "scope": "CUSTOMER",
  "partner_id": "partner-uuid",
  "customer_id": "customer-uuid"
}
```

**Super Admin**

```json
{
  "sub": "user-uuid",
  "role": "SUPER_ADMIN",
  "scope": "PLATFORM",
  "partner_id": null,
  "customer_id": null
}
```

## ID token

OIDC ID token includes identity claims (`email`, `name`, etc.). For tenant-aware UIs, mirror the same **`role`, `scope`, `partner_id`, `customer_id`** as the active session (or omit if the client only uses access token for API calls).

Build claims in **one place** in the auth service, e.g. `buildAuthClaims(activeMembership)`, used for both access and ID token issuance.

## Token issuance (auth service)

On login / refresh / context switch:

1. Load user + memberships from PostgreSQL.
2. Resolve active membership.
3. Build claims via shared policy/helpers (partner id for customer roles = customer’s parent partner).
4. Sign access token and ID token (RS256, JWKS for verifiers).

Current implementation note: tokens today only include `roles[]` without tenant ids—migration to the claim set above is required for microservice authorization.

## Microservice verification

1. Fetch JWKS from auth issuer (`.well-known/openid-configuration` / `jwks_uri`).
2. Validate signature, `iss`, `exp`, and audience if enforced.
3. Parse claims with shared schema.
4. Authorize with `authorize({ action, subject, resource })` from the policy package.

Microservices must read `partner_id`, `customer_id`, and `role` **only from the verified JWT**, not from request body or query parameters.

## Express middleware (auth service)

Replace flat `requireRole(...)` with policy-driven checks, e.g. `requireAction('resource.manage')`, passing resource tenant ids loaded from the database.

Authentication middleware sets `request.auth` from verified claims, for example:

```text
{ userId, role, scope, partnerId, customerId }
```

## Security practices

- Argon2id for passwords; short access token TTL; refresh token rotation (as implemented).
- Revoke refresh sessions on membership or role change.
- Rate limit login and reset flows (Redis).
- Centralized error handling; no stack traces or secrets in responses.

## Related endpoints (MVP direction)

Auth:

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- Context switch (planned): `POST /api/auth/context`

Provisioning (policy-enforced):

- `POST /api/partners/:id/customers` — Partner Admin
- `POST /api/customers/:id/members` — invite users with allowed roles

## Current gaps (implementation checklist)

- [ ] Membership table with FKs and role/tenant constraints
- [ ] Central policy module + tests
- [ ] Token claims: `role`, `scope`, `partner_id`, `customer_id`
- [ ] Active context selection on login / refresh
- [ ] Provisioning APIs guarded by policy
- [ ] OIDC `findAccount` / userinfo aligned with membership claims
- [ ] Shared claim schema for all microservices

See [rbac-abac.md](./rbac-abac.md) for provisioning and resource rules.
