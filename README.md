# OIDC Auth Service

Node.js/TypeScript authentication and multi-tenant authorization service backed by PostgreSQL, Redis, Prisma ORM, Argon2id, and `oidc-provider`.

The service exposes two primary integration surfaces:

- **Direct Auth & Tenancy API** under `/api` for trusted backend, first-party web apps, and management workflows (`/api/auth`, `/api/partners`, `/api/customers`, `/api/users`).
- **OAuth 2.0 / OpenID Connect Provider** at `/oidc` for browser, SPA, native, and third-party OIDC-compatible clients.
- **Utility & Health Endpoints** at `/utils` (public key exports) and `/health` (liveness and readiness probes).
- **User & Group Management Guide:** See [userAndGroupManagement.md](userAndGroupManagement.md) for a comprehensive step-by-step walkthrough covering role hierarchies, partner organizations, customer groups, and membership provisioning.

## Prerequisites

- Docker Desktop with Compose.
- Node.js 24+ only when running commands from the host.
- Postman for API testing.

## Start With Docker Compose

From the repository root:

```powershell
docker compose up -d --build
```

Create or update the PostgreSQL tables:

```powershell
docker compose exec auth-service npx prisma db push --accept-data-loss
```

Check the containers:

```powershell
docker compose ps
```

Expected services:

```text
auth-service  http://localhost:3000
postgres      localhost:5432
redis         localhost:6379
```

Inside Compose, the application connects using service DNS names:

```text
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/auth_service
REDIS_URL=redis://redis:6379
```

Do not change those URLs to `localhost` inside the `auth-service` container. `localhost` would refer to the auth-service container itself.

## Verify The Service

```powershell
(Invoke-WebRequest -UseBasicParsing http://localhost:3000/health/live).StatusCode
(Invoke-WebRequest -UseBasicParsing http://localhost:3000/health/ready).StatusCode
(Invoke-WebRequest -UseBasicParsing http://localhost:3000/oidc/.well-known/openid-configuration).StatusCode
```

All three requests should return `200` when PostgreSQL and Redis are ready.

## Direct Auth API

All request bodies are JSON. Passwords must contain 12 to 128 characters.

> **Bootstrap Note:** The very first user who registers via `POST /api/auth/register` is automatically provisioned as `SUPER_ADMIN` with platform-level scope. Once a super admin exists, direct public registration is locked (`403 Registration is invite-only`). All subsequent users are added by admins through the partner or customer member APIs. For the complete onboarding flow, refer to the [User & Group Management Guide](userAndGroupManagement.md).

### Register

```http
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
	"email": "alice@example.com",
	"password": "CorrectHorseBattery12!",
	"name": "Alice Example",
	"address": "1 Example Street, Example City",
	"phone": "+1-555-0100"
}
```

Response `201`:

```json
{
	"accessToken": "<signed-access-token>",
	"idToken": "<identity-token>",
	"refreshToken": "<opaque-refresh-token>",
	"expiresIn": 900,
	"claims": {
		"sub": "<user-uuid>",
		"role": "SUPER_ADMIN",
		"scope": "PLATFORM",
		"partner_id": null,
		"customer_id": null
	}
}
```

### Login

You can provide optional context hints (`role`, `partnerId`, `customerId`) to select the active membership/tenant if the user belongs to multiple organizations:

```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
	"email": "alice@example.com",
	"password": "CorrectHorseBattery12!",
	"role": "PARTNER_ADMIN",
	"partnerId": "<partner-uuid>"
}
```

Response `200`:

```json
{
	"accessToken": "<signed-access-token>",
	"idToken": "<identity-token>",
	"refreshToken": "<opaque-refresh-token>",
	"expiresIn": 900,
	"claims": {
		"sub": "<user-uuid>",
		"role": "PARTNER_ADMIN",
		"scope": "PARTNER",
		"partner_id": "<partner-uuid>",
		"customer_id": null
	}
}
```

Login, refresh, and register return `accessToken`, `idToken`, and `claims`. Direct API access and ID tokens are RS256 JWTs signed with the same keys published at `/oidc/jwks`. The ID token contains standard OIDC claims (`iss`, `sub`, `aud`, `email`, `name`, `address`, `phone`, `role`, `scope`, `partner_id`, `customer_id`, `iat`, `exp`). Its audience is `auth-api` by default. Use `idToken` for client identity information; use `accessToken` for API authorization. Standard OIDC authorization-code clients should obtain tokens from `/oidc/token`.

