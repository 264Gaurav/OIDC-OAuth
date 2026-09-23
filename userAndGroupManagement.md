# User & Group Management Guide

This guide covers how to create partner organizations, customer groups, and manage user roles using the Auth Service API via Postman.

**Base URL:** `http://localhost:3000`

> All request bodies are `Content-Type: application/json`.  
> All protected routes require `Authorization: Bearer <access-token>` in the request header.

---

## Role Hierarchy

```
SUPER_ADMIN      → Platform scope (can do everything)
  └── PARTNER_ADMIN  → Partner scope (manages a single partner)
        └── PARTNER_USER   → Partner scope (read/limited access)
        └── CUSTOMER_ADMIN → Customer scope (manages a single customer group)
              └── CUSTOMER_USER → Customer scope (read/limited access)
```

## Permission Matrix

| Action | SUPER_ADMIN | PARTNER_ADMIN | CUSTOMER_ADMIN | Notes |
|---|:---:|:---:|:---:|---|
| Create a partner | ✅ | ❌ | ❌ | Platform-level only |
| Create a customer group | ✅ | ✅ | ❌ | Partner Admin can only create under their own partner |
| Add `PARTNER_ADMIN` | ✅ | ❌ | ❌ | Only Super Admin can assign Partner Admins |
| Add `PARTNER_USER` | ✅ | ✅ | ❌ | Partner Admin can only add to their own partner |
| Add `CUSTOMER_ADMIN` | ✅ | ✅ | ❌ | Partner Admin can assign within their customer groups |
| Add `CUSTOMER_USER` | ✅ | ✅ | ✅ | Customer Admin can only add to their own group |

> ℹ️ **Direct Database Assignment:** The member endpoints (`/api/partners/:id/members` and `/api/customers/:id/members`) do **not** send email invitations. They directly create user records (if new) and assign role/tenant memberships in PostgreSQL.

---

## Prerequisites

1. The service is running: `docker compose up -d --build`
2. Database is initialized: `docker compose exec auth-service npx prisma db push`
3. Verify the service is healthy:

```http
GET http://localhost:3000/health/ready
```

Expected response `200`:

```json
{ "status": "ready" }
```

---

## Step 1 — Create / Bootstrap the SUPER_ADMIN Account

The service includes an **automatic bootstrap mechanism**:

- The **very first user** who calls `POST /api/auth/register` automatically receives the `SUPER_ADMIN` role with `PLATFORM` scope.
- Once that initial super admin is registered, public registration is locked (`403 Registration is invite-only`).

```http
POST http://localhost:3000/api/auth/register
Content-Type: application/json
```

```json
{
  "email": "superadmin@example.com",
  "password": "SuperSecret12!@#",
  "name": "Super Admin",
  "address": "Platform HQ",
  "phone": "+1-555-0100"
}
```

Response `201`:

```json
{
  "accessToken": "<super-admin-access-token>",
  "idToken": "<id-token>",
  "refreshToken": "<refresh-token>",
  "expiresIn": 900,
  "claims": {
    "sub": "<user-id>",
    "role": "SUPER_ADMIN",
    "scope": "PLATFORM",
    "partner_id": null,
    "customer_id": null
  }
}
```

*(Optional)* If you already registered a first user without super admin or need an **additional** super admin later, assign it directly in PostgreSQL:

```sql
INSERT INTO "Membership" ("id", "userId", "role", "partnerId", "customerId")
VALUES (gen_random_uuid(), '<user-id>', 'SUPER_ADMIN', NULL, NULL);
```

---

## Step 2 — Log In as SUPER_ADMIN

```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json
```

```json
{
  "email": "superadmin@example.com",
  "password": "SuperSecret12!@#",
  "role": "SUPER_ADMIN"
}
```

> The `role` field is an optional **context hint** that binds the access token to the specified role.

Response `200`:

```json
{
  "accessToken": "<super-admin-access-token>",
  "idToken": "<id-token>",
  "refreshToken": "<refresh-token>",
  "expiresIn": 900,
  "claims": {
    "sub": "<user-id>",
    "role": "SUPER_ADMIN",
    "scope": "PLATFORM",
    "partner_id": null,
    "customer_id": null
  }
}
```

📋 **Save:** `accessToken` — used as `Bearer` token in the next step.

---

## Step 3 — Create a Partner + Partner Admin

Only a `SUPER_ADMIN` can create a partner. This single call creates the partner organization **and** its first admin user atomically.

```http
POST http://localhost:3000/api/partners
Content-Type: application/json
Authorization: Bearer <SUPER_ADMIN_ACCESS_TOKEN>
```

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

### Request Fields

