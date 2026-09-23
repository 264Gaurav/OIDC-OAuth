# Production Requirements — OIDC Authentication Service

**Document:** Authentication Service Requirements & Architecture Specification  
**Version:** 1.0  
**Status:** Consolidated requirements draft  
**Primary stack:** Node.js, Express, `oidc-provider`, PostgreSQL, Redis  
**Initial identity model:** Local username/password credentials  
**Future identity model:** External/federated IdPs such as Google, Microsoft/Entra ID, Okta, GitHub  
**Architecture role:** Standalone Identity Provider (OP) / OAuth 2.0 Authorization Server

---

## 1. Purpose

The Authentication Service is a standalone identity service responsible for:

- authenticating end users;
- maintaining durable user identity and credential records;
- maintaining tenant/group membership relevant to identity;
- maintaining authentication sessions and OAuth/OIDC grants;
- issuing standards-compliant OAuth 2.0 access tokens and OpenID Connect ID tokens;
- exposing OIDC discovery and JWKS metadata;
- supporting web, SPA, native/mobile and confidential clients through appropriate OAuth client types;
- supporting refresh-token lifecycle and revocation;
- publishing identity lifecycle events so downstream services can remain synchronized with user, tenant and membership changes;
- providing an extensible foundation for future identity federation and stronger authentication mechanisms.

The service is an **Identity Provider / Authorization Server**, not the application's complete authorization system. Business services remain responsible for enforcing resource-specific permissions.