### Refresh

Refresh tokens rotate. Replace the old refresh token with the returned one after every successful request.

```http
POST http://localhost:3000/api/auth/refresh
Content-Type: application/json

{
	"refreshToken": "<current-refresh-token>"
}
```

Response `200`: Returns updated `accessToken`, `idToken`, `refreshToken`, `expiresIn`, and `claims`.

### Logout

```http
POST http://localhost:3000/api/auth/logout
Content-Type: application/json

{
	"refreshToken": "<current-refresh-token>"
}
```

Response: `204 No Content`.

### Switch Context

Switch active tenant / role context for the current session without logging out:

```http
POST http://localhost:3000/api/auth/context
Authorization: Bearer <access-token>
Content-Type: application/json

{
	"role": "CUSTOMER_ADMIN",
	"customerId": "<customer-uuid>"
}
```

Response `200`: Returns new `accessToken`, `idToken`, `refreshToken`, `expiresIn`, and `claims` bound to the selected context.

### Calling A Protected Service

Send the access token in the standard bearer header:

```http
Authorization: Bearer <access-token>
```

Resource services should validate access tokens locally using the configured issuer, audience, algorithm, and the provider JWKS endpoint. The JWKS URL is:

```text
http://localhost:3000/oidc/jwks
```

Do not send refresh tokens to resource services.

## Utils API

### Get the current signing public key (PEM)

Returns the active OIDC signing public key for this running service (the same key material published at `/oidc/jwks`).

```http
GET http://localhost:3000/utils/createPublicKey
```

Open that URL in a browser to view a readable HTML page with issuer metadata, the PEM block, and the public JWK. API clients receive JSON (`Accept: application/json` or tools such as curl/Postman):

```json
{
	"issuer": "http://localhost:3000/oidc",
	"jwksUrl": "http://localhost:3000/oidc/jwks",
	"kid": "sig-1",
	"alg": "RS256",
	"use": "sig",
	"kty": "RSA",
	"publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
	"jwk": {
		"kty": "RSA",
		"n": "...",
		"e": "AQAB",
		"kid": "sig-1",
		"alg": "RS256",
		"use": "sig"
	}
}
```

The PEM string uses real line breaks in JSON (not escaped `\\n` text). No authentication is required.

### Create PEM public key from JWKS

Some runtimes and libraries expect an RSA public key in PEM (SPKI) form instead of JWK `n` and `e` values. Copy the public key entry from `GET /oidc/jwks` and POST it to this helper endpoint.

```http
POST http://localhost:3000/utils/createPublicKey
Content-Type: application/json

{
	"kty": "RSA",
	"n": "<modulus-from-jwks>",
	"e": "AQAB"
}
```

You may also include optional JWK metadata such as `alg`, `kid`, and `use` when copying from JWKS; they are accepted but not required for conversion.

Response `200`:

```json
{
	"publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
}
```

Required JSON fields are `kty` (must be `RSA`), `n`, and `e`. Invalid input returns `400`. No authentication is required; only public key material is accepted.

## OIDC API

The OIDC issuer is:

```text
http://localhost:3000/oidc
```

Discovery is available at:

```text
GET http://localhost:3000/oidc/.well-known/openid-configuration
```

Use the discovery response as the source of truth for endpoint URLs and supported capabilities. Important endpoints include:

| Purpose | Endpoint |
| --- | --- |
| Discovery | `/oidc/.well-known/openid-configuration` |
| Authorization | `/oidc/auth` |
| Token | `/oidc/token` |
| UserInfo | `/oidc/me` |
| JWKS | `/oidc/jwks` |
| Revocation | `/oidc/token/revocation` |
| Introspection | `/oidc/token/introspection` |
| End session | `/oidc/session/end` |

## API Reference

All request bodies are `application/json` unless noted. Required fields are marked *(required)*, optional with `?`.

> For a complete end-to-end walkthrough on user provisioning, organization hierarchy (Partners & Customer Groups), and permission matrices, refer to the [User & Group Management Guide](userAndGroupManagement.md).

---

### Auth Routes (`/api/auth`)

#### `POST /api/auth/register`

**Purpose:** Register a new user account. Returns access token, ID token, refresh token, and claims on success.

