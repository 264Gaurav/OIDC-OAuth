## Auth service

This repository contains the first MVP vertical slice of the authentication service:


### Setup

1. Copy `.env.example` to `.env` and set a random `ACCESS_TOKEN_SECRET` of at least 32 characters.
2. Start PostgreSQL and Redis.
3. Run `npm run prisma:generate`.
4. Apply the schema with `npm run prisma:migrate`.
5. Start development with `npm run dev`.

### Docker Compose

The Compose stack starts PostgreSQL, Redis, and the auth service. The auth service uses the container service names in its connection URLs:

```bash
docker compose up --build
```

Initialize the database schema from the host while PostgreSQL is running:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/auth_service npx prisma db push
```

The API is available at `http://localhost:3000`.

The service exposes:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /health/live
GET  /health/ready
```

Passwords must be 12 to 128 characters. Refresh tokens are stored only as hashes and are rotated on refresh.
# OIDC Auth Service

Node.js/TypeScript authentication service backed by PostgreSQL, Redis, Prisma, Argon2id, and `oidc-provider`.

The service exposes two integration surfaces:

- Direct authentication API at `/api/auth` for trusted backend or first-party service integrations.
- OAuth 2.0 / OpenID Connect provider at `/oidc` for browser, SPA, native, and OIDC-compatible clients.

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

### Register

```http
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
	"email": "alice@example.com",
	"password": "CorrectHorseBattery12!"
}
```

Response `201`:

```json
{
	"accessToken": "<signed-access-token>",
	"refreshToken": "<opaque-refresh-token>",
	"expiresIn": 900
}
```

### Login

```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
	"email": "alice@example.com",
	"password": "CorrectHorseBattery12!"
}
```

### Refresh

Refresh tokens rotate. Replace the old refresh token with the returned one after every successful request.

```http
POST http://localhost:3000/api/auth/refresh
Content-Type: application/json

{
	"refreshToken": "<current-refresh-token>"
}
```

### Logout

```http
POST http://localhost:3000/api/auth/logout
Content-Type: application/json

{
	"refreshToken": "<current-refresh-token>"
}
```

Response: `204 No Content`.

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

Run the requests in this order:

1. `Health / Live`
2. `Health / Ready`
3. `OIDC / Discovery`
4. `Auth / Register`
5. `Auth / Login`
6. `Auth / Refresh`
7. `Auth / Logout`

The collection stores access and refresh tokens automatically from register, login, and refresh responses. The OIDC authorization request is included as a browser-oriented request; complete its development interaction in a browser, then use the returned code with the token request.

## Running Without Docker

Copy `.env.example` to `.env`, change the database and Redis URLs to host-accessible addresses, then run:

```powershell
npm install
npm run prisma:generate
npx prisma db push
npm run dev
```

For a host process, use `postgresql://postgres:postgres@localhost:5432/auth_service` and `redis://localhost:6379`.

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
| `ACCESS_TOKEN_SECRET` | At least 32 random characters for direct API tokens |
| `ACCESS_TOKEN_TTL` | Direct API access-token lifetime in seconds |
| `ID_TOKEN_TTL` | OIDC ID-token lifetime in seconds |
| `AUTHORIZATION_CODE_TTL` | OIDC authorization-code lifetime in seconds |
| `REFRESH_TOKEN_TTL` | Refresh-token lifetime in seconds |

Never commit `.env`, production secrets, private signing keys, access tokens, refresh tokens, or passwords.

## Useful Commands

```powershell
docker compose logs -f auth-service
docker compose exec auth-service npx prisma db push --accept-data-loss
docker compose down
docker compose down -v
npm run build
npx tsc --noEmit
```
