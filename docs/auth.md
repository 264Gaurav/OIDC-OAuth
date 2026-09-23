# Authentication & Token Claims

Access and ID tokens carry a single **active membership** so other services can authorize locally.

## Claims

| Claim | Meaning |
|-------|---------|
| `sub` | User id |
| `role` | `SUPER_ADMIN`, `PARTNER_ADMIN`, `PARTNER_USER`, `CUSTOMER_ADMIN`, or `CUSTOMER_USER` |
| `scope` | `PLATFORM`, `PARTNER`, or `CUSTOMER` |
| `partner_id` | Partner group id, or `null` |
| `customer_id` | Customer group id, or `null` |

Claims are built only from `buildAuthClaims` in `auth_service/src/policy/claims.ts`.

## Session context

Refresh sessions store `membershipId`. Login picks the highest-privilege membership unless the client sends `role` / `partnerId` / `customerId`. Switch with `POST /api/auth/context`.

The first `POST /api/auth/register` in an empty system creates the platform Super Admin. Later registration is invite-only.

## API

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
POST /api/auth/context

POST /api/partners
GET  /api/partners/:id
POST /api/partners/:id/customers
POST /api/partners/:id/members

GET  /api/customers/:id
POST /api/customers/:id/members

GET  /api/users/:id
```

Verify access tokens with the issuer JWKS. Never trust tenant ids from the request body for authorization. Policy details: [rbac-abac.md](./rbac-abac.md).