> **Bootstrap Behavior:** The very first user to register automatically receives the `SUPER_ADMIN` role with platform scope (`SCOPE_LEVELS.PLATFORM`). Once a super admin exists, direct public registration is locked (`403 Registration is invite-only`). All subsequent users must be added through partner or customer membership APIs.

**Request body:**
```json
{
  "email": "alice@example.com",
  "password": "CorrectHorseBattery12!",
  "name": "Alice Example",
  "address": "1 Example Street, Example City",
  "phone": "+1-555-0100"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | ✅ | Must be a valid email address |
| `password` | string | ✅ | 12–128 characters |
| `name` | string | ✅ | Display name (1–120 characters) |
| `address` | string | ✅ | Physical address (1–300 characters) |
| `phone` | string | ❌ | Optional phone number (max 30 characters) |

**Response `201`:**
```json
{
  "accessToken": "<signed-access-token>",
  "idToken": "<identity-token>",
  "refreshToken": "<opaque-refresh-token>",
  "expiresIn": 900,
  "claims": {
    "sub": "<user-uuid>",
    "role": "SUPER_ADMIN",
    "scope": "PLATFORM",
    "partner_id": null,
    "customer_id": null
  }
}
```

**Errors:** `400` invalid body, `403` registration is invite-only (super admin already exists), `409` email already registered.

---

#### `POST /api/auth/login`

**Purpose:** Authenticate an existing user with credentials and optional context hints. Returns access token, ID token, refresh token, and claims.

**Request body:**
```json
{
  "email": "alice@example.com",
  "password": "CorrectHorseBattery12!",
  "role": "PARTNER_ADMIN",
  "partnerId": "<partner-uuid>"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | ✅ | Registered email |
| `password` | string | ✅ | User password |
| `role` | string | ❌ | Optional context hint: `SUPER_ADMIN`, `PARTNER_ADMIN`, `PARTNER_USER`, `CUSTOMER_ADMIN`, or `CUSTOMER_USER` |
| `partnerId` | string (UUID) | ❌ | Optional context hint to bind token to a specific partner |
| `customerId` | string (UUID) | ❌ | Optional context hint to bind token to a specific customer group |

**Response `200`:**
```json
{
  "accessToken": "<signed-access-token>",
  "idToken": "<identity-token>",
  "refreshToken": "<opaque-refresh-token>",
  "expiresIn": 900,
  "claims": {
    "sub": "<user-uuid>",
    "role": "PARTNER_ADMIN",
    "scope": "PARTNER",
    "partner_id": "<partner-uuid>",
    "customer_id": null
  }
}
```

**Errors:** `400` invalid body, `401` wrong credentials, `403` account disabled or no matching membership for context hint.

---

#### `POST /api/auth/refresh`

**Purpose:** Rotate a refresh token. Returns a new access token, ID token, new refresh token, and claims. The previous refresh token is immediately invalidated.

**Request body:**
```json
{
  "refreshToken": "<current-refresh-token>"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `refreshToken` | string | ✅ | Current opaque refresh token |

**Response `200`:**
```json
{
  "accessToken": "<new-access-token>",
  "idToken": "<identity-token>",
  "refreshToken": "<new-refresh-token>",
  "expiresIn": 900,
  "claims": {
    "sub": "<user-uuid>",
    "role": "PARTNER_ADMIN",
    "scope": "PARTNER",
    "partner_id": "<partner-uuid>",
    "customer_id": null
  }
}
```

**Errors:** `400` missing field, `401` token invalid, expired, or already used.

---

#### `POST /api/auth/logout`

**Purpose:** Revoke a refresh token, ending the active session.

**Request body:**
```json
{
  "refreshToken": "<current-refresh-token>"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `refreshToken` | string | ✅ | Refresh token to revoke |

**Response:** `204 No Content`

**Errors:** `400` missing field.

---

#### `POST /api/auth/context`

**Purpose:** Switch active role / tenant context for the current session without logging out. Returns fresh access, ID, and refresh tokens bound to the requested context.

**Headers:**
```
Authorization: Bearer <access-token>
Content-Type: application/json
```

**Request body:**
```json
{
  "role": "CUSTOMER_ADMIN",
  "customerId": "<customer-uuid>"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `role` | string | ❌* | Target role: `SUPER_ADMIN`, `PARTNER_ADMIN`, `PARTNER_USER`, `CUSTOMER_ADMIN`, or `CUSTOMER_USER` |
| `partnerId` | string (UUID) | ❌* | Target partner ID |
| `customerId` | string (UUID) | ❌* | Target customer ID |

*\*At least one of `role`, `partnerId`, or `customerId` must be provided.*

**Response `200`:**
```json
{
  "accessToken": "<new-access-token>",
  "idToken": "<identity-token>",
  "refreshToken": "<new-refresh-token>",
  "expiresIn": 900,
  "claims": {
    "sub": "<user-uuid>",
    "role": "CUSTOMER_ADMIN",
    "scope": "CUSTOMER",
    "partner_id": "<partner-uuid>",
    "customer_id": "<customer-uuid>"
  }
}
```

**Errors:** `400` invalid body (missing required hint), `401` unauthenticated, `403` account disabled or user has no matching membership for the target context.

---

### Health Routes (`/health`)

#### `GET /health/live`

**Purpose:** Liveness probe. Confirms the Node process is running.

**Response `200`:**
```json
{ "status": "ok" }
```

---

#### `GET /health/ready`

**Purpose:** Readiness probe. Confirms PostgreSQL and Redis are reachable.

**Response `200`:**
```json
{ "status": "ready" }
```

**Response `503`:**
```json
{ "status": "not_ready" }
```

---

### Customer Routes (`/api/customers`)

> All customer routes require `Authorization: Bearer <access-token>`. For customer administration workflows and member provisioning guides, see the [User & Group Management Guide](userAndGroupManagement.md).

#### `GET /api/customers/:id`

**Purpose:** Retrieve details of a customer group by ID.

**Permissions:** Allowed for `SUPER_ADMIN`, `PARTNER_ADMIN` / `PARTNER_USER` of the parent partner, or `CUSTOMER_ADMIN` / `CUSTOMER_USER` of this customer group.

**Path params:** `id` — customer UUID

**Response `200`:**
```json
{
  "id": "<uuid>",
  "name": "Customer Corp",
  "partnerId": "<uuid>"
}
```

**Errors:** `401` unauthenticated, `403` insufficient permissions, `404` customer not found.

---

#### `POST /api/customers/:id/members`

**Purpose:** Add a user to a customer organization. If the user does not exist in the system, a new account is created. If the user already exists, they are assigned the specified role within this customer group. **No email notification is sent** — this is a direct database assignment.

**Permissions:**
- `CUSTOMER_ADMIN` role assignment: `SUPER_ADMIN` or `PARTNER_ADMIN` (of the parent partner).
- `CUSTOMER_USER` role assignment: `SUPER_ADMIN`, `PARTNER_ADMIN` (of parent partner), or `CUSTOMER_ADMIN` (of this customer group).

**Path params:** `id` — customer UUID

**Request body:**
```json
{
  "email": "newmember@example.com",
  "password": "SecurePassword12!",
  "name": "New Member",
  "address": "789 Member Lane",
  "phone": "+1-555-0300",
  "role": "CUSTOMER_USER"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | ✅ | Email of the user to add |
| `password` | string | ✅ / ❌ | **Required if the user is new** (12–128 chars). Omit if the user already exists. |
| `name` | string | ✅ | Display name (1–120 chars) |
| `address` | string | ✅ | Physical address (1–300 chars) |
| `phone` | string | ❌ | Optional phone number (max 30 chars) |
| `role` | string | ✅ | `"CUSTOMER_ADMIN"` or `"CUSTOMER_USER"` |

**Response `201`:**
```json
{
  "user": {
    "id": "<uuid>",
    "email": "newmember@example.com",
    "name": "New Member",
    "address": "789 Member Lane",
    "phone": "+1-555-0300",
    "status": "ACTIVE"
  },
  "membershipId": "<uuid>",
  "role": "CUSTOMER_USER"
}
```

**Errors:** `400` missing/invalid fields, `401` unauthenticated, `403` insufficient permissions, `404` customer not found, `409` user already has this membership.

---

### Partner Routes (`/api/partners`)

> All partner routes require `Authorization: Bearer <access-token>`. For partner provisioning and tenant management workflows, see the [User & Group Management Guide](userAndGroupManagement.md).

#### `POST /api/partners`

**Purpose:** Create a new partner organization and its initial partner admin user atomically.

**Permissions:** `SUPER_ADMIN` only.

**Request body:**
```json
{
  "name": "Acme Partner Inc.",
  "admin": {
    "email": "partneradmin@acme.com",
    "password": "PartnerSecure12!",
    "name": "Partner Admin",
    "address": "123 Partner Street",
    "phone": "+1-555-0199"
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✅ | Partner organization name (1–200 chars) |
| `admin.email` | string | ✅ | Email for the initial partner administrator |
| `admin.password` | string | ✅ | 12–128 characters (required for new user account) |
| `admin.name` | string | ✅ | Admin display name (1–120 chars) |
| `admin.address` | string | ✅ | Admin physical address (1–300 chars) |
| `admin.phone` | string | ❌ | Optional phone number |

**Response `201`:**
```json
{
  "partner": {
    "id": "<uuid>",
    "name": "Acme Partner Inc."
  },
  "admin": {
    "id": "<uuid>",
    "email": "partneradmin@acme.com",
    "name": "Partner Admin",
    "address": "123 Partner Street",
    "phone": "+1-555-0199",
    "status": "ACTIVE"
  },
  "membershipId": "<uuid>"
}
```

**Errors:** `400` invalid body, `401` unauthenticated, `403` insufficient permissions (non-super-admin), `409` user already has this membership.

---

#### `GET /api/partners/:id`

**Purpose:** Retrieve details of a partner organization by ID.

**Permissions:** Allowed for `SUPER_ADMIN`, or members within this partner / its customers.

**Path params:** `id` — partner UUID

**Response `200`:**
```json
{
  "id": "<uuid>",
  "name": "Acme Partner Inc."
}
```

**Errors:** `401` unauthenticated, `403` insufficient permissions, `404` partner not found.

---

#### `POST /api/partners/:id/customers`

**Purpose:** Create a new customer group that belongs to the given partner.

**Permissions:** `SUPER_ADMIN`, or `PARTNER_ADMIN` of this partner.

**Path params:** `id` — partner UUID

**Request body:**
```json
{
  "name": "Customer Corp"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✅ | Customer group name (1–200 chars) |

**Response `201`:**
```json
{
  "id": "<uuid>",
  "name": "Customer Corp",
  "partnerId": "<uuid>"
}
```

**Errors:** `400` invalid body, `401` unauthenticated, `403` insufficient permissions, `404` partner not found.

---

#### `POST /api/partners/:id/members`

**Purpose:** Add a user to a partner organization. If the user does not exist in the system, a new account is created. If the user already exists, they are assigned the specified role within this partner. **No email notification is sent** — this is a direct database assignment.

**Permissions:**
- `PARTNER_ADMIN` role assignment: `SUPER_ADMIN` only.
- `PARTNER_USER` role assignment: `SUPER_ADMIN` or `PARTNER_ADMIN` (of this partner).

**Path params:** `id` — partner UUID

**Request body:**
```json
{
  "email": "partnermember@example.com",
  "password": "PartnerUser12!",
  "name": "Partner Member",
  "address": "123 Partner Street",
  "phone": "+1-555-0299",
  "role": "PARTNER_USER"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | ✅ | Email of the user to add |
| `password` | string | ✅ / ❌ | **Required if the user is new** (12–128 chars). Omit if the user already exists. |
| `name` | string | ✅ | Display name (1–120 chars) |
| `address` | string | ✅ | Physical address (1–300 chars) |
| `phone` | string | ❌ | Optional phone number (max 30 chars) |
| `role` | string | ✅ | `"PARTNER_ADMIN"` (SUPER_ADMIN only) or `"PARTNER_USER"` |

**Response `201`:**
```json
{
  "user": {
    "id": "<uuid>",
    "email": "partnermember@example.com",
    "name": "Partner Member",
    "address": "123 Partner Street",
    "phone": "+1-555-0299",
    "status": "ACTIVE"
  },
  "membershipId": "<uuid>",
  "role": "PARTNER_USER"
}
```

**Errors:** `400` missing/invalid fields, `401` unauthenticated, `403` insufficient permissions, `404` partner not found, `409` user already has this membership.

---

### User Routes (`/api/users`)

> All user routes require `Authorization: Bearer <access-token>`.

#### `GET /api/users/:id`

**Purpose:** Retrieve a user's profile and membership records.

**Permissions:** Allowed for `SUPER_ADMIN`, the user themself (`actor.sub === id`), or users sharing membership in the same tenant.

**Path params:** `id` — user UUID

**Response `200`:**
```json
{
  "id": "<uuid>",
  "email": "alice@example.com",
  "name": "Alice Example",
  "address": "1 Example Street",
  "phone": "+1-555-0100",
  "status": "ACTIVE",
  "memberships": [
    {
      "id": "<uuid>",
      "role": "PARTNER_USER",
      "partnerId": "<uuid>",
      "customerId": null
    }
  ]
}
```

**Errors:** `401` unauthenticated, `403` insufficient permissions, `404` user not found.

---

### Utils Routes (`/utils`)

#### `GET /utils/createPublicKey`

**Purpose:** Return the active OIDC RS256 signing public key for this service instance. The same key material is published at `/oidc/jwks`. Useful for configuring resource servers to validate JWTs locally.

> No authentication required.

**Response `200` (JSON):**
```json
{
  "issuer": "http://localhost:3000/oidc",
  "jwksUrl": "http://localhost:3000/oidc/jwks",
  "kid": "sig-1",
  "alg": "RS256",
  "use": "sig",
  "kty": "RSA",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
  "jwk": {
    "kty": "RSA",
    "n": "...",
    "e": "AQAB",
    "kid": "sig-1",
    "alg": "RS256",
    "use": "sig"
  }
}
```

Opening this URL in a browser returns a human-readable HTML page.

---

#### `POST /utils/createPublicKey`

**Purpose:** Convert an RSA JWK public key to PEM (SPKI) format. Useful for runtimes or libraries that require PEM instead of raw JWK `n`/`e` values.

> No authentication required.

**Request body:**
```json
{
  "kty": "RSA",
  "n": "<base64url-modulus-from-jwks>",
  "e": "AQAB",
  "alg": "RS256",
  "kid": "sig-1",
  "use": "sig"
}
```

| Field | Type | Required |
|---|---|---|
| `kty` | string | ✅ Must be `"RSA"` |
| `n` | string | ✅ Base64url-encoded modulus |
| `e` | string | ✅ Base64url-encoded exponent |
| `alg` | string | ❌ |
| `kid` | string | ❌ |
| `use` | string | ❌ |

**Response `200`:**
```json
{
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
}
```

**Errors:** `400` missing or invalid fields.

---

The development client is:

```text
client_id: local-web
client_secret: local-web-secret
redirect_uri: http://localhost:3001/callback
```

The configured scopes are `openid profile email offline_access`. The client uses Authorization Code with refresh tokens. Public clients should use Authorization Code + PKCE and must not rely on a client secret.

### OIDC Authorization Code Flow

1. Generate a cryptographically random `state`, `nonce`, and PKCE `code_verifier`.
2. Derive `code_challenge` using SHA-256 and base64url encoding.
3. Redirect the user to the authorization endpoint:

```text
http://localhost:3000/oidc/auth?client_id=local-web&redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fcallback&response_type=code&scope=openid%20profile%20email%20offline_access&state=<state>&nonce=<nonce>&code_challenge=<challenge>&code_challenge_method=S256
```

4. In development, `oidc-provider` displays its development interaction screen. Authenticate with an existing account from the direct register API.
5. Verify the returned `state`, then exchange the code at `/oidc/token`:

```http
POST http://localhost:3000/oidc/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&client_id=local-web&client_secret=local-web-secret&redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fcallback&code=<authorization-code>&code_verifier=<code-verifier>
```

6. Validate the ID token using the issuer and JWKS. Use the access token for UserInfo or the intended resource API. Never use an ID token as an API access token.
7. Refresh through `/oidc/token` with `grant_type=refresh_token`; store the newly returned refresh token.

The development interaction UI is not suitable for production. Production must provide an application-owned login/consent interaction, persistent signing keys, registered clients, HTTPS, and secure secrets.

## Postman

Import [postman/oidc-auth.postman_collection.json](postman/oidc-auth.postman_collection.json) into Postman.

The collection is organized into modular folders covering all API surfaces:

- **Health:** Process liveness and database/Redis readiness probes (`/health/live`, `/health/ready`).
- **Auth API:** Direct registration (bootstrap Super Admin), credential logins with role/tenant context hints, token refresh rotation, session context switching, and logout (`/api/auth/*`).
- **Partners:** Creating partner organizations, retrieving details, provisioning customer groups, and assigning partner members (`/api/partners/*`).
- **Customers:** Retrieving customer details, adding customer admins, and adding customer users (`/api/customers/*`).
- **Users:** Querying user profiles and active membership records (`/api/users/:id`).
- **Utils:** Fetching active OIDC signing public key in JSON or converting JWK parameters to PEM format (`/utils/createPublicKey`).
- **OIDC:** Discovery (`/.well-known/openid-configuration`), JWKS export (`/jwks`), PKCE authorization code generator (`/auth`), token exchange (`/token`), and UserInfo (`/me`).

### Automated Variable Capture
The collection automatically captures and propagates variables across requests:
- `accessToken`, `idToken`, and `refreshToken` are updated on Register, Login, Refresh, and Context Switch.
- `userId` is extracted from claims upon registration or login.
- `partnerId` is captured when creating a partner.
- `customerId` is captured when creating a customer group.
- `targetUserId` is captured when provisioning members.

### Quick Start: Basic Auth Lifecycle
1. `Health / Live` & `Health / Ready`
2. `Auth API / Register (Bootstrap Super Admin)`
3. `Auth API / Login (Super Admin)`
4. `Auth API / Refresh Token`
5. `Auth API / Logout`

### End-to-End Multi-Tenant Hierarchy Flow
For a complete step-by-step walkthrough detailing how to provision partners, customer groups, and assign roles across the tenant hierarchy in Postman, refer to the [User & Group Management Guide](userAndGroupManagement.md).

Recommended execution sequence:
1. **Bootstrap Super Admin:** `Auth API / Register (Bootstrap Super Admin)`
2. **Create Partner Organization & Admin:** `Partners / Create Partner + Admin` (automatically captures `partnerId`)
3. **Log In as Partner Admin:** `Auth API / Login (Partner Admin)` (binds session to the partner)
4. **Create Customer Group:** `Partners / Create Customer Group under Partner` (automatically captures `customerId`)
5. **Add Customer Admin:** `Customers / Add Customer Admin Member`
6. **Log In as Customer Admin:** `Auth API / Login (Customer Admin)` (binds session to the customer group)
7. **Add Customer User:** `Customers / Add Customer User Member`
8. **Inspect Profiles:** `Users / Get User Profile (Self)` or `Users / Get User Profile (Target Member)`
9. **Switch Active Context:** `Auth API / Switch Context` (e.g. switch between roles or organizations)

## Running Without Docker

Copy `.env.example` to `.env`, change the database and Redis URLs to host-accessible addresses, then run:

```powershell
npm install
npm run prisma:generate
npx prisma db push
npm run dev
```

For a host process, use `postgresql://postgres:postgres@localhost:5432/auth_service` and `redis://localhost:6379`.

## Prisma & PostgreSQL management

Schema and migrations live under `auth_service/prisma/` (`schema.prisma`, `migrations/`). Prisma reads `DATABASE_URL` from `.env` (via `prisma.config.ts` at the repository root). Run all commands below from the **repository root** unless noted.

### When to use which command

| Goal | Command | Notes |
| --- | --- | --- |
| Regenerate the TypeScript client after schema changes | `npm run prisma:generate` | Run after every schema edit before starting or building the app |
| Create and apply a versioned migration (recommended for shared/staging/production) | `npm run prisma:migrate` | Interactive `migrate dev`; prompts for a migration name |
| Apply schema quickly without a migration file (local prototyping only) | `npx prisma db push` | Can alter or drop columns; use `--accept-data-loss` only when you accept data loss |
| Apply pending migrations in CI/staging/production | `npx prisma migrate deploy` | Does not create new migrations; applies existing SQL under `migrations/` |
| Inspect migration state | `npx prisma migrate status` | Shows applied vs pending migrations |
| Open a database GUI | `npx prisma studio` | Browse/edit rows in development |
| Validate `schema.prisma` syntax | `npx prisma validate` | Fast check without touching the database |

Use **migrations** when the schema change should be reviewed, committed, and replayed on other machines. Use **`db push`** only for throwaway local experiments—not for production deploys.

### Standard workflow after you change `schema.prisma`

1. Edit `auth_service/prisma/schema.prisma`.
2. Regenerate the client:

```powershell
npm run prisma:generate
```

3. Create and apply a migration (preferred):

```powershell
npm run prisma:migrate
```

When prompted, enter a short migration name (for example `add_user_phone`). Prisma writes SQL to `auth_service/prisma/migrations/` and updates PostgreSQL.

4. Restart the app (`npm run dev` or rebuild/restart Docker) so runtime code picks up the new client.

If you intentionally skip migration files during early local work:

```powershell
npx prisma db push
npm run prisma:generate
```

Review Prisma’s diff output before confirming destructive changes.

### First-time database setup

**Host (PostgreSQL on `localhost:5432`, `.env` with host URLs):**

```powershell
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

If no migrations exist yet, `prisma migrate dev` creates the initial migration from the current schema.

**Docker Compose (PostgreSQL in the `postgres` service):**

1. Start the stack: `docker compose up -d --build`
2. Apply schema from inside the auth container (uses in-network `DATABASE_URL`):

```powershell
docker compose exec auth-service npx prisma migrate deploy
```

For a fresh dev database without committed migrations yet, or to sync schema quickly:

```powershell
docker compose exec auth-service npx prisma db push
docker compose exec auth-service npx prisma generate
```

From the **host** against the published Postgres port:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/auth_service"
npm run prisma:migrate
```

### Production and staging deploys

1. Build or deploy application code that includes `auth_service/prisma/migrations/`.
2. With `DATABASE_URL` set for the target environment, apply migrations:

```powershell
npx prisma migrate deploy
```

3. Run `npm run prisma:generate` in the image/build step so `@prisma/client` matches the schema (the Dockerfile/build pipeline should already do this before `npm run build`).

Do not use `migrate dev` or `db push` against production databases.

### Reset, troubleshoot, and recovery

**Development only — wipe data and reapply migrations:**

```powershell
npx prisma migrate reset
```

This drops data, reapplies all migrations, and runs seed scripts if configured (none by default in this repo).

**Migration failed or database drift:**

```powershell
npx prisma migrate status
npx prisma validate
```

Fix `schema.prisma` or migration SQL, then rerun `npm run prisma:migrate` locally. Never edit applied migration files that already shipped to shared environments; add a new migration instead.

**App fails with Prisma client / column errors after a pull:**

```powershell
npm run prisma:generate
npm run prisma:migrate
```

**Check connectivity (Postgres up, URL correct):**

```powershell
npx prisma migrate status
```

Or call `GET http://localhost:3000/health/ready` while the auth service is running.

### Docker reference URLs

| Where you run Prisma | Typical `DATABASE_URL` |
| --- | --- |
| Host machine → Compose Postgres | `postgresql://postgres:postgres@localhost:5432/auth_service` |
| Inside `auth-service` container | `postgresql://postgres:postgres@postgres:5432/auth_service` |

Inside the container, `localhost` is the container itself—use the `postgres` hostname from Compose.

## Error Responses

Validation and authentication errors use this shape:

```json
{
	"error": "Invalid request body"
}
```

Common statuses are `400` for invalid input, `401` for invalid credentials or tokens, `403` for disabled accounts, `404` for unknown routes, and `409` for duplicate registration. Unexpected errors return `500` without internal details.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port, default `3000` |
| `ISSUER_URL` | Base service URL |
| `OIDC_ISSUER_URL` | Full OIDC issuer URL |
| `DATABASE_URL` | PostgreSQL connection URL |
| `REDIS_URL` | Redis connection URL |
| `OIDC_SIGNING_PRIVATE_JWK` | Optional RSA private JWK (JSON) for stable RS256 signing; omit in dev to auto-generate |
| `ID_TOKEN_AUDIENCE` | Audience for direct API ID tokens, default `auth-api` |
| `ACCESS_TOKEN_TTL` | Direct API access-token lifetime in seconds |
| `ID_TOKEN_TTL` | OIDC ID-token lifetime in seconds |
| `AUTHORIZATION_CODE_TTL` | OIDC authorization-code lifetime in seconds |
| `REFRESH_TOKEN_TTL` | Refresh-token lifetime in seconds |

Never commit `.env`, production secrets, private signing keys, access tokens, refresh tokens, or passwords.

## Useful Commands

```powershell
docker compose logs -f auth-service
docker compose down
docker compose down -v
npm run build
npx tsc --noEmit
```

Database and Prisma workflows are documented in [Prisma & PostgreSQL management](#prisma--postgresql-management).