The OIDC protocol provides an identity layer over OAuth 2.0; the provider must therefore implement protocol behavior through `oidc-provider` rather than inventing a proprietary token protocol. The current `oidc-provider` project supports OIDC/OAuth, discovery, revocation, logout, PKCE, client credentials and other extensions, but optional features must be explicitly configured and tested for the deployment. [OIDC Foundation](https://openid.net/wg/connect/specifications/) · [oidc-provider](https://github.com/panva/node-oidc-provider)

---

# 2. Scope

## 2.1 Phase 1 — Must ship

Phase 1 shall provide:

1. OIDC Discovery.
2. Authorization Code Flow.
3. PKCE using `S256`.
4. Local username/password authentication.
5. Secure browser-based login interaction.
6. User registration/provisioning.
7. Email-verification capability.
8. Password reset/change capability.
9. PostgreSQL-backed durable identity store.
10. Redis-backed transient OIDC/session state through the `oidc-provider` adapter.
11. Asymmetric signing and JWKS publication.
12. Access-token, ID-token, authorization-code and refresh-token lifecycle management.
13. Refresh-token rotation and reuse detection.
14. Token revocation.
15. RP-initiated logout and a defined logout/session strategy.
16. Multiple registered clients.
17. Confidential and public client support.
18. Service-to-service authentication through a separate confidential-client flow where required.
19. Tenant and membership awareness.
20. Identity lifecycle event publication.
21. Audit logging and security-relevant events.
22. Health/readiness endpoints, metrics and structured logs.
23. Production-grade rate limiting and abuse controls.
24. Key rotation without invalidating all still-valid tokens.
25. Automated integration, security and protocol-conformance tests.

## 2.2 Explicitly out of scope for Phase 1

The following may be added later without changing the core architecture:

- social login / external identity federation;
- enterprise IdPs such as Okta or Microsoft Entra ID;
- MFA/WebAuthn/passkeys;
- device authorization flow;
- dynamic client self-registration;
- advanced delegated authorization;
- fine-grained policy-engine functionality;
- token exchange;
- advanced proof-of-possession mechanisms such as DPoP;
- identity assurance / verified claims.

The design must not block these capabilities.

---

# 3. Architectural Principles

## 3.1 Protocol-first

OAuth 2.0/OIDC behavior shall follow the applicable specifications rather than custom conventions.

The implementation shall use:

- OpenID Connect Core;
- OpenID Connect Discovery;
- OAuth 2.0 Authorization Code Flow;
- PKCE;
- OAuth 2.0 Token Revocation;
- OAuth 2.0 Security Best Current Practice;
- OAuth native-app guidance for public/native clients where applicable.

The current OAuth 2.0 Security BCP requires exact redirect-URI matching and requires public clients to use PKCE for authorization-code flows. PKCE `S256` is the required method for new implementations.  
References: [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700), [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636), [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252).

## 3.2 Stateless application tier, stateful infrastructure

The Node/Express process shall not depend on in-memory application state for correctness.

The application tier shall be horizontally scalable across multiple instances. Shared state required for authentication shall reside in PostgreSQL and/or Redis according to the storage policy.

This means:

- no process-local session dependency;
- no instance-local refresh-token state;
- no sticky-session dependency for correctness;
- any instance can serve any valid request;
- Redis and PostgreSQL are external shared dependencies.

## 3.3 Authentication ≠ business authorization

The authentication service establishes identity and issues protocol credentials.

Resource services shall still enforce:

- resource permissions;
- ownership;
- tenant isolation;
- business roles;
- object-level authorization;
- contextual policies.

Authentication claims may carry tenant and role context when needed, but the auth service shall not attempt to encode every application authorization rule into JWTs.

---

# 4. High-Level Architecture

```text
                         +----------------------------+
                         | Web / SPA / Mobile Client |
                         | Backend / Service Client   |
                         +-------------+--------------+
                                       |
                              OAuth 2.0 / OIDC
                                       |
                                       v
+---------------------------------------------------------------------+
|                    OIDC AUTHENTICATION SERVICE                      |
|                                                                     |
|  +-------------------+   +------------------+   +----------------+ |
|  | OIDC Provider     |   | Interaction/Auth |   | Admin / Identity|
|  | oidc-provider     |   | Login / Consent  |   | Management API  | |
|  +---------+---------+   +--------+---------+   +-------+--------+ |
|            |                       |                     |          |
|            +-----------------------+---------------------+          |
|                                    |                                |
|                   +----------------+----------------+               |
|                   |                                 |               |
|                   v                                 v               |
|          +------------------+             +----------------------+  |
|          | Redis            |             | PostgreSQL            |  |
|          | OIDC artifacts   |             | Users                 |  |
|          | sessions         |             | Credentials           |  |
|          | replay state     |             | Tenants / Memberships |  |
|          | rate limits      |             | Clients / Grants*     |  |
|          +------------------+             | Audit / Outbox        |  |
|                                           +-----------+----------+  |
|                                                       |             |
|                                                       v             |
|                                             Identity Events        |
+---------------------------------------------------+-----------------+
                                                    |
                                         Kafka / Message Broker
                                                    |
                         +--------------------------+------------------+
                         |                          |                  |
                         v                          v                  v
                  Device Backend              API Services       Admin/Other
```

`*` Client/grant persistence depends on the selected `oidc-provider` adapter strategy.

---

# 5. Identity, Role and Multitenant Model

The authentication service targets a **hierarchical multi-tenant model**. Authentication identifies the user; role, tenant scope and resource policy determine what that authenticated user may see or manage.

The required hierarchy is **platform → partner groups → customer groups → customer resources**. SuperAdmins are platform owners/managers and are **not members of any Partner Group**.

```text
Platform
│
├── SuperAdmin(s)
│   └── Platform scope (no Partner membership)
│
├── Partner Group A
│   ├── Partner Admin(s)
│   ├── Partner User(s)
│   ├── Partner Resources / Modules
│   │
│   └── Customer Group A1
│       ├── Customer Admin(s)
│       ├── Customer User(s)
│       └── Customer Resources
│           ├── Devices
│           └── Device Buckets
│
└── Partner Group B
    └── ...
```

A **Customer Group belongs to exactly one Partner Group**. A Partner Admin/User is scoped to an explicitly assigned Partner Group. A Customer Admin/User is scoped to an explicitly assigned Customer Group and is therefore indirectly associated with its owning Partner Group. A SuperAdmin has platform scope and does not require Partner membership.

The effective permissions for every request must be calculated from the user's role, explicit scope/membership, requested action and target resource. Role names must never be treated as a substitute for scope validation.

The system must enforce both **RBAC** (role-based permissions) and **tenant/resource scoping**. A role alone is never sufficient to grant access across tenant boundaries.

## 5.1 Platform SuperAdmin

SuperAdmins are platform-level administrators and are provisioned during application deployment/initial platform setup rather than through normal customer/partner self-service flows.

SuperAdmin capabilities shall include:

- create, activate, disable and manage Partner Groups;
- create and manage Partner Admins for a Partner Group;
- view Partner Groups and their organizational metadata;
- view Partner-level resources/modules within the platform administrative scope;
- manage platform-level configuration required for identity/client administration;
- perform administrative actions across Partners where platform policy explicitly permits it.

SuperAdmin access is a **platform scope**, not a Partner scope. A SuperAdmin therefore has no Partner membership and must not be represented as belonging to any Partner Group merely because the SuperAdmin can administer that Partner.

A SuperAdmin may create and manage multiple Partner Groups and may administer Partner-level objects across those groups because the role is explicitly authorized at the platform level. This platform-level authority must not be confused with Partner membership.

SuperAdmin operations must be strongly authenticated, audited and separately protected from ordinary end-user administration.

## 5.2 Partner Admin

A Partner Admin belongs to one Partner Group and administers that Partner's organizational scope.

Partner Admin capabilities shall include:

- create, activate, disable and manage Partner Users belonging to the same Partner Group;
- create and manage Customer Groups under that Partner;
- create Customer Admins for Customer Groups under that Partner;
- create Customer Users for Customer Groups under that Partner;
- manage Partner-level resources/modules within the Partner scope;
- view/manage the customers belonging to the Partner according to assigned permissions;
- never access or manage Customer Groups, users, devices or device buckets belonging to another Partner solely by virtue of being a Partner Admin.

A Partner Admin must not cross the Partner boundary. The authorization layer must derive the Partner scope from trusted identity/membership data rather than accepting an arbitrary `partner_id` from a request.

## 5.3 Partner User

Partner Users are created and managed by a Partner Admin.

A Partner User is scoped to exactly the Partner Group(s) to which the user is explicitly assigned. Partner User permissions shall be policy/configuration driven.

The baseline requirement is:

- access only Partner resources/modules explicitly assigned to the user;
- no implicit administrative privileges merely because the user belongs to a Partner;
- no access to another Partner's resources;
- no Customer administration unless a separate explicit permission is granted by policy.

**Open policy decision:** the exact read/create/update/delete permissions of a Partner User for each Partner module/resource must be defined in the authorization policy matrix before implementation is finalized. The role itself must not be treated as an unrestricted Partner Admin.

## 5.4 Customer Admin

A Customer Admin belongs to one Customer Group.

Customer Admin capabilities shall include:

- create, activate, disable and manage Customer Users within the same Customer Group;
- manage membership of the Customer Group according to assigned permissions;
- manage devices belonging to the Customer Group;
- manage device buckets belonging to the Customer Group;
- access only the resources/modules assigned to that Customer Group;
- never access devices, users, buckets or other resources of another Customer Group unless an explicit higher-level administrative scope grants such access.

A Customer Admin must not cross either the Customer boundary or the Partner boundary through normal customer administration.

## 5.5 Customer User

A Customer User belongs to one Customer Group and is created/managed by the Customer Admin or an authorized higher-level administrator.

Customer Users may:

- view/manage devices within their Customer Group according to the permissions assigned to the role;
- view/manage device buckets within their Customer Group according to the permissions assigned to the role;
- access only the modules and resources explicitly granted to them;
- not create/manage users or change Customer Group membership unless an explicit administrative permission is assigned.

Customer User access must never extend to another Customer Group merely because both groups belong to the same Partner.

## 5.6 Role-to-Scope Matrix

| Role | Authorization scope | Can manage | Cross-scope access |
|---|---|---|---|
| SuperAdmin | Platform (`PLATFORM`, no Partner membership) | Partner Groups, Partner Admins, platform/Partner-level administration | Yes, by explicit platform authority |
| PartnerAdmin | One Partner Group | Partner Users, Customer Groups, Customer Admins/Users, Partner resources/modules | No, outside assigned Partner |
| CustomerAdmin | One Customer Group | Customer Users, devices, device buckets, Customer resources | No |
| CustomerUser | One Customer Group | Devices/device buckets allowed by assigned permissions, can't create users | No |

This table defines the **scope boundary**, not every CRUD permission. Fine-grained permissions must be represented separately and evaluated together with scope.

## 5.7 Platform, Partner and Customer Scope Invariants

The authorization model shall enforce the following hierarchy independently of UI behavior:

```text
SUPER_ADMIN
  scope = PLATFORM
  Partner membership = NONE

PARTNER_ADMIN 
  scope = PARTNER(partner_id)

CUSTOMER_ADMIN / CUSTOMER_USER
  scope = CUSTOMER(customer_id)
  owning_partner = derived from Customer Group
```

Mandatory rules:

1. Creating a Partner Group is a platform-level operation performed by a SuperAdmin or another explicitly authorized platform principal.
2. A SuperAdmin may create multiple Partner Groups.
3. Creating/managing a Partner Admin is a platform operation or an explicitly delegated operation; ordinary Partner membership does not elevate a user to platform scope.
4. A SuperAdmin does not receive access through a fabricated Partner membership; platform authorization is evaluated directly from the SuperAdmin role/scope.
5. A Partner Admin can administer only the Partner Group identified by the Partner scope attached to the admin's role assignment.
6. A Customer Admin/User can administer or use resources only within the Customer Group attached to their role assignment.
7. The parent Partner of a Customer is derived from the authoritative Customer Group record.
8. No request parameter, URL segment, form field or client-controlled token claim can change the caller's effective authorization scope.
9. Platform, Partner and Customer administrative actions must be independently auditable.

## 5.7 Resource and Module Authorization

Every protected resource/module must have an authorization policy composed from at least:

```text
Principal
  + Role
  + Partner scope
  + Customer scope (when applicable)
  + Resource ownership/association
  + Requested action
  + Explicit permission
  + Resource status/policy constraints
```

Typical actions should be modeled explicitly, for example:

```text
resource.read
resource.create
resource.update
resource.delete
resource.manage
user.manage
membership.manage
device.read
device.create
device.update
device.delete
device.manage
bucket.read
bucket.create
bucket.update
bucket.delete
bucket.manage
```

The exact permission catalog should be centrally versioned and reviewed. Broad permissions such as `admin:*` should not be used as a substitute for resource-aware authorization.

## 5.8 Tenant and Resource Isolation Rules

The following isolation rules are mandatory:

1. Every Customer Group has exactly one owning Partner Group.
2. Every Customer User/Admin has an authenticated membership relationship to the Customer Group.
3. Every device and device bucket must be associated with a Customer Group, directly or through an authoritative resource-ownership relationship.
4. Every request for a tenant-owned resource must verify the caller's effective scope before the resource is returned or modified.
5. The caller cannot select another tenant merely by changing a path parameter, query parameter, request body field or token-adjacent client value.
6. Resource lookups must include authorization scope in the data-access condition where practical, not only after an unrestricted record lookup.
7. Cross-tenant identifiers must not be accepted as proof of access.
8. Partner Admins cannot administer another Partner's Customer Groups.
9. Customer Admins/Users cannot administer another Customer Group.
10. SuperAdmin cross-Partner administration is an explicit platform capability and must be audited.
11. Background jobs and service-to-service operations must use service identities with explicit scope; they must not bypass tenant authorization by default.
12. Tenant deletion/disablement must propagate to dependent memberships/resources according to an explicit lifecycle policy.

## 5.9 User

A user is a globally identifiable identity within the authentication domain.

Minimum attributes:

| Field | Requirement |
|---|---|
| `id` | Immutable internal user identifier |
| `username` | Unique according to configured identity policy |
| `email` | Unique according to configured identity policy |
| `name` | Display name |
| `status` | `active`, `disabled`, `pending`, or equivalent |
| `email_verified_at` | Nullable timestamp |
| `created_at` | Timestamp |
| `updated_at` | Timestamp |
| `last_login_at` | Nullable timestamp |
| `password_changed_at` | Nullable timestamp |
| `auth_version` | Monotonic version useful for invalidating sessions/tokens when policy requires |

The stable user identifier shall be used as the OIDC `sub` value.

The identifier must never be reused for another user.

## 5.10 Tenant and Membership Records

The identity model must persist explicit Partner and Customer organizational relationships rather than inferring them from role names.

At minimum, the model should include:

- `partner` / Partner Group;
- `customer` / Customer Group, with `partner_id` as the owning parent;
- user-to-partner membership where relevant;
- user-to-customer membership where relevant;
- role assignment records;
- membership status;
- created/updated timestamps.

A role assignment should be represented as a relationship that includes its authorization scope. Conceptually:

```text
RoleAssignment
  user_id
  role            = SUPER_ADMIN | PARTNER_ADMIN | CUSTOMER_ADMIN | CUSTOMER_USER
  scope_type      = PLATFORM | PARTNER | CUSTOMER
  scope_id        = null        | partner_id | customer_id
  status
  created_at
  updated_at
```

Scope rules are mandatory:

- `SUPER_ADMIN` → `scope_type=PLATFORM` and `scope_id=null`; the user has **no Partner membership**.
- `PARTNER_ADMIN`  → `scope_type=PARTNER` and `scope_id=<partner_id>`.
- `CUSTOMER_ADMIN` / `CUSTOMER_USER` → `scope_type=CUSTOMER` and `scope_id=<customer_id>`.
- A Customer's owning Partner is derived from the Customer Group relationship; it must not be supplied by the client as an independently trusted authorization scope.

The concrete schema may use normalized tables rather than this exact shape.

The auth service must not trust a tenant/partner/customer ID supplied by a browser or client without validating that the authenticated principal has a current membership and permission for that scope.

## 5.11 Credential

Password credentials should be modeled separately from the core user record where practical.

Minimum attributes:

- user ID;
- password hash;
- password algorithm/version;
- created timestamp;
- updated timestamp;
- password-change timestamp.

Preferred password hashing algorithm: **Argon2id** with parameters selected from current security guidance and deployment capacity.

`bcrypt` may be supported for compatibility, but the service must not interpret “bcrypt work factor 10+” as a universal security target. Password-hashing parameters must be benchmarked and centrally configured.

Passwords must never be stored, logged, returned or emitted in events.

## 5.12 Tenant context in tokens

Where a user actively operates in one selected Customer/Partner context, the issued access token may contain a compact tenant context such as:

```json
{
  "sub": "user_123",
  "partner_id": "partner_456",
  "customer_id": "customer_789"
}
```

The exact claim names are an API contract decision and must be standardized across resource services.

Tokens should contain only the minimum context needed by resource services. Do not embed an unbounded list of memberships or detailed permission graphs in JWTs.

Because JWT access tokens are normally self-contained, removing a membership may not invalidate an already issued token immediately. Therefore immediate security response must be handled through:

- short access-token TTLs;
- refresh-token/session revocation;
- identity lifecycle events;
- downstream authorization-state invalidation where required;
- optional introspection/deny-list mechanisms for high-risk resources.

# 6. OAuth/OIDC Client Model

Each application or service consuming the identity platform shall have an explicitly registered OAuth client.

## 6.1 Client categories

### Confidential client

Use for:

- server-side web applications;
- trusted backend services;
- administrative applications where the secret can actually be kept confidential.

The client may authenticate at the token endpoint using an approved client-authentication method.

### Public client

Use for:

- SPAs;
- native iOS/Android applications;
- installed applications.

A public client **must not depend on a distributed client secret**.

Native/public clients must use Authorization Code + PKCE and an appropriate redirect URI. Native apps should use an external user agent/browser for authorization.  
Reference: [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252).

## 6.2 Redirect URI policy

Redirect URIs must be:

- pre-registered;
- exact-match validated;
- scheme/host/path controlled by the client owner;
- HTTPS in production except explicitly permitted native-app mechanisms.

Wildcards and arbitrary redirect URIs are prohibited.

The authorization server must never implement an open redirect based on a user-controlled redirect parameter.

RFC 9700 explicitly requires exact redirect-URI matching, with the defined localhost exception for native applications.  
Reference: [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700).

## 6.3 Client registration

Phase 1 should use controlled/static registration or an authenticated admin registration API.

Public dynamic self-registration is out of scope until its trust model and abuse controls are explicitly designed.

A client record should include:

- client ID;
- client type;
- allowed grant types;
- redirect URIs;
- allowed scopes;
- allowed audiences/resources;
- token endpoint authentication method;
- allowed logout URIs;
- status;
- secret metadata, if confidential;
- creation/update timestamps.

---

# 7. OAuth/OIDC Flows

## 7.1 Primary user login flow

The primary user authentication flow shall be:

```text
Client
  |
  | 1. Authorization request
  |    response_type=code
  |    scope=openid ...
  |    state=...
  |    nonce=...
  |    code_challenge=...
  |    code_challenge_method=S256
  v
Authorization Endpoint
  |
  | 2. Authenticate user
  | 3. Create/validate OP session
  | 4. Optional consent
  v
Redirect URI
  |
  | 5. Authorization code
  v
Client
  |
  | 6. Token request + code_verifier
  v
Token Endpoint
  |
  | 7. Access token + ID token + optional refresh token
  v
Client
```

## 7.2 PKCE

PKCE is required for public clients and should be enabled broadly for Authorization Code Flow.

Only `S256` shall be accepted for new clients.

The authorization server must verify that the `code_verifier` matches the previously stored challenge.

Reference: [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636).

## 7.3 Authorization Code security

Authorization codes must:

- be short-lived;
- be single-use;
- be bound to the client;
- be bound to the redirect URI;
- be associated with the correct authorization transaction;
- be rejected after successful redemption;
- be protected against replay.

Recommended initial TTL: **5 minutes**.

## 7.4 Implicit and ROPC

The service shall not use OAuth implicit flow for application login.

Resource Owner Password Credentials / direct password grant shall not be used for normal client authentication. User credentials belong inside the authentication interaction handled by the identity service, not inside arbitrary application token requests.

## 7.5 Service-to-service authentication

For machine-to-machine use cases, a dedicated confidential client flow such as `client_credentials` may be enabled for explicitly registered services.

Such tokens must:

- have no end-user `sub` unless the selected protocol requires an explicit service identity;
- use service-specific scopes;
- have service-specific audiences;
- be separately auditable from user sessions.

---

# 8. OIDC Claims and Token Semantics

## 8.1 ID Token

The ID Token represents authentication of the end user to the client.

It may contain:

- `iss`;
- `sub`;
- `aud`;
- `azp` where applicable;
- `iat`;
- `exp`;
- `auth_time` where applicable;
- `nonce` where applicable;
- requested/allowed identity claims such as `name` and `email`.

The client must validate the ID Token according to OIDC rules.

An ID Token must **not** be treated as the API authorization credential.

## 8.2 Access Token

The access token is the credential presented to resource servers.

The resource server must validate:

- signature, when the token is a JWT;
- issuer;
- audience;
- expiration/not-before constraints;
- algorithm;
- required scopes/permissions;
- tenant context where applicable.

A frontend may decode a JWT for display purposes, but decoding a token is not verification.

## 8.3 Audience restriction

Access tokens must be audience-restricted to their intended protected resource(s).

For a system with multiple APIs, the design should support OAuth Resource Indicators or an equivalent audience-selection strategy.

Example:

```text
resource = https://api.example.com/device-management
scope    = device.read device.write
```

The resource service then validates that the token's `aud` corresponds to that service.

RFC 8707 recommends audience restriction so an access token intended for one resource cannot simply be replayed at a different resource.  
Reference: [RFC 8707](https://datatracker.ietf.org/doc/html/rfc8707).

## 8.4 Scopes

Initial scopes may include:

- `openid`;
- `profile`;
- `email`;
- `offline_access`;
- application-specific API scopes;
- service-specific scopes.

Scopes must be allowlisted per client and resource.

The service must reject unauthorized combinations rather than silently issuing broader permissions.

---

# 9. Token Lifecycle

Initial values from the original drafts are retained as defaults, but they are policy defaults rather than immutable protocol requirements.

| Artifact | Initial default | Policy |
|---|---:|---|
| Access Token | 15 minutes | Short-lived; configurable by risk/client/resource |
| ID Token | 15 minutes | Client/session appropriate |
| Authorization Code | 5 minutes | Single-use |
| Refresh Token | 30 days | Absolute lifetime + rotation |

## 9.1 Refresh Token Rotation

Refresh Token Rotation is required.

On successful refresh:

1. Validate the old refresh token.
2. Consume/invalidate it.
3. Issue a new access token.
4. Issue a new refresh token.
5. Preserve the correct grant/session relationship.
6. Record security/audit metadata.

When a previously consumed refresh token is presented again, the service must treat it as a possible replay/compromise event and revoke the relevant refresh-token chain/grant according to the provider's rotation semantics.

Current `oidc-provider` documentation describes `rotateAndConsume` as consuming the current refresh token and revoking the token chain/grant when a consumed token is subsequently encountered.  
Reference: [oidc-provider configuration](https://github.com/panva/node-oidc-provider/blob/main/docs/configuration.md).

## 9.2 Revocation

The service shall expose OAuth token revocation.

At minimum:

- refresh-token revocation is required;
- access-token revocation should be supported where the implementation can provide meaningful behavior.

Reference: [RFC 7009](https://datatracker.ietf.org/doc/html/rfc7009).

## 9.3 Logout

Logout shall define three separate outcomes:

1. local OP browser/session logout;
2. refresh-token/grant revocation;
3. downstream RP/session logout.

Where appropriate, implement:

- RP-initiated logout;
- OIDC back-channel logout.

Back-channel logout requires the OP to track which RPs are associated with the user's logged-in sessions and send signed logout tokens to registered back-channel logout endpoints.  
Reference: [OpenID Connect Back-Channel Logout](https://openid.net/specs/openid-connect-backchannel-1_0.html).

---

# 10. Storage Architecture

The original documents correctly identify PostgreSQL and Redis as useful complementary stores, but the previous rules were too absolute.

## 10.1 PostgreSQL — durable source of truth

PostgreSQL shall be the authoritative store for:

- users;
- credentials;
- tenants;
- memberships;
- identity status;
- client registrations where persistent management is required;
- durable audit records;
- identity lifecycle event/outbox records;
- optional authorization/grant metadata that must survive Redis loss.

PostgreSQL must use:

- migrations;
- constraints;
- unique indexes;
- foreign keys;
- transaction boundaries;
- UTC timestamps;
- connection pooling;
- least-privileged credentials.

## 10.2 Redis — transient/high-frequency state

Redis should handle short-lived/high-frequency state such as:

- OIDC interactions;
- authorization codes;
- sessions;
- replay detection;
- refresh-token metadata where selected by the adapter;
- rate-limit counters;
- temporary security state.

All entries requiring expiration must use TTLs.

Redis must not become the only source of truth for identity data.

## 10.3 `oidc-provider` adapter

The service shall implement or adopt a production-tested `oidc-provider` adapter.

The adapter must correctly support the lifecycle operations required by the provider, including:

- `upsert`;
- `find`;
- `findByUid` where required by provider version;
- `consume`;
- `destroy`;
- expiration behavior;
- replay/consumption state;
- grant/session relationships.

The exact methods and model names shall be pinned to the deployed `oidc-provider` version and verified through the provider's adapter conformance tests.

The adapter is a correctness boundary, not a generic Redis wrapper.

---

# 11. Cryptographic Key Management

## 11.1 Signing algorithm

Initial deployment may use:

- RSA 2048-bit signing;
- `RS256`.

The algorithm must be explicit and allowlisted.

The service must never accept an attacker-selected signing algorithm merely because it appears in a token header.

## 11.2 Private-key storage

The original drafts proposed storing the complete private JWKS in `OIDC_JWKS`.

That is acceptable for local development and controlled non-production environments, but it is not the preferred production architecture.

Production private signing keys should be stored in:

- a secrets manager;
- KMS;
- HSM;
- or another protected key-management facility.

Raw private keys must not be committed to source control.

## 11.3 Key rotation

Key rotation must support overlap:

```text
Current key:    auth-key-v2  -> signs new tokens
Previous key:   auth-key-v1  -> remains published for verification
After expiry:   auth-key-v1  -> removed from JWKS
```

The old public key must remain available until all tokens signed by it can no longer be valid.

`kid` values must be stable identifiers for actual key versions.

Do not generate a new key ID from `Date.now()` every application startup.

## 11.4 JWKS

The provider shall expose the OIDC JWKS endpoint.

Resource servers shall retrieve and cache public keys.

Resource servers must refresh JWKS when an unfamiliar but valid `kid` is encountered, subject to rate limits.

---

# 12. Standard Endpoints

The OIDC provider should expose the standard metadata and protocol endpoints supported by the configured `oidc-provider` version.

At minimum the deployment shall expose:

- discovery metadata;
- authorization endpoint;
- token endpoint;
- JWKS endpoint;
- userinfo endpoint where enabled;
- revocation endpoint;
- logout endpoint where enabled.

The discovery document must accurately advertise only features that are actually enabled.

Expected discovery endpoint:

```text
/.well-known/openid-configuration
```

Expected JWKS endpoint:

```text
/.well-known/jwks.json
```

The public issuer URL must be stable and consistent across environments.

The `iss` value must exactly match the configured public issuer.

---

# 13. Authentication Interaction Layer

`oidc-provider` supplies protocol mechanics but the application owns the user interaction experience and account-security workflows.

## 13.1 Login

The login system shall provide:

- username/email + password authentication;
- rate limiting;
- credential-stuffing protection;
- account status checks;
- session creation;
- audit events.

Error responses must not disclose whether a particular account exists when doing so would enable account enumeration.

## 13.2 Registration

Registration shall:

- validate input;
- normalize fields according to an explicit identity policy;
- enforce uniqueness;
- hash credentials before persistence;
- create an audit event;
- optionally require email verification before the account becomes fully active.

## 13.3 Password reset

Password reset tokens must:

- be cryptographically random;
- be short-lived;
- be single-use;
- be invalidated after use;
- never contain the plaintext password;
- never be logged.

Password reset must revoke security state as required by policy, potentially including existing sessions/refresh grants after a successful reset.

## 13.4 Password change

Changing a password must require successful authentication and should provide a policy-controlled option to revoke other sessions.

## 13.5 Brute-force controls

Controls shall exist at multiple levels:

- IP/source;
- account/identity;
- client;
- tenant where applicable.

Rate limiting must not create an easy denial-of-service path against a targeted user.

---

# 14. Browser Session Security

The login browser session shall be independent from OAuth access tokens.

Session cookies shall use appropriate production security attributes:

- `HttpOnly`;
- `Secure`;
- appropriate `SameSite` behavior;
- narrow cookie path/domain;
- short-lived interaction state.

The service shall protect against:

- session fixation;
- CSRF;
- login CSRF;
- replay of expired interaction state;
- open redirects;
- clickjacking where applicable;
- cross-origin abuse.

Authorization requests must use and validate `state`.

OIDC requests must use and validate `nonce` where required by the selected flow/profile.

---

# 15. Identity Lifecycle and Downstream Synchronization

This is a major requirement missing from both original drafts.

Because the authentication service is independently deployed from the device-management/backend service, identity changes must be propagated reliably.

## 15.1 Required lifecycle events

At minimum:

```text
user.created
user.updated
user.disabled
user.enabled
user.deleted

tenant.created
tenant.updated
tenant.disabled
tenant.deleted

membership.created
membership.updated
membership.removed

credential.password_changed
session.revoked
grant.revoked
client.created
client.updated
client.disabled
```

## 15.2 Event envelope

Each event should contain:

```json
{
  "event_id": "evt_01...",
  "event_type": "user.disabled",
  "event_version": 1,
  "occurred_at": "2026-09-21T00:00:00Z",
  "producer": "auth-service",
  "tenant_id": "tenant_123",
  "subject_id": "user_456",
  "actor_id": "user_789",
  "correlation_id": "req_abc",
  "payload": {}
}
```

## 15.3 Reliability

Identity events must not be published using a fragile:

```text
DB transaction -> separate broker publish
```

sequence where the database commit can succeed while the event publish fails.

Use a transactional outbox or equivalent durable event-delivery strategy.

The consumer side must be idempotent.

The downstream device-management service must therefore be able to reconstruct/synchronize identity state without assuming events will always arrive exactly once.

## 15.4 Disable/delete semantics

For high-impact actions such as user disablement:

1. update authoritative identity state;
2. revoke relevant refresh grants/sessions;
3. publish the lifecycle event durably;
4. downstream services invalidate their cached identity state;
5. short-lived access tokens naturally age out.

For higher-security environments, resource servers may use introspection or a revocation/deny-list mechanism when immediate token invalidation is mandatory.

---

# 16. Authorization Boundary for the Device-Management Backend

The architecture shall keep **identity/authentication** and **business/resource authorization** separated while making the authenticated user's effective scope available to the backend.

```text
Auth Service
  ├── user identity
  ├── authentication
  ├── roles and scoped memberships
  ├── Partner / Customer hierarchy
  ├── OAuth/OIDC tokens
  └── identity lifecycle events

Device Backend
  ├── devices
  ├── device buckets
  ├── device ownership/association
  ├── resource-level permissions
  ├── device operations
  └── business authorization enforcement
```

The device backend shall not depend on direct password/database access to the auth service.

It should receive identity context through validated access tokens and synchronized identity lifecycle events.

The device backend remains the authoritative owner of device/domain data. The auth service establishes **who the caller is and what organizational scope/permissions the identity service has assigned**; the resource service must still verify that the requested device/bucket actually belongs to the caller's authorized Customer Group and that the requested action is permitted.

### 16.1 Mandatory authorization evaluation

A protected device operation should effectively evaluate:

```text
Authenticated principal
        ↓
Validate token
        ↓
Determine role + Partner/Customer scope
        ↓
Validate requested action
        ↓
Validate resource ownership / Customer Group
        ↓
Allow or deny
```

For example, a `CustomerAdmin` token that contains `customer_id = customer_A` must not be sufficient by itself to access `device_B` belonging to `customer_B`. The resource service must verify the device's authoritative ownership/association.

### 16.2 No IDOR / tenant-parameter trust

The following must never be considered an authorization mechanism:

```text
GET /customers/customer_B/devices
```

where `customer_B` is accepted merely because the caller supplied it.

The service must derive or validate the permitted scope from trusted principal data and enforce the scope in the database/resource query.

The auth service must therefore provide claims/scopes that are useful for authorization while the device backend remains responsible for final object-level access control.

The auth service must not become a synchronous dependency for every device API call unless an explicit introspection/high-assurance mode is chosen.

# 17. Administration API

OIDC protocol endpoints and administrative identity-management endpoints should be logically separated.

Possible administrative operations:

```text
POST   /admin/users
GET    /admin/users/:id
PATCH  /admin/users/:id
POST   /admin/users/:id/disable
POST   /admin/users/:id/enable
DELETE /admin/users/:id

POST   /admin/tenants
GET    /admin/tenants/:id
PATCH  /admin/tenants/:id

POST   /admin/tenants/:id/members
DELETE /admin/tenants/:id/members/:userId

POST   /admin/clients
GET    /admin/clients/:clientId
PATCH  /admin/clients/:clientId
POST   /admin/clients/:clientId/rotate-secret
POST   /admin/clients/:clientId/disable
```

These routes are examples of the management boundary, not OIDC-standard endpoints.

Administrative authorization must use a stronger security model than ordinary end-user application permissions.


## 17.1 Administrative Scope Rules

Administrative APIs must enforce the same hierarchy as ordinary resource access.

Examples:

```text
SuperAdmin
  -> /admin/partners/:partnerId/...

PartnerAdmin(partner_A)
  -> /admin/partners/partner_A/...
  -> /admin/partners/partner_A/customers/...
  -> MUST NOT access partner_B data

CustomerAdmin(customer_A)
  -> /admin/customers/customer_A/...
  -> MUST NOT access customer_B data
```

The path parameter is a resource locator, not an authorization grant. The server must derive the allowed scope from the authenticated principal and compare it with the target resource.

---

# 18. Observability and Audit

## 18.1 Structured logging

Logs must be structured JSON and include, where applicable:

- timestamp;
- severity;
- service name;
- request ID;
- correlation ID;
- client ID;
- user ID;
- tenant ID;
- operation;
- outcome;
- latency;
- error category.

Never log:

- passwords;
- refresh tokens;
- access tokens;
- authorization codes;
- client secrets;
- private signing keys;
- password-reset tokens.

## 18.2 Security audit events

Audit events should cover:

- login success/failure;
- logout;
- registration;
- password change;
- password reset;
- account lock/disable;
- token refresh;
- refresh-token reuse;
- token revocation;
- client creation/change;
- tenant membership changes;
- administrative actions;
- key rotation.

Audit records should be append-oriented and protected from casual modification.

## 18.3 Metrics

At minimum:

- login success/failure rate;
- authorization requests;
- token requests;
- refresh successes/failures;
- refresh-token reuse detections;
- revocations;
- active sessions;
- Redis latency/errors;
- PostgreSQL latency/errors;
- event publish failures;
- event consumer lag if observable by the service;
- HTTP error rate;
- p95/p99 latency.

---

# 19. Availability and Failure Behavior

The service shall fail closed for security-sensitive failures.

Examples:

### PostgreSQL unavailable

- Do not create/modify identities.
- Do not silently fall back to an empty or stale user store.
- Existing protocol operations behave according to the provider's safe failure semantics.

### Redis unavailable

- Do not generate or accept authentication state that cannot be safely persisted.
- Do not fall back to process memory for security state in production.

### Broker unavailable

If an identity transaction succeeds but event delivery is temporarily unavailable, the transaction must remain recoverable through the durable outbox.

### Key-management unavailable

Do not issue tokens with an unrelated fallback key.

---

# 20. Configuration and Secrets

Configuration must be schema-validated at startup.

Required categories include:

```text
ISSUER_URL
DATABASE_URL
REDIS_URL

COOKIE / SESSION settings
OIDC client registration configuration
token TTL policy
rate-limit policy

key-management configuration
broker / event configuration

logging / telemetry configuration
```

Rules:

- no production fallback secrets;
- no hardcoded passwords;
- no example secrets enabled in production;
- invalid security configuration must fail startup;
- environment-specific configuration must be explicit;
- secrets must come from a proper secret-management path in production.

The sample values in the original draft such as `fallback_secret_web_123` and `fallback_secret_mobile_456` must never exist in production code.

---

# 21. Deployment Requirements

The service shall support:

- HTTPS termination;
- reverse-proxy/load-balancer deployment;
- multiple application instances;
- graceful shutdown;
- readiness/liveness probes;
- rolling deployments;
- database migrations;
- Redis connection recovery;
- broker connection recovery;
- time synchronization.

The application must correctly configure trusted proxy behavior so that generated redirect/issuer URLs cannot be manipulated through untrusted forwarding headers.

---

# 22. Security Headers and Network Controls

The web-facing interaction layer should apply:

- HSTS in production;
- CSP appropriate to the login UI;
- `X-Content-Type-Options`;
- clickjacking protections;
- secure referrer policy;
- secure CORS policy.

CORS must be allowlist-based. Never use unrestricted credentials-enabled cross-origin access.

Internal administrative and management routes should be network-restricted where possible.

---

# 23. Data Protection and Retention

The service shall define retention policies for:

- audit logs;
- failed authentication events;
- revoked grants;
- expired sessions;
- event-outbox records;
- operational telemetry.

Personal data must be minimized.

Only claims required by the consuming client/resource should be issued.

Email and profile information should not automatically be copied into access tokens unless required.

---

# 24. External Identity Federation — Future Phase

The architecture must permit the local credential layer to coexist with external identity providers.

Future provider integrations may include:

```text
Google
Microsoft Entra ID
Okta
GitHub
Other OIDC providers
```

Federated login must not create duplicate local identities accidentally.

An explicit account-linking model is required:

```text
External Identity
    |
    +--> provider
    +--> issuer
    +--> subject
    |
    v
Local User
```

The external provider's `(issuer, subject)` pair must be treated as the stable external identity key.

---

# 25. Future MFA / Strong Authentication

The identity model should leave room for:

- TOTP;
- WebAuthn;
- passkeys;
- hardware security keys;
- recovery codes;
- step-up authentication.

Authentication methods should not be hardcoded into the user table.

A separate authentication-factor model is preferable.

---

# 26. API and Protocol Security Requirements

The service shall:

- require TLS for non-local deployments;
- reject unsupported grant types;
- reject unsupported response types;
- reject unknown clients;
- reject invalid redirect URIs;
- validate content types;
- enforce request size limits;
- apply rate limits;
- prevent parameter pollution where relevant;
- sanitize/log errors without secret disclosure;
- use constant-time comparisons where security-sensitive comparisons require them;
- protect secrets in memory as far as the runtime permits;
- keep dependencies patched and lock versions.

The OAuth endpoints must return standards-compliant error responses rather than custom ad-hoc HTTP error semantics.

---

# 27. Token Verification Requirements for Resource Services

Every downstream resource service must independently verify access tokens.

For JWT access tokens, it shall validate at least:

```text
signature
issuer (iss)
audience (aud)
expiration (exp)
not-before (nbf), when present
issued-at (iat), within acceptable clock tolerance
algorithm allowlist
scope
tenant context
```

It must not:

- trust only decoded payloads;
- accept `alg=none`;
- trust an arbitrary `jku`/key URL;
- accept tokens from another issuer;
- treat an ID token as an access token.

JWKS retrieval must use:

- HTTPS;
- caching;
- controlled refresh;
- rate limiting;
- safe unknown-`kid` handling.

---

# 28. Recommended Claim Strategy

## ID Token

Example:

```json
{
  "iss": "https://auth.example.com",
  "sub": "usr_123",
  "aud": "web_app",
  "iat": 1720000000,
  "exp": 1720000900,
  "name": "Gaurav Singh",
  "email": "gaurav@example.com",
  "email_verified": true,
  "nonce": "..."
}
```

## Access Token

Example conceptual payload:

```json
{
  "iss": "https://auth.example.com",
  "sub": "usr_123",
  "aud": "device-api",
  "scope": "device.read device.write",
  "tenant_id": "tenant_456",
  "iat": 1720000000,
  "exp": 1720000900,
  "jti": "..."
}
```

The exact claim set must be determined per client/resource and must not expose unnecessary personal data.

---

# 29. Testing Requirements

The implementation is not complete when the server starts successfully.

## 29.1 Unit tests

Cover:

- password hashing/verification;
- user/tenant/membership logic;
- token claim mapping;
- client configuration validation;
- refresh-token reuse policy;
- key selection;
- event construction;
- rate-limit rules.

## 29.2 Integration tests

Test:

- PostgreSQL persistence;
- Redis persistence;
- adapter lifecycle;
- login;
- authorization code issuance;
- authorization code redemption;
- PKCE;
- refresh rotation;
- refresh reuse;
- revocation;
- logout;
- user disablement;
- tenant membership changes;
- event outbox delivery.

## 29.3 Security tests

Test:

- invalid redirect URI;
- state mismatch;
- nonce mismatch;
- PKCE mismatch;
- authorization-code replay;
- refresh-token replay;
- token expiry;
- wrong issuer;
- wrong audience;
- wrong algorithm;
- unknown `kid`;
- session fixation;
- CSRF;
- open redirect;
- brute-force limits;
- account enumeration behavior;
- secret leakage in logs.

## 29.4 Failure tests

Simulate:

- PostgreSQL outage;
- Redis outage;
- broker outage;
- key-manager outage;
- network timeout;
- provider restart during an active login;
- concurrent refresh requests;
- duplicate event delivery;
- delayed event delivery;
- partial deployment during key rotation.

## 29.5 Conformance tests

Run standards/provider conformance tests appropriate to the deployed OIDC feature set.

---

# 30. Performance and Scalability

The service should be horizontally scalable.

Targets should be established through load testing rather than guessed.

Benchmark separately:

- authorization endpoint;
- login interaction;
- token endpoint;
- refresh endpoint;
- discovery/JWKS;
- admin APIs.

Redis and PostgreSQL connection pools must be sized for expected concurrency.

The design must avoid unnecessary database queries during token verification because resource services should normally validate JWT access tokens locally.

---

# 31. Initial Project Structure

A maintainable project may use a structure similar to:

```text
auth-service/
├── src/
│   ├── app/
│   │   ├── server.ts
│   │   ├── config.ts
│   │   └── routes.ts
│   │
│   ├── oidc/
│   │   ├── provider.ts
│   │   ├── clients.ts
│   │   ├── claims.ts
│   │   ├── interaction.ts
│   │   └── adapter/
│   │       ├── index.ts
│   │       └── redis.ts
│   │
│   ├── identity/
│   │   ├── user.service.ts
│   │   ├── credential.service.ts
│   │   ├── tenant.service.ts
│   │   └── membership.service.ts
│   │
│   ├── admin/
│   │   ├── user.routes.ts
│   │   ├── tenant.routes.ts
│   │   └── client.routes.ts
│   │
│   ├── security/
│   │   ├── password.ts
│   │   ├── rate-limit.ts
│   │   ├── csrf.ts
│   │   └── security-events.ts
│   │
│   ├── events/
│   │   ├── publisher.ts
│   │   ├── outbox.ts
│   │   └── schemas/
│   │
│   ├── db/
│   │   ├── client.ts
│   │   └── repositories/
│   │
│   ├── observability/
│   │   ├── logger.ts
│   │   ├── metrics.ts
│   │   └── tracing.ts
│   │
│   └── health/
│       └── routes.ts
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── scripts/
│   ├── generate-dev-keys.ts
│   └── rotate-keys.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── security/
│   └── conformance/
│
├── docker/
│   └── docker-compose.yml
│
├── .env.example
├── package.json
└── README.md
```

The exact structure can change; separation of protocol, identity, security, storage and event concerns must not.

---

# 32. Configuration Baseline

Conceptual provider configuration:

```ts
const oidcConfig = {
  adapter: OidcAdapter,

  clients: [
    {
      client_id: "web-app",
      client_secret: process.env.WEB_APP_CLIENT_SECRET,
      client_type: "confidential",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      redirect_uris: [
        "https://app.example.com/oauth/callback"
      ],
      scope: "openid profile email offline_access"
    },

    {
      client_id: "ios-app",
      client_type: "public",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      redirect_uris: [
        "https://app.example.com/ios/oauth/callback"
      ],
      scope: "openid profile email offline_access"
    }
  ],

  scopes: [
    "openid",
    "profile",
    "email",
    "offline_access"
  ],

  ttl: {
    AccessToken: 900,
    IdToken: 900,
    AuthorizationCode: 300,
    RefreshToken: 60 * 60 * 24 * 30
  },

  features: {
    devInteractions: false,
    pkce: {
      required: true
    },
    refreshTokenRotation: "rotateAndConsume",
    revocation: {
      enabled: true
    }
  }
};
```

This is a baseline, not production-ready configuration by itself. Client authentication methods, PKCE enforcement, token audiences, logout support, key management, cookie settings and storage adapter behavior must be explicitly verified against the selected `oidc-provider` version.

---

# 33. Environment and Deployment Separation

## Development

Development may allow:

- local HTTP;
- local generated development RSA keys;
- local Docker PostgreSQL;
- local Docker Redis;
- development interaction UI only when deliberately enabled.

## Staging

Staging must behave like production for:

- TLS;
- client configuration;
- key rotation;
- event delivery;
- logging;
- rate limiting;
- cookie security;
- database migrations.

## Production

Production must use:

- managed/HA PostgreSQL or equivalent;
- managed/HA Redis where required;
- production key-management;
- TLS;
- no development interactions;
- no fallback secrets;
- no wildcard redirects;
- restricted CORS;
- monitored audit/identity events;
- backups and recovery procedures.

---

# 34. Security Invariants

The following are non-negotiable invariants:

1. No plaintext passwords.
2. No hardcoded production secrets.
3. No production private keys committed to source control.
4. No implicit flow for application login.
5. No public/native client secret reliance.
6. PKCE `S256` for public clients.
7. Exact redirect URI matching.
8. Short-lived authorization codes.
9. Single-use authorization codes.
10. Rotating refresh tokens.
11. Refresh-token replay detection.
12. JWT access tokens validated against issuer, audience, algorithm and signature.
13. ID tokens are not accepted as API access credentials.
14. Tenant context is validated server-side.
15. User/tenant removal produces durable downstream events.
16. No security state stored only in process memory in production.
17. No secrets/tokens/passwords in application logs.
18. Key rotation retains old verification keys until token expiry.
19. Administrative identity operations are audited.
20. Role scope is always enforced together with Partner/Customer resource scope.
21. Partner isolation is enforced for PartnerAdmin/PartnerUser operations.
22. Customer isolation is enforced for CustomerAdmin/CustomerUser operations.
23. Object-level device/device-bucket ownership is verified by the resource service.
24. Authentication failure paths fail closed.

---

# 35. Corrections to the Original Drafts

The two supplied drafts are substantially aligned, but the following points required rectification.

## 35.1 Duplicate architecture/roadmap

Both drafts repeat the same:

- architecture diagram;
- PostgreSQL/Redis model;
- JWT/JWKS explanation;
- TTL configuration;
- refresh-token rotation;
- client configuration;
- `findAccount`;
- downstream JWKS verification.

These were consolidated into a single requirements model.

## 35.2 PostgreSQL vs MongoDB contradiction

One draft describes PostgreSQL as the persistent source of truth, while another mentions PostgreSQL/MongoDB.

**Resolved:** PostgreSQL is the baseline persistent identity database. MongoDB is not required.

## 35.3 “Access tokens MUST NOT be stored in Redis”

This is too absolute.

Whether an access token is persisted is an implementation/provider decision.

**Resolved:** JWT access tokens should normally be verified locally by resource servers, but the provider adapter may still persist metadata depending on revocation, introspection, grant and provider behavior.

## 35.4 “Refresh token MUST be in Redis”

This is also an implementation decision, not an OIDC requirement.

**Resolved:** the provider's persistent/transient artifact storage must be designed according to lifecycle, durability and revocation requirements.

## 35.5 Environment variable for private JWKS

The original design requires complete private JWKS via `OIDC_JWKS`.

**Resolved:** acceptable for local/dev, not the preferred production key-management design. Production should use a secrets manager/KMS/HSM or equivalent protected key-management system.

## 35.6 Mobile client secret

The draft gives the mobile app a `client_secret`.

**Resolved:** mobile/native apps are public clients and cannot keep a static shared secret confidential. Use Authorization Code + PKCE with an appropriate native redirect strategy.

Reference: RFC 8252.

## 35.7 PKCE was missing

The original flows did not explicitly require PKCE even though public/mobile clients are included.

**Resolved:** PKCE `S256` is required for public clients and should be supported/enforced appropriately.

## 35.8 Frontend decoding of ID tokens

The draft describes the frontend decoding the ID token to determine identity.

**Resolved:** a client may decode claims for display, but decoded JWT content must not be treated as proof of authenticity until the token has been properly validated. ID tokens are also not API authorization tokens.

## 35.9 Fixed TTLs

The drafts treat 15-minute/5-minute/30-day values as hard protocol rules.

**Resolved:** keep these as initial security-policy defaults. Lifetimes should be configurable by client/risk/profile.

## 35.10 Refresh-token replay response

The drafts describe destroying the old token and “dropping the entire session”.

**Resolved:** reuse handling must revoke the associated token chain/grant according to the provider's defined rotation semantics. The current `oidc-provider` documentation describes `rotateAndConsume` as revoking the whole token chain/grant when a consumed refresh token is encountered again.

## 35.11 Key ID generation

Generating `kid` using a timestamp on every invocation can create unstable key identity and is unsuitable for controlled key rotation.

**Resolved:** keys must have explicit versioned identifiers and a controlled rotation procedure.

## 35.12 Missing hierarchical Partner/Customer authorization model

The original drafts describe tenants and memberships but do not define the required hierarchy and role scopes.

**Resolved:** the requirements now explicitly model Platform → SuperAdmin (platform scope) and Platform → Partner Group → Customer Group → Users/Devices, with mandatory Partner/Customer isolation. SuperAdmins do not belong to Partner Groups.

## 35.13 Missing tenant/membership model

The drafts mainly describe users but do not model the user-to-organization/tenant relationship needed by the target architecture.

**Resolved:** tenant and membership are first-class identity-domain concepts.

## 35.14 Missing identity lifecycle propagation

The drafts do not define how a separately deployed backend learns that a user, tenant or membership was changed or removed.

**Resolved:** add durable identity lifecycle events with an outbox/event-bus model.

## 35.15 Missing user-security lifecycle

Important account workflows were absent:

- email verification;
- password reset;
- password change;
- session revocation;
- account disable/enable;
- audit events;
- brute-force protection.

**Resolved:** these are included as functional requirements.

## 35.16 Missing logout/revocation requirements

The drafts focus heavily on token issuance but lack a complete logout/revocation model.

**Resolved:** add revocation, RP-initiated logout and a defined back-channel logout strategy.

## 35.17 Missing resource audience model

The drafts describe scopes but do not sufficiently isolate multiple APIs.

**Resolved:** access tokens must be audience-restricted to their intended resource. RFC 8707 provides a standard resource-indicator model.

---


## 35.18 Role/permission policy gap

The required hierarchy defines who owns which scope, but the exact CRUD permissions for **PartnerUser** and the precise device/device-bucket operations allowed to **CustomerUser** are still policy decisions.

**Requirement:** implement a versioned permission catalog and role bindings first, then explicitly assign permissions per role/module/resource. Do not infer elevated permissions merely from membership in a higher-level tenant.

# 36. Acceptance Criteria

The Phase 1 implementation can be considered complete only when all of the following are demonstrated.

### Identity and Multitenancy

- A SuperAdmin can provision/manage multiple Partner Groups according to platform policy and is not a member of those Partner Groups.
- A SuperAdmin can create/manage Partner Admins.
- A PartnerAdmin can create/manage Partner Users only within the assigned Partner.
- A PartnerAdmin can create/manage Customer Groups only under the assigned Partner.
- A PartnerAdmin can create/manage Customer Admins and Customer Users only under the assigned Partner's Customer Groups.
- A CustomerAdmin can create/manage Customer Users only within the assigned Customer Group.
- CustomerAdmin and CustomerUser device/device-bucket access is restricted to the assigned Customer Group and configured permissions.
- PartnerAdmin/PartnerUser cannot cross into another Partner's scope.
- CustomerAdmin/CustomerUser cannot cross into another Customer Group's scope.
- SuperAdmin cross-Partner operations are audited.
- Tenant membership is enforced server-side and cannot be overridden by request parameters.
- Resource ownership/association is checked by the downstream resource service.
- Role permissions and tenant scope are evaluated together.

### OIDC

- Discovery returns correct metadata.
- Authorization Code Flow works end-to-end.
- PKCE `S256` works and invalid verifiers are rejected.
- `state`/`nonce` protections work.
- Authorization codes are single-use.
- ID Tokens contain correct issuer/audience/subject/lifetime semantics.

### OAuth tokens

- Access tokens are issued for the correct resource/audience.
- Refresh tokens rotate.
- Reuse of a consumed refresh token triggers the defined replay-response policy.
- Revocation works.
- Expired credentials are rejected.

### Clients

- Confidential client authentication works.
- Public/mobile clients do not rely on client secrets.
- Redirect URIs are exact-matched.
- Unauthorized grant/scope combinations are rejected.

### Security

- No plaintext password/token/secret appears in logs.
- Brute-force protections work.
- CSRF/session protections work.
- Key rotation works without breaking still-valid tokens.
- Unknown/untrusted issuers and audiences are rejected by resource services.

### Distributed identity

- User disable/delete generates a durable event.
- Membership removal generates a durable event.
- Downstream services consume events idempotently.
- Event delivery survives temporary broker failure through the outbox.

### Operations

- Multiple auth-service instances can run simultaneously.
- Restarting one instance does not destroy authentication state.
- Redis/PostgreSQL outage behavior is defined and safe.
- Health/readiness checks are exposed.
- Metrics and structured audit logs are available.
- Database migrations are repeatable and versioned.

---

# 37. Standards and Primary References

The implementation should be validated against the current applicable versions of:

1. **OpenID Connect Core 1.0** — identity layer over OAuth 2.0.
2. **OpenID Connect Discovery 1.0**.
3. **OAuth 2.0 Authorization Code Flow**.
4. **RFC 7636 — PKCE**.
5. **RFC 8252 — OAuth 2.0 for Native Apps**.
6. **RFC 9700 — OAuth 2.0 Security Best Current Practice**.
7. **RFC 7009 — OAuth 2.0 Token Revocation**.
8. **RFC 8707 — Resource Indicators for OAuth 2.0**.
9. **OpenID Connect RP-Initiated Logout** where logout is enabled.
10. **OpenID Connect Back-Channel Logout** where downstream logout propagation is enabled.
11. **`oidc-provider` version-specific documentation and conformance guidance**.

The OpenID Foundation approved a second errata set for the core/discovery/registration specifications in 2023, and the `oidc-provider` project continues to track current protocol features and releases. The deployed library version must therefore be pinned and its exact configuration API verified rather than relying on old examples.

---

# 38. Final Design Position

The resulting architecture is:

```text
                 ┌─────────────────────────────┐
                 │     Web / SPA / iOS / APIs  │
                 └──────────────┬──────────────┘
                                │
                         OIDC / OAuth 2.0
                                │
                                v
                 ┌─────────────────────────────┐
                 │       AUTH SERVICE          │
                 │                             │
                 │  Authentication             │
                 │  OIDC Provider              │
                 │  Session / Grant Lifecycle  │
                 │  Tenant Membership          │
                 │  Client Registry             │
                 │  Key/JWKS Management       │
                 │  Admin Identity API         │
                 │  Security Audit             │
                 └───────┬──────────┬──────────┘
                         │          │
                 ┌───────v───┐  ┌───v──────────┐
                 │ PostgreSQL │  │    Redis     │
                 │ durable    │  │ transient    │
                 │ identity  │  │ OIDC/session │
                 └───────┬───┘  └──────────────┘
                         │
                    transactional
                       outbox
                         │
                         v
                 ┌──────────────────┐
                 │ Event Bus / Kafka│
                 └────────┬─────────┘
                          │
          ┌───────────────┼────────────────┐
          v               v                v
   Device Backend    Other APIs       Admin/Services
```

The core design principle is that the auth service owns **identity and authentication state**, while downstream systems own **business resources and authorization**. Identity changes are propagated through durable events, while access-token validation remains local and scalable wherever JWTs are used.