| Field | Type | Required | Notes |
|---|---|:---:|---|
| `name` | string | ✅ | Partner organization name (1–200 chars) |
| `admin.email` | string | ✅ | Partner admin's email |
| `admin.password` | string | ✅ | 12–128 characters (required for new users) |
| `admin.name` | string | ✅ | Partner admin's display name |
| `admin.address` | string | ✅ | Partner admin's address |
| `admin.phone` | string | ❌ | Optional phone number |

Response `201`:

```json
{
  "partner": {
    "id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "name": "Acme Partner Inc."
  },
  "admin": {
    "id": "ffffffff-gggg-hhhh-iiii-jjjjjjjjjjjj",
    "email": "partneradmin@acme.com",
    "name": "Partner Admin",
    "address": "123 Partner Street",
    "phone": "+1-555-0199",
    "status": "ACTIVE"
  },
  "membershipId": "kkkkkkkk-llll-mmmm-nnnn-oooooooooooo"
}
```

📋 **Save:** `partner.id` — you will need this UUID in every subsequent step.

---

## Step 4 — Log In as the Partner Admin

```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json
```

```json
{
  "email": "partneradmin@acme.com",
  "password": "PartnerSecure12!",
  "role": "PARTNER_ADMIN",
  "partnerId": "<partner-id-from-step-3>"
}
```

### Request Fields

| Field | Type | Required | Notes |
|---|---|:---:|---|
| `email` | string | ✅ | |
| `password` | string | ✅ | |
| `role` | string | ❌ | Context hint — use `"PARTNER_ADMIN"` to bind this role |
| `partnerId` | UUID | ❌ | Context hint — scopes token to this partner |

Response `200`:

```json
{
  "accessToken": "<partner-admin-access-token>",
  "idToken": "<id-token>",
  "refreshToken": "<refresh-token>",
  "expiresIn": 900,
  "claims": {
    "sub": "<user-id>",
    "role": "PARTNER_ADMIN",
    "scope": "PARTNER",
    "partner_id": "<partner-id>",
    "customer_id": null
  }
}
```

📋 **Save:** `accessToken` — used for all Partner Admin actions below.

---

## Step 5 — Create a Customer Group

A `PARTNER_ADMIN` can create customer groups (organizations) under their own partner.

```http
POST http://localhost:3000/api/partners/<partner-id>/customers
Content-Type: application/json
Authorization: Bearer <PARTNER_ADMIN_ACCESS_TOKEN>
```

```json
{
  "name": "Retail Customer Corp"
}
```

### Request Fields

| Field | Type | Required | Notes |
|---|---|:---:|---|
| `name` | string | ✅ | Customer group name (1–200 chars) |

### Path Parameter

| Param | Notes |
|---|---|
| `:id` | The partner UUID from Step 3 |

Response `201`:

```json
{
  "id": "pppppppp-qqqq-rrrr-ssss-tttttttttttt",
  "name": "Retail Customer Corp",
  "partnerId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
}
```

📋 **Save:** `id` (customer group ID) — used in the next step.

---

## Step 6 — Add a Customer Admin to the Customer Group

A `PARTNER_ADMIN` can add a `CUSTOMER_ADMIN` or `CUSTOMER_USER` into any customer group under their partner. This directly creates the user account (if new) and assigns the membership in the database. **No email notification is sent.**

```http
POST http://localhost:3000/api/customers/<customer-id>/members
Content-Type: application/json
Authorization: Bearer <PARTNER_ADMIN_ACCESS_TOKEN>
```

```json
{
  "email": "customeradmin@retail.com",
  "password": "CustomerSecure12!",
  "name": "Customer Admin",
  "address": "456 Retail Road",
  "phone": "+1-555-0200",
  "role": "CUSTOMER_ADMIN"
}
```

### Request Fields

| Field | Type | Required | Notes |
|---|---|:---:|---|
| `email` | string | ✅ | New or existing user's email |
| `password` | string | ✅ / ❌ | Required only if this is a **new** user (12–128 chars). Omit if the user already exists in the system. |
| `name` | string | ✅ | Display name |
| `address` | string | ✅ | Physical address |
| `phone` | string | ❌ | Optional phone number |
| `role` | string | ✅ | `"CUSTOMER_ADMIN"` or `"CUSTOMER_USER"` |

### Path Parameter

| Param | Notes |
|---|---|
| `:id` | The customer group UUID from Step 5 |

Response `201`:

