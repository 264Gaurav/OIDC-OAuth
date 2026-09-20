# AGENTS.md

## Project

This repository contains the **MVP Authentication Service** built with:

* Node.js
* TypeScript
* Express
* PostgreSQL
* Prisma ORM
* Redis
* Argon2id
* Zod

The goal is to build a clean, secure, production-oriented authentication service first. Additional infrastructure will be added later.

---

## MVP Scope

Implement only:

* User registration
* User login/logout
* Password hashing and verification
* Access-token authentication
* Refresh-token lifecycle
* Password change
* Password reset
* Email verification capability
* User status (`active`, `disabled`, `pending`)
* Basic role/scope information
* Partner/Customer identity relationships required by authentication
* PostgreSQL persistence through Prisma
* Redis for temporary/session/rate-limit state
* Input validation
* Authentication middleware
* Authorization middleware
* Basic rate limiting
* Security headers
* Structured logging
* Health/readiness endpoints
* Unit/integration tests

Do **not** implement yet:

* Kafka or any message broker
* Event publishing/consumers
* Transactional outbox
* Device-management logic
* Device authorization
* External IdPs (Google, Microsoft, Okta, GitHub)
* MFA/WebAuthn/passkeys
* Advanced policy engines
* Token exchange/DPoP
* Dynamic client registration
* Other unrelated infrastructure

---

## Project Structure

```text
src/
├── app/
│   ├── app.ts
│   └── server.ts
│
├── config/
│   └── env.ts
│
├── routes/
│   ├── index.ts
│   ├── health.routes.ts
│   ├── auth.routes.ts
│   ├── user.routes.ts
│   ├── partner.routes.ts
│   └── customer.routes.ts
│
├── controllers/
│
├── services/
│
├── repositories/
│
├── middleware/
│   ├── authentication.ts
│   ├── authorization.ts
│   ├── error-handler.ts
│   └── rate-limit.ts
│
├── security/
│   └── password.ts
│
└── db/
    └── prisma.ts

prisma/
├── schema.prisma
└── migrations/

tests/
├── unit/
└── integration/
```

Keep route files inside `routes/`. Do not create a separate `admin/` route directory.

---

## Architecture

Use:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Repository
  ↓
Prisma
  ↓
PostgreSQL
```

Rules:

* Routes handle HTTP routing only.
* Controllers translate HTTP requests/responses.
* Services contain business/authentication logic.
* Repositories contain database access.
* Authentication/authorization must not depend on Express request objects inside services.
* Keep `app.ts` separate from `server.ts`.
* `app.ts` must not start the HTTP listener.

---

## Database

PostgreSQL is the source of truth.

Use Prisma for:

* users
* credentials
* partners
* customers
* role/scope assignments
* refresh/session persistence where required

Use:

* foreign keys
* unique constraints
* indexes
* transactions
* UTC timestamps

Do not use Redis as the permanent identity store.

---

## Redis

Redis is only for temporary/shared state such as:

* sessions
* refresh/security state where required
* rate-limit counters
* temporary verification/reset state

Do not rely on process memory for authentication state.

---

## Security

Mandatory:

* Argon2id for password hashing
* strict input validation
* secure password-reset tokens
* rate limiting
* secure cookies where cookies are used
* security headers
* centralized error handling
* no sensitive data in logs

Never log:

* passwords
* access tokens
* refresh tokens
* reset tokens
* verification tokens
* secrets

Never hardcode production secrets.

---

## Authentication

The authenticated user's identity must come from trusted server-side data.

Never trust client-provided:

```text
user_id
partner_id
customer_id
role
permissions
```

for authorization decisions.

Role and scope must be validated server-side.

Basic scope model:

```text
SUPER_ADMIN  → PLATFORM
PARTNER_ADMIN → PARTNER
PARTNER_USER  → PARTNER
CUSTOMER_ADMIN → CUSTOMER
CUSTOMER_USER → CUSTOMER
```

A Customer belongs to one Partner.

A SuperAdmin does not need Partner membership.

---

## API Design

Use resource-oriented routes:

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

POST   /api/auth/password/change
POST   /api/auth/password/reset/request
POST   /api/auth/password/reset/confirm

POST   /api/auth/email/verify

GET    /api/users/:id
PATCH  /api/users/:id

GET    /api/partners/:id
GET    /api/customers/:id

GET    /health/live
GET    /health/ready
```

Keep controllers thin.

Do not put database queries directly in route handlers.

---

## TypeScript

Use strict TypeScript.

Prefer:

```text
strict: true
```

Avoid `any` unless there is a justified reason.

Do not bypass type errors with unnecessary type assertions.

Validate external input before passing it into services.

---

## Error Handling

Use centralized error handling.

Do not expose:

* stack traces
* SQL errors
* internal implementation details
* secrets

Production responses must be safe and predictable.

---

## Testing

At minimum test:

### Unit

* password hashing/verification
* authentication logic
* authorization/scope logic
* validation
* token/session logic

### Integration

* registration
* login
* refresh
* logout
* password reset
* password change
* database persistence
* Redis behavior
* authorization boundaries

Security-sensitive behavior must have tests.

---

## Agent Rules

When modifying the project:

1. Read the existing implementation before changing it.
2. Make the smallest correct change.
3. Follow the existing architecture.
4. Do not add unnecessary dependencies.
5. Do not introduce Kafka, brokers, events, devices, external IdPs, or MFA during this MVP.
6. Do not duplicate authentication logic across modules.
7. Do not weaken security to make implementation easier.
8. Add/update tests for changed behavior.
9. Keep authentication, business logic, persistence, and HTTP concerns separated.
10. Prefer simple, maintainable code over premature abstractions.

## MVP Goal

The final MVP should provide a **secure, testable, horizontally scalable Express authentication service backed by PostgreSQL/Prisma and Redis**, without Kafka or other distributed-system infrastructure.