```json
{
  "user": {
    "id": "uuuuuuuu-vvvv-wwww-xxxx-yyyyyyyyyyyy",
    "email": "customeradmin@retail.com",
    "name": "Customer Admin",
    "address": "456 Retail Road",
    "phone": "+1-555-0200",
    "status": "ACTIVE"
  },
  "membershipId": "zzzzzzzz-1111-2222-3333-444444444444",
  "role": "CUSTOMER_ADMIN"
}
```

---

## Step 7 — Verify: Log In as the Customer Admin

```http
POST http://localhost:3000/api/auth/login
Content-Type: application/json
```

```json
{
  "email": "customeradmin@retail.com",
  "password": "CustomerSecure12!",
  "role": "CUSTOMER_ADMIN",
  "customerId": "<customer-id-from-step-5>"
}
```

Response `200`:

```json
{
  "accessToken": "<customer-admin-access-token>",
  "idToken": "<id-token>",
  "refreshToken": "<refresh-token>",
  "expiresIn": 900,
  "claims": {
    "sub": "<user-id>",
    "role": "CUSTOMER_ADMIN",
    "scope": "CUSTOMER",
    "partner_id": "<partner-id>",
    "customer_id": "<customer-id>"
  }
}
```

A successful `200` response with tokens and customer-scoped claims confirms the customer admin account is fully set up.

---

## Optional: Add a Customer User

Once a `CUSTOMER_ADMIN` is logged in, they can also add `CUSTOMER_USER` members into their own group. **No email is sent** — the user is created (if new) and assigned to the group directly.

```http
POST http://localhost:3000/api/customers/<customer-id>/members
Content-Type: application/json
Authorization: Bearer <CUSTOMER_ADMIN_ACCESS_TOKEN>
```

```json
{
  "email": "customeruser@retail.com",
  "password": "UserPassword12!",
  "name": "Regular User",
  "address": "789 User Lane",
  "role": "CUSTOMER_USER"
}
```

---

## Optional: Add a Partner Member

A `PARTNER_ADMIN` can add partner-level users (`PARTNER_USER`) to their partner organization. A `SUPER_ADMIN` can add either `PARTNER_ADMIN` or `PARTNER_USER`. **No email is sent.**

```http
POST http://localhost:3000/api/partners/<partner-id>/members
Content-Type: application/json
Authorization: Bearer <PARTNER_ADMIN_ACCESS_TOKEN>
```

```json
{
  "email": "partneruser@acme.com",
  "password": "PartnerUser12!",
  "name": "Partner User",
  "address": "123 Partner Street",
  "role": "PARTNER_USER"
}
```

Valid `role` values: `"PARTNER_ADMIN"` (SUPER_ADMIN only) or `"PARTNER_USER"`.

---

## Optional: Switch Context After Login

If a user has multiple roles/memberships, they can switch their active token context without logging out.

```http
POST http://localhost:3000/api/auth/context
Content-Type: application/json
Authorization: Bearer <CURRENT_ACCESS_TOKEN>
```

```json
{
  "role": "PARTNER_ADMIN",
  "partnerId": "<partner-id>"
}
```

Response `200`:

```json
{
  "accessToken": "<new-access-token>",
  "idToken": "<identity-token>",
  "refreshToken": "<new-refresh-token>",
  "expiresIn": 900,
  "claims": {
    "sub": "<user-id>",
    "role": "PARTNER_ADMIN",
    "scope": "PARTNER",
    "partner_id": "<partner-id>",
    "customer_id": null
  }
}
```

---

## Error Reference

| Status | Meaning |
|---|---|
| `400` | Invalid or missing request fields |
| `401` | Missing, expired, or invalid access token |
| `403` | Account disabled, or insufficient permissions for the action |
| `404` | Partner or customer not found |
| `409` | User already has this membership, or email already registered |
| `500` | Unexpected server error (no internal details exposed) |

---

## Complete Flow Summary

```
[SUPER_ADMIN]
    │
    ├── POST /api/partners
    │       body: { name, admin: { email, password, name, address } }
    │       → creates Partner + PARTNER_ADMIN user
    │
[PARTNER_ADMIN logs in]
    │
    ├── POST /api/partners/:partnerId/customers
    │       body: { name }
    │       → creates Customer Group
    │
    ├── POST /api/customers/:customerId/members
    │       body: { email, password, name, address, role: "CUSTOMER_ADMIN" }
    │       → adds Customer Admin (direct DB record, no email)
    │
    └── POST /api/customers/:customerId/members
            body: { email, password, name, address, role: "CUSTOMER_USER" }
            → adds Customer User (direct DB record, no email)

[CUSTOMER_ADMIN logs in]
    │
    └── POST /api/customers/:customerId/members
            body: { email, password, name, address, role: "CUSTOMER_USER" }
            → adds Customer User within their own group (direct DB record, no email)
```
