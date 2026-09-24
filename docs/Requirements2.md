# Updated Requirements

## 1. Mission

Build and maintain this repository as a **standalone authentication and authorization service** using:

* Node.js
* TypeScript
* Express
* `oidc-provider`
* Prisma
* PostgreSQL
* Redis
* Logfire

The service is responsible for:

* Identity lifecycle
* User authentication
* Email verification
* Password reset
* Session and refresh-token lifecycle
* OAuth 2.0 / OpenID Connect
* PKCE
* Client management
* Tenant-aware identity context
* Role/scope-based authorization decisions
* Delegated administration
* Security/audit logging
* Security controls, rate limiting and abuse protection
* Operational health/readiness/metrics

Do **not** introduce Kafka, event brokers, device-management logic, business-domain resources, or unrelated infrastructure into this service during the current MVP.

The architecture must remain extensible for future MFA/WebAuthn/passkeys, federation, stronger client authentication, KMS/HSM-backed keys, and external event publishing.

---

## 2. Standards Baseline

Implementation must follow the applicable requirements and security guidance from:

* OAuth 2.0 Security Best Current Practice — RFC 9700
* OAuth 2.0 for Browser-Based Applications — RFC 10017
* OAuth 2.0 Authorization Code Grant
* OAuth 2.0 PKCE — RFC 7636
* OpenID Connect Core
* OAuth 2.0 Authorization Server Metadata / Discovery
* OAuth 2.0 Token Revocation
* OAuth 2.0 Authorization Server security requirements
* OWASP ASVS 5.0
* OWASP authentication/session/authorization/logging guidance
* NIST SP 800-63B for authentication and session-management principles

Treat these as engineering requirements, not documentation-only references.

Do not claim that this implementation is legally or organizationally "GDPR compliant", "DPDP compliant", "ISO compliant", "SOC 2 compliant", etc. Technical controls can support such compliance, but actual compliance also requires organizational processes, policies, governance, evidence and audits.

---

# 3. Core Security Principles

The implementation MUST follow these rules:

1. Never trust client-controlled authorization context.
2. Authentication and authorization are separate concerns.
3. Role names alone are never sufficient for authorization.
4. Tenant ownership MUST be derived server-side.
5. No security-critical correctness state may depend on process-local memory.
6. Access tokens MUST be short-lived.
7. Refresh tokens MUST be protected against replay/reuse.
8. Passwords MUST never be logged or stored reversibly.
9. Secrets/tokens MUST never be logged.
10. Authorization failures MUST be auditable.
11. Security-sensitive administrative operations MUST be auditable.
12. All security-sensitive inputs MUST be validated.
13. Fail closed on authorization/security ambiguity.
14. Errors must not expose implementation details or sensitive state.
15. Security controls must be applied consistently across authentication paths.
16. Cryptographic keys MUST be managed separately from application source/configuration.
17. Security-sensitive operations must be safe under concurrent requests.
18. All externally reachable endpoints must have explicit authentication/authorization/rate-limit requirements.
19. Do not add custom OAuth flows when an existing standardized flow is appropriate.
20. Do not create a second public authentication protocol competing with OIDC.

---

# 4. Current Client Model

The service must support the following client categories.

## Public Clients

Examples:

* React SPA
* iOS application
* Native/mobile application
* Other installed applications
* Browser-based third-party public clients

Requirements:

* OAuth 2.0 Authorization Code flow
* PKCE required
* PKCE method: `S256`
* No client secret
* Exact registered redirect URI matching
* Authorization code is single-use
* Authorization code expires quickly
* State/nonce protections must be supported as applicable
* No implicit grant
* No password grant
* Never place access tokens in authorization URLs

A SPA MUST NOT contain a client secret and the authorization server must not treat a statically distributed SPA secret as proof of client identity.

## Confidential Clients

Examples:

* Server-side web application
* Backend service
* Trusted server application

Requirements:

* Authorization Code flow
* PKCE supported and preferably required
* Client authentication required
* Support appropriate client authentication methods
* `client_id` + `client_secret` may be supported
* Architecture must allow migration to stronger methods such as `private_key_jwt` or mTLS
* Client secrets must never be logged or exposed to public clients

## Resource Servers

Resource services must validate:

* Issuer
* Signature
* Signing key
* Audience
* Expiration
* Not-before where applicable
* Required claims
* Tenant context
* Required scopes/permissions

Resource services remain responsible for enforcing business-resource authorization.

The auth service must not assume that issuing a token automatically grants access to every resource.

---

# 5. Authentication Architecture

## OIDC is the primary application authentication mechanism

Applications must authenticate through:

`Authorization Endpoint -> Login/Consent -> Authorization Code -> Token Endpoint -> ID Token + Access Token`

For public/browser/native clients:

`Authorization Code + PKCE(S256)`

Do not use custom `/api/auth/login` as the general application login protocol.

Custom `/api/auth/*` endpoints may exist for controlled identity-management operations such as:

* Registration
* Email verification
* Password reset
* Session management
* Administrative account management
* Internal account lifecycle operations

They must not become an alternative uncontrolled token-issuance protocol.

Authentication security controls must be consistent across every authentication pathway.

---

# 6. PKCE Requirements

PKCE is mandatory for public clients.

The authorization server MUST:

* Support PKCE
* Support `S256`
* Advertise supported PKCE methods in authorization-server metadata
* Require PKCE for public clients
* Correctly bind authorization code to the PKCE transaction
* Verify the token request's `code_verifier`
* Reject incorrect verifier values
* Reject verifier downgrade attempts
* Reject a `code_verifier` when the corresponding authorization transaction did not contain a valid challenge
* Prevent reuse of authorization codes
* Expire unused authorization codes quickly
* Keep PKCE transaction state server-side or in the OIDC provider's secure state mechanism

`plain` MUST NOT be enabled unless there is an explicitly documented, justified compatibility requirement and compensating controls.

Default implementation target:

`code_challenge_method = S256`

---

# 7. Redirect URI Security

Redirect URI validation MUST be strict.

Requirements:

* Redirect URI must be pre-registered.
* Matching must not use arbitrary prefix matching.
* No wildcard domains.
* No wildcard paths.
* No arbitrary query components.
* Do not allow attacker-controlled redirect destinations.
* Normalize/compare according to the relevant OAuth/OIDC specification.
* Native application redirect URI rules must follow the applicable native-app requirements.

Never accept arbitrary `redirect_uri` values supplied by a client.

---

# 8. OIDC Discovery

Expose standards-compliant metadata.

Discovery must correctly expose at minimum the supported:

* Issuer
* Authorization endpoint
* Token endpoint
* UserInfo endpoint
* JWKS URI
* Revocation endpoint where implemented
* Supported response types
* Supported grant types
* Supported scopes
* Supported claims
* PKCE methods
* Supported authentication methods

Discovery configuration must describe the actual capabilities of the server.

Do not advertise a feature that the implementation does not securely support.

---

# 9. OpenID Connect ID Tokens

ID tokens must:

* Be signed with approved asymmetric signing algorithms
* Contain the correct `iss`
* Contain the correct `sub`
* Contain the correct `aud`
* Validate expiration
* Validate issued-at semantics
* Use nonce validation where required by the client flow
* Avoid unnecessary sensitive claims
* Never contain secrets

Do not expose private signing keys through JWKS or any API.

---

# 10. JWKS and Key Management

Use asymmetric signing keys.

Public keys:

* May be published through JWKS.
* Must contain only public material.

Private keys:

* Must never be exposed through HTTP.
* Must never be logged.
* Must never be committed to Git.
* Must not be embedded in client bundles.
* Must not be stored in source code.

Support:

* Active signing key
* Previous verification keys
* `kid`
* Key rotation
* Graceful rotation
* Old-key verification during rollover

Architecture must support future:

* KMS
* HSM
* Managed key storage

Development keys and production keys must be separated.

Startup should fail safely when required signing configuration is missing.

---

# 11. Identity Lifecycle

User lifecycle must explicitly model account state.

Minimum states:

* `PENDING_EMAIL_VERIFICATION`
* `ACTIVE`
* `DISABLED`
* `DELETED` or hard-deleted according to lifecycle policy

Registration flow:

1. Validate input.
2. Normalize email/username according to policy.
3. Check uniqueness.
4. Hash password with Argon2id.
5. Create account as `PENDING_EMAIL_VERIFICATION`.
6. Generate high-entropy verification secret.
7. Store only a secure hash of the verification secret.
8. Send verification email through an email provider abstraction.
9. Do not issue normal authenticated access before verification unless there is a clearly documented exception.
10. Activate only after successful verification.

Unverified accounts must expire after 48 hours.

Expiration cleanup must:

* Remove pending account/authentication data that is no longer required.
* Revoke associated sessions/tokens.
* Remove verification material.
* Be idempotent.
* Be safe under concurrent execution.

Audit records required for security/governance purposes must not automatically be deleted merely because the pending account is deleted. Apply an explicit retention policy.

---

# 12. Email Verification

Verification tokens must:

* Be generated using a cryptographically secure random generator.
* Be single-use.
* Expire.
* Be stored only as a hash.
* Be invalidated after successful use.
* Never appear in logs.

Resend verification must:

* Rotate the old token.
* Invalidate previous verification tokens.
* Be rate-limited.
* Avoid account enumeration.

Do not return different externally visible messages that reveal whether a specific email exists.

---

# 13. Password Requirements

Passwords must be hashed using Argon2id.

Never:

* Store plaintext passwords.
* Encrypt passwords reversibly.
* Log passwords.
* Return passwords from APIs.
* Return password hashes to clients.

Password policy must include:

* Minimum length appropriate for the deployment security level
* Maximum reasonable input size to prevent resource abuse
* Secure Unicode/normalization handling where applicable
* Password breach/password deny-list support as a future hardening option

Do not impose arbitrary composition rules when they reduce usability without increasing security.

---

# 14. Forgot Password / Password Reset

Implement:

`POST /api/auth/forgot-password`

and a reset completion endpoint.

Forgot-password behavior:

* Always return a generic response.
* Do not reveal whether the account exists.
* Generate a cryptographically secure random reset secret.
* Store only a hash.
* Set a short expiration.
* Make the token single-use.
* Send reset instructions through the email provider abstraction.
* Rate-limit requests.

Reset behavior:

1. Validate reset token.
2. Ensure it is unexpired.
3. Ensure it has not already been consumed.
4. Update password using Argon2id.
5. Atomically mark reset token as consumed.
6. Revoke all refresh sessions for the user.
7. Revoke/invalidates applicable session state.
8. Require fresh authentication for new sessions.
9. Audit the security event.

Existing short-lived access tokens may remain cryptographically valid until expiration unless token-version/introspection infrastructure is introduced. Therefore access tokens must have short lifetimes.

---

# 15. Refresh Token Security

Refresh tokens are high-value credentials.

Implement refresh-token rotation and reuse detection.

Requirements:

* Refresh tokens must be high entropy.
* Do not log them.
* Store only a secure representation/hash where practical.
* Bind token state to a refresh session/family.
* Rotate on refresh.
* Invalidate the previous refresh token after successful rotation.
* Detect reuse of an already-rotated token.
* On confirmed reuse/replay, revoke the affected refresh-token family/session according to policy.
* Handle concurrent refresh requests safely.
* Use transactional/atomic logic to prevent double-use races.
* Expire refresh sessions.
* Support explicit logout/revocation.
* Support revoke-all-sessions after password reset.
* Track creation time, last-used time, expiration and revocation state.

Do not treat a refresh token as an ordinary database row with no replay protections.

---

# 16. Session Management

Authentication sessions must have explicit lifecycle controls.

Track where applicable:

* Session ID
* User ID
* Client ID
* Creation time
* Last-used time
* Expiry time
* Revocation time
* Authentication method
* Tenant context
* Device/session metadata that is safe to retain

Support:

* Logout
* Logout all sessions
* Session expiration
* Revocation
* Password-reset-triggered revocation
* Account disable-triggered revocation

Do not depend on process memory for session correctness.

NIST session-management guidance must be treated as a design baseline for session lifetime and reauthentication policies.

---

# 17. Tenant and Organization Hierarchy

The service must enforce this hierarchy:

```text
Platform
├── SuperAdmins
└── Partner Groups
    ├── Partner Admins
    ├── Partner Users
    └── Customer Groups
        ├── Customer Admins
        └── Customer Users
```

Customers belong to exactly one Partner through their Customer Group.

---

# 18. SuperAdmin

SuperAdmin:

* Is a platform-level administrator.
* Is NOT a member of a Partner Group.
* Has `PLATFORM` administrative scope.
* Can create Partner Groups.
* Can create/manage Partner Admins.
* Can inspect/manage platform-level partner resources/modules as permitted.
* Can manage platform configuration/administrative operations according to policy.

SuperAdmin must not accidentally be represented as a normal partner member.

Never allow a normal Partner or Customer administrator to grant SuperAdmin privileges.

SuperAdmin bootstrap must be an explicit deployment/bootstrap operation.

Do not expose a public "create SuperAdmin" endpoint.

---

# 19. Partner Administration

Partner Admin:

* Belongs to exactly one Partner Group.
* Can manage their own Partner.
* Can create Partner Users within their partner.
* Can create Customer Groups under their partner.
* Can create Customer Admins within those customer groups.
* Can create Customer Users within those customer groups.
* Can manage only resources belonging to their partner/customer hierarchy.

Partner Admin MUST NOT:

* Create users under another partner.
* Create SuperAdmins.
* Modify another partner.
* Move customers between partners without explicit privileged workflow.
* Escalate their own role.
* Grant roles beyond their authority.
* Modify authorization boundaries directly.

---

# 20. Customer Administration

Customer Admin:

* Belongs to exactly one Customer Group.
* Can create/manage Customer Users inside that Customer Group.
* Can manage allowed resources assigned to that customer.
* Cannot manage another Customer Group.
* Cannot manage the owning Partner itself.
* Cannot grant higher-level roles.
* Cannot change tenant ownership.

---

# 21. Customer Users

Customer Users:

* Belong to one Customer Group.
* Access only explicitly permitted resources.
* Must be checked against both membership and resource permissions.

A role by itself must never grant unrestricted access.

---

# 22. Authorization Model

Effective authorization must be evaluated as:

```text
Identity
+ Role
+ Membership
+ Scope
+ Action
+ Target Resource
+ Explicit Permission
+ Tenant Ownership
= Authorization Decision
```

Authorization must be performed server-side.

Never trust:

* `partner_id` supplied by the browser
* `customer_id` supplied by the browser
* role supplied by the browser
* permissions supplied by the browser
* ownership fields supplied by the browser

Example:

```text
Requested Customer -> Customer Group -> Partner Group
```

The server must derive the parent Partner through database relationships.

---

# 23. Authorization Scope

Use explicit scopes similar to:

```text
PLATFORM
PARTNER(partner_id)
CUSTOMER(customer_id)
```

Rules:

* SuperAdmin -> `PLATFORM`
* Partner-scoped administrators/users -> `PARTNER(partner_id)`
* Customer-scoped administrators/users -> `CUSTOMER(customer_id)`

The token may contain minimal context such as:

```text
sub
client_id
scope
roles
partner_id
customer_id
tenant/context identifier
```

Only include claims that are actually needed.

Do not place a large authorization model inside the JWT.

---

# 24. Context Switching

If the system supports switching between valid membership contexts:

* User must already possess that membership.
* Server must validate the membership.
* User must not be able to manufacture a context.
* User must not be able to select a different partner/customer arbitrarily.
* Context changes must be auditable.
* Context-switch tokens/session state must have clear expiration and revocation behavior.
* A context switch must never elevate permissions beyond the user's actual memberships.

Example:

```text
User
 -> memberships
 -> select valid membership/context
 -> server validates membership
 -> issue/update context
```

Never:

```text
client sends customer_id
 -> trust customer_id
```

---

# 25. Delegated Administration

Hierarchical administration is intentional.

Every privileged operation must follow:

```text
Authenticated Actor
        ↓
Identity
        ↓
Membership
        ↓
Role
        ↓
Administrative Scope
        ↓
Target Resource
        ↓
Tenant Ownership
        ↓
Action Permission
        ↓
Allow / Deny
        ↓
Audit Event
```

All checks must happen server-side.

Do not use a single `isAdmin` boolean as the primary authorization mechanism.

Prefer explicit policy/service functions such as:

```ts
authorizeCreateCustomerGroup(...)
authorizeCreateCustomerUser(...)
authorizeManagePartner(...)
authorizeAssignRole(...)
authorizeManageMembership(...)
```

Keep authorization logic centralized and testable.

---

# 26. Role Assignment Rules

Role assignment must enforce hierarchy.

A requester may assign only roles that are explicitly permitted by their own administrative authority.

The server must prevent:

* Self-role escalation
* Privilege escalation
* Cross-tenant role assignment
* SuperAdmin creation by lower roles
* Assigning Partner-level roles from Customer scope
* Assigning users to unauthorized groups
* Moving memberships across unauthorized boundaries

All role changes must be audited.

---

# 27. Database Requirements

PostgreSQL is the source of durable identity state.

Prisma must enforce:

* Primary keys
* Foreign keys
* Unique constraints
* Required fields
* Appropriate indexes
* Referential integrity
* Transaction boundaries

At minimum, the data model should represent concepts equivalent to:

```text
User
Credential
PartnerGroup
PartnerMembership
CustomerGroup
CustomerMembership
Role
Permission
RolePermission
RefreshSession
AuthorizationCode / OIDC state as required by oidc-provider
EmailVerificationToken
PasswordResetToken
Audit/SecurityEvent
OIDCClient
```

Do not duplicate security state unnecessarily.

Use normalized relationships for tenant hierarchy.

All tenant relationships must be enforceable by the database model.

---

# 28. Database Transactions

Use transactions for security-sensitive multi-step mutations.

Examples:

* User creation + membership creation
* Role change + membership update
* Password reset + token consumption + session revocation
* Refresh-token rotation
* Account disable + session revocation
* Membership removal + security state changes

The operation must not reach a partially committed authorization state.

Make retries safe and idempotent where appropriate.

---

# 29. Redis Requirements

Redis may be used for:

* Temporary OIDC state
* Authorization transaction state
* Rate limiting
* Short-lived security state
* Replay protection
* Distributed coordination where necessary

Redis must not become the only durable source for critical identity records.

All Redis keys must:

* Have explicit TTLs where temporary.
* Follow predictable namespaces.
* Avoid user-controlled unbounded key creation.
* Be safe against collision.
* Avoid storing raw secrets unnecessarily.

---

# 30. Rate Limiting and Abuse Protection

Rate-limit security-sensitive endpoints.

At minimum:

* Login
* Registration
* Email verification
* Verification resend
* Forgot password
* Password reset
* Token endpoint
* Refresh endpoint
* Authorization endpoint where appropriate
* Client abuse
* Administrative mutation endpoints

Use distributed rate limiting where multiple service instances can run.

Do not implement naive account lockouts that allow attackers to permanently deny service to users.

Protection should consider:

* IP
* Account/email identifier
* Client
* Endpoint
* Authentication state
* Tenant
* Time window

Use generic responses where rate limiting/account existence could otherwise leak information.

---

# 31. Account Enumeration Protection

These operations must not reveal sensitive account existence information:

* Login
* Registration
* Forgot password
* Email verification resend

Use generic responses where appropriate.

Do not create obvious timing/status-code differences unnecessarily.

---

# 32. HTTP Security

Express configuration must include appropriate security controls.

Implement:

* TLS in deployment
* Secure headers
* Content Security Policy where applicable
* HSTS in HTTPS deployment
* Correct MIME handling
* `X-Content-Type-Options`
* Appropriate framing protection
* Secure cookie configuration where cookies are used
* `Secure`
* `HttpOnly`
* Appropriate `SameSite`
* Request size limits
* Strict input validation
* Safe error handling

Do not expose stack traces in production.

---

# 33. CORS

CORS must be explicit.

Do not use:

```text
Access-Control-Allow-Origin: *
```

for credentialed authentication flows.

Configure a strict allow-list for trusted origins.

Do not dynamically reflect arbitrary `Origin` values.

SPA/OIDC configuration must explicitly identify valid frontend origins.

---

# 34. CSRF

Apply CSRF protections where browser cookies are used.

For OAuth/OIDC:

* PKCE
* `state`
* `nonce` where applicable
* strict redirect URI handling
* secure browser session handling

must be implemented according to the relevant flow.

Do not assume CORS alone prevents CSRF.

---

# 35. Input Validation

Every external request must be validated.

Validate:

* Body
* Query
* Path parameters
* Headers where security-sensitive
* OAuth parameters
* Redirect URIs
* Client identifiers
* Scopes
* Roles
* Membership IDs
* Tokens/codes

Prefer schema-based validation.

Reject unexpected fields for security-sensitive operations where practical.

Do not trust validated syntax alone; perform authorization/business-rule checks separately.

---

# 36. Error Handling

External API errors must:

* Be consistent
* Avoid stack traces
* Avoid SQL errors
* Avoid Redis internals
* Avoid secrets
* Avoid token values
* Avoid password information
* Avoid user enumeration where applicable

Internal errors should include correlation/request IDs.

Do not return sensitive debugging information in production.

---

# 37. Logging and Audit

Logging/auditing is mandatory.

Use Logfire for structured security and operational observability.

Security events must include appropriate fields such as:

```text
timestamp
event_type
result
actor_id
target_id
client_id
partner_id
customer_id
request_id
correlation_id
source/IP metadata where policy permits
reason/category
```

Use UTC timestamps.

Audit important authentication and authorization activity.

Minimum event categories should include:

```text
LOGIN_SUCCESS
LOGIN_FAILURE
LOGOUT
REFRESH_SUCCESS
REFRESH_FAILURE
REFRESH_REUSE_DETECTED

REGISTRATION_STARTED
EMAIL_VERIFICATION_REQUESTED
EMAIL_VERIFIED
EMAIL_VERIFICATION_FAILED

PASSWORD_RESET_REQUESTED
PASSWORD_RESET_COMPLETED
PASSWORD_CHANGED

ACCOUNT_ENABLED
ACCOUNT_DISABLED
ACCOUNT_DELETED

MEMBER_CREATED
MEMBER_REMOVED
MEMBERSHIP_CHANGED

ROLE_ASSIGNED
ROLE_CHANGED
ROLE_REMOVED

PARTNER_CREATED
CUSTOMER_CREATED
CUSTOMER_GROUP_CREATED

AUTHORIZATION_ALLOWED
AUTHORIZATION_DENIED

PRIVILEGED_ACTION
RATE_LIMIT_TRIGGERED
SUSPICIOUS_ACTIVITY

TOKEN_REUSE_DETECTED
KEY_ROTATED
```

Do not blindly log every request body.

---

# 38. Data That Must Never Be Logged

Never log:

* Passwords
* Password hashes
* Access tokens
* Refresh tokens
* Authorization codes
* PKCE `code_verifier`
* Reset tokens
* Email-verification tokens
* Client secrets
* Private signing keys
* Private client-authentication keys
* Session secrets
* Cookie values
* Authorization headers containing bearer credentials

Redact secrets in nested objects as well.

Logging middleware must sanitize before export.

---

# 39. Authorization Auditability

For every important authorization denial, retain enough structured information to answer:

```text
Who?
What action?
Against which resource?
Under which tenant/context?
Which role/membership?
Allow or deny?
Why?
When?
Which client/request?
```

Do not log sensitive credential material while recording the decision.

---

# 40. Observability

Provide:

* Liveness endpoint
* Readiness endpoint
* Application health
* Database health
* Redis health
* OIDC dependency/configuration checks
* Structured logs
* Request/correlation IDs
* Latency metrics
* Authentication metrics
* Error metrics
* Security-event metrics

Health endpoints must not leak secrets/configuration.

Readiness must fail when required dependencies make the service incapable of safely operating.

---

# 41. API Layer

Use clear separation:

```text
routes
  ↓
controllers
  ↓
services/use-cases
  ↓
authorization/policy
  ↓
repositories/data access
  ↓
Prisma/PostgreSQL
```

Security-sensitive business logic must not be embedded directly in route handlers.

Keep OIDC protocol handling separate from administrative CRUD logic.

---

# 42. Suggested Route Organization

Use the repository's `routes/` directory.

Example:

```text
src/
├── app/
├── routes/
│   ├── health.routes.ts
│   ├── auth.routes.ts
│   ├── users.routes.ts
│   ├── partners.routes.ts
│   ├── customers.routes.ts
│   ├── memberships.routes.ts
│   ├── sessions.routes.ts
│   └── admin.routes.ts
├── oidc/
├── middleware/
├── authorization/
├── services/
├── repositories/
├── prisma/
├── config/
├── security/
├── audit/
├── utils/
└── types/
```

Do not create unnecessary architectural layers merely for abstraction.

Use the simplest structure that preserves security and testability.

---

# 43. Custom Authentication Endpoints

Custom authentication endpoints may include:

```text
POST /api/auth/register
POST /api/auth/verify-email
POST /api/auth/resend-verification
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/logout
POST /api/auth/logout-all
GET  /api/auth/sessions
DELETE /api/auth/sessions/:id
```

These endpoints are for identity/session-management functionality.

Applications should use OIDC Authorization Code + PKCE for normal application authentication.

Do not expose a general-purpose custom endpoint that accepts username/password and directly returns OAuth-equivalent bearer tokens to arbitrary clients.

---

# 44. OIDC Provider Endpoints

`oidc-provider` must be treated as the standards-compliant protocol surface.

At minimum verify correct behavior for:

```text
/.well-known/openid-configuration
/oidc/auth
/oidc/token
/oidc/userinfo
/oidc/jwks
/oidc/revoke
```

Use the library's supported standards rather than reimplementing protocol behavior unnecessarily.

Do not bypass `oidc-provider`'s security model without a documented reason and tests.

---

# 45. Account Resolution

OIDC account resolution must return the correct user identity.

Do not silently choose an arbitrary/default tenant when multiple valid memberships materially affect authorization.

The OIDC architecture must define how tenant context is represented:

* client-specific requested context,
* authenticated session context,
* membership selection,
* or another explicit server-validated mechanism.

Whatever mechanism is chosen:

* The user must actually possess the membership.
* The server must validate the membership.
* Context must not be client-forged.
* Context changes must be auditable.
* Tokens must reflect only the authorized context.

---

# 46. Claims

Claims should be minimal and purpose-driven.

Common claims may include:

```text
sub
iss
aud
exp
iat
scope
roles
email
email_verified
partner_id
customer_id
```

Do not put sensitive internal database data into tokens.

Do not expose internal authorization structures unnecessarily.

`email_verified` must reflect the actual account state.

Never hard-code:

```text
email_verified: false
```

for every account.

---

# 47. Token Validation

Where JWT access tokens are used:

* Validate issuer.
* Validate audience.
* Validate signature.
* Validate algorithm.
* Validate key ID.
* Validate expiration.
* Validate not-before where applicable.
* Validate required scopes.
* Validate relevant tenant claims.
* Reject unexpected algorithms.
* Reject malformed tokens.
* Reject tokens intended for another resource server.

Do not blindly decode JWT payloads and trust their contents.

---

# 48. Access Token Lifetime

Access tokens should be short-lived.

Do not use long-lived access tokens merely to simplify client behavior.

Session continuation must primarily use securely managed refresh sessions or renewed authorization according to the client architecture.

Short access-token lifetime is especially important because immediate invalidation of an already-issued self-contained JWT is difficult without additional state/introspection/versioning.

---

# 49. Client Registration

MVP may use static/admin-managed client registration.

Client records should contain concepts such as:

```text
client_id
client_type
redirect_uris
allowed_grant_types
allowed_response_types
allowed_scopes
token_endpoint_auth_method
client_secret_hash where applicable
status
created_at
updated_at
```

For public clients:

* No secret requirement
* Exact redirect URIs
* PKCE required

For confidential clients:

* Require configured client authentication
* Never return client secrets unnecessarily
* Store client secrets securely, preferably as hashes when the design permits secret verification

Dynamic client registration can remain out of MVP scope.

---

# 50. Password and Credential Changes

Changing a password must:

* Require appropriate authentication or verified recovery flow.
* Hash with Argon2id.
* Revoke refresh sessions according to policy.
* Audit the event.
* Avoid exposing credentials.

Sensitive administrative changes should require fresh authentication/step-up authentication when the future assurance model supports it.

Architecture must allow future MFA/step-up requirements.

---

# 51. Account Disable/Delete

Disabling an account must:

* Prevent new authentication.
* Revoke active refresh sessions.
* Prevent new authorization where applicable.
* Be auditable.

Deleting an account must:

* Follow explicit retention policy.
* Remove or anonymize personal/security data according to policy.
* Revoke sessions.
* Invalidate associated credentials.
* Preserve only records that must legally/operationally be retained.

Do not use cascading deletion blindly for security/audit tables.

---

# 52. Concurrency and Race Conditions

Security-sensitive operations must be safe under concurrent requests.

Test races such as:

* Two refresh requests using the same token
* Two password reset requests
* Two verification attempts
* Two membership deletion requests
* Concurrent role updates
* Concurrent disable/delete operations
* Concurrent creation of duplicate accounts
* Concurrent context switches

Use:

* Database transactions
* Unique constraints
* Atomic state transitions
* Appropriate locks/isolation
* Idempotency where appropriate

Never rely on:

```ts
if (!exists) {
  create();
}
```

without database protection against concurrent creation.

---

# 53. Secret Management

Never commit:

* Database credentials
* Redis credentials
* Client secrets
* Signing private keys
* Email provider secrets
* API keys
* Production configuration secrets

Use environment variables/secrets management for deployment.

Validate required environment variables during startup.

Do not silently fall back to insecure defaults in production.

Development defaults must be clearly separated from production configuration.

---

# 54. Dependency Security

Use maintained dependencies.

Perform:

* Dependency lockfile management
* Security audit where supported
* Dependency updates
* Vulnerability monitoring
* Removal of unused dependencies

Do not add a dependency merely for trivial functionality that can be implemented safely with existing tooling.

When adding security-sensitive packages, verify maintenance, compatibility and security posture.

---

# 55. Test Requirements

Security functionality must be tested at unit, integration and end-to-end levels as appropriate.

Minimum authentication tests:

* Valid login
* Invalid password
* Unknown account
* Unverified account
* Disabled account
* Email verification
* Expired verification
* Reused verification token
* Forgot password
* Reset password
* Expired reset token
* Reused reset token
* Session revocation
* Logout
* Logout all

PKCE tests:

* Missing PKCE rejected for public client
* `S256` accepted
* Correct verifier accepted
* Wrong verifier rejected
* Missing verifier rejected
* Verifier supplied without challenge rejected
* PKCE downgrade attempt rejected
* Reused authorization code rejected

OAuth/OIDC tests:

* Discovery
* JWKS
* Authorization
* Token exchange
* UserInfo
* Audience validation
* Issuer validation
* Expiration validation
* Redirect URI rejection
* Unsupported grant rejection
* Unsupported response type rejection
* Invalid client authentication
* Scope validation
* Consent/authorization behavior
* Logout/revocation

Authorization tests:

* SuperAdmin platform access
* Partner Admin own-partner access
* Partner Admin cross-partner denial
* Partner Admin customer creation
* Customer Admin own-customer access
* Customer Admin cross-customer denial
* Customer User permission enforcement
* Role escalation denial
* Tenant spoofing denial
* Ownership mismatch denial
* Deleted/disabled membership denial

Security tests:

* SQL injection attempts
* XSS payloads
* CSRF scenarios
* Enumeration resistance
* Rate limits
* Refresh-token replay
* Authorization-code replay
* Session fixation
* Invalid JWT algorithms
* Invalid signatures
* Expired tokens
* Wrong audience
* Wrong issuer
* Secret leakage checks

---

# 56. OIDC Conformance

Where practical, run OIDC/OAuth interoperability and conformance-oriented tests.

Do not consider an endpoint complete merely because the happy path works.

Negative protocol behavior is equally important.

Every supported flow must have:

```text
success tests
+
invalid-input tests
+
authorization tests
+
replay tests
+
expiration tests
+
concurrency tests
```

---

# 57. Test Fixtures

Do not use real credentials or secrets in tests.

Use deterministic test identities only where safe.

Test data should cover:

```text
SuperAdmin
Partner 1
Partner 2
Partner Admin
Partner User
Customer Group 1
Customer Group 2
Customer Admin
Customer User
Multiple memberships
Disabled user
Pending user
Expired account
Revoked session
```

Explicitly test cross-tenant access.

---

# 58. Migration Safety

Database migrations must be:

* Version-controlled
* Reproducible
* Forward-compatible where practical
* Safe for deployment
* Free from accidental destructive operations

Never modify production schema manually as the normal workflow.

Do not silently delete existing security data during migration.

---

# 59. Performance Without Sacrificing Security

Optimize only after preserving correctness.

Important areas:

* Database indexes on identity/tenant/membership lookup
* Efficient membership authorization queries
* Redis TTL state
* OIDC transaction storage
* Connection pooling
* Avoiding unnecessary DB round trips
* Avoiding huge JWTs

Do not cache authorization decisions indefinitely.

Authorization caches must have explicit invalidation/expiration semantics.

When memberships or roles are removed, stale authorization state must not survive beyond the explicitly accepted security window.

---

# 60. Stateless Application Tier

Express instances should be horizontally scalable.

Do not rely on:

```text
global variables
in-memory sessions
in-memory refresh tokens
in-memory authorization state
```

for correctness.

Shared state belongs in:

* PostgreSQL
* Redis
* Proper key-management infrastructure

as appropriate.

---

# 61. Security Headers and Middleware Ordering

Middleware order must be deliberate.

Recommended conceptual order:

```text
request ID / correlation ID
↓
security headers
↓
body/parser limits
↓
CORS
↓
rate limiting
↓
request validation
↓
authentication
↓
authorization
↓
route handler
↓
centralized error handler
```

Adjust ordering where a protocol specifically requires otherwise.

Do not allow authentication/authorization bypass due to middleware ordering.

---

# 62. Sensitive Administrative APIs

Administrative APIs must explicitly define:

* Required role
* Required scope
* Allowed target tenant
* Allowed target resource
* Allowed actions
* Audit event

Example:

```text
POST /partners
    PLATFORM only

POST /partners/:partnerId/customers
    Partner Admin for :partnerId
    OR PLATFORM

POST /customers/:customerId/users
    Customer Admin for :customerId
    OR authorized higher-level administrator
```

The path parameter is a lookup identifier, not proof of authorization.

---

# 63. No Client-Supplied Authorization Context

This is forbidden:

```ts
const { partnerId } = req.body;
authorize(req.user, partnerId);
```

unless `partnerId` is independently verified against the authenticated user's authorized context.

Correct pattern:

```text
authenticated actor
        ↓
load membership
        ↓
derive authorized partner/customer
        ↓
load requested resource
        ↓
verify ownership relationship
        ↓
authorize action
```

---

# 64. Security-Sensitive State Transitions

Use explicit state machines for:

### User

```text
PENDING_EMAIL_VERIFICATION
        ↓
ACTIVE
        ↓
DISABLED
        ↓
ACTIVE
        ↓
DELETED
```

### Refresh Session

```text
ACTIVE
  ↓
ROTATED
  ↓
REVOKED
```

### Verification/Reset Token

```text
ISSUED
  ↓
CONSUMED
or
EXPIRED
or
REVOKED
```

Do not represent security lifecycle entirely through ambiguous booleans.

---

# 65. Audit Event Design

Create a central audit/security-event service rather than writing ad hoc logs throughout controllers.

Example:

```ts
audit.record({
  eventType,
  actorId,
  targetId,
  clientId,
  partnerId,
  customerId,
  requestId,
  result,
  reason,
});
```

The audit service must sanitize fields before exporting to Logfire.

Audit failure handling must be explicitly designed.

For security-critical audit requirements, do not silently swallow persistent audit failures without a documented policy.

---

# 66. Privacy and Data Minimization

Collect only identity/security data that is required.

Avoid storing:

* unnecessary device fingerprints
* unnecessary IP history
* unnecessary personal attributes
* unnecessary token payloads
* unnecessary request bodies

Sensitive operational metadata must have explicit retention rules.

Security logs should contain enough context for investigation without becoming a credential/data dump.

---

# 67. Production Configuration

Production must:

* Require HTTPS
* Use secure cookies where cookies are used
* Disable verbose errors
* Require strong signing keys
* Require real secret values
* Use production PostgreSQL
* Use protected Redis
* Restrict CORS
* Configure trusted proxy behavior correctly
* Configure log export securely
* Apply database least privilege
* Apply Redis least privilege
* Disable development/debug routes
* Disable insecure protocol options

---

# 68. Local Development

Local development may use:

* Docker PostgreSQL
* Docker Redis
* Development signing keys
* Local email/dev-mail capture

Development infrastructure must not accidentally become the production configuration.

Never commit real credentials.

---

# 69. What Must NOT Be Added in Current MVP

Do not add unless explicitly requested:

* Kafka
* Event brokers
* Device management
* IoT business logic
* Business-domain authorization services
* MFA
* WebAuthn
* Passkeys
* Google federation
* Microsoft Entra federation
* Okta federation
* GitHub federation
* Dynamic client registration
* Device Authorization Grant
* Token Exchange
* DPoP
* mTLS
* Policy-engine infrastructure
* Complex microservice decomposition
* Unnecessary background workers
* Unnecessary message queues

The architecture must allow future extension without implementing these now.

---

# 70. Future Extension Points

Design clean interfaces for future:

```text
Authentication Providers
 ├── Password
 ├── Google
 ├── Microsoft Entra
 ├── Okta
 └── GitHub

Authentication Factors
 ├── Password
 ├── TOTP
 ├── WebAuthn
 └── Passkeys

Client Authentication
 ├── Client Secret
 ├── private_key_jwt
 └── mTLS

Key Management
 ├── Local development keys
 ├── KMS
 └── HSM
```

Do not implement these until required.

---

# 71. Coding Rules for Security-Critical Code

Prefer:

```text
explicit > implicit
server-derived > client-provided
transactional > multi-step non-atomic
deny-by-default > allow-by-default
short-lived > long-lived
validated > assumed
audited > invisible
standards-based > custom protocol
```

Security decisions must be easy to locate in the codebase.

Do not hide authorization decisions inside utility functions with unclear semantics.

Do not duplicate authorization logic in many controllers.

---

# 72. Definition of Done

A feature is NOT complete until all applicable items are satisfied:

* Functional implementation
* Input validation
* Authentication requirement
* Authorization requirement
* Tenant-isolation checks
* Rate limiting where applicable
* Audit event where applicable
* Secret/token redaction
* Error handling
* Transaction/concurrency handling
* Database constraints
* Unit tests
* Integration tests
* Negative security tests
* Documentation/comments for non-obvious security decisions
* No debug/security-sensitive logging
* No unnecessary dependencies

---

# 73. Mandatory Security Review Before Handoff

Before considering the service production-ready, verify:

```text
[ ] Passwords use Argon2id
[ ] Email verification is real and enforced
[ ] Pending accounts expire after 48h
[ ] Verification tokens are hashed and single-use
[ ] Password reset exists
[ ] Password reset revokes refresh sessions
[ ] Refresh token rotation works
[ ] Refresh token reuse detection works
[ ] Authorization codes are single-use and short-lived
[ ] PKCE S256 is enforced for public clients
[ ] PKCE downgrade attacks are rejected
[ ] Redirect URIs are strictly validated
[ ] Public clients have no secrets
[ ] Confidential client authentication is enforced
[ ] Discovery is correct
[ ] JWKS exposes only public keys
[ ] Key rotation works
[ ] JWT issuer/audience/signature/expiry are validated
[ ] Tenant ownership is server-derived
[ ] Cross-partner access is denied
[ ] Cross-customer access is denied
[ ] Role escalation is denied
[ ] Delegated administration is scope-limited
[ ] Security events are logged to Logfire
[ ] Credentials/tokens/secrets are never logged
[ ] Login/reset/verification endpoints are rate-limited
[ ] Account enumeration is mitigated
[ ] CORS is allow-listed
[ ] CSRF protections are applied where required
[ ] Secure headers are enabled
[ ] Production errors do not leak internals
[ ] No process-local security state is required
[ ] PostgreSQL constraints protect identity integrity
[ ] Concurrency/replay tests pass
[ ] OIDC/OAuth negative tests pass
[ ] Dependency/security checks pass
```

---

# 74. Agent Working Rules

When modifying this project:

1. Inspect existing implementation before creating new abstractions.
2. Preserve working standards-compliant behavior.
3. Do not duplicate models, routes, authentication mechanisms or security logic.
4. Prefer incremental changes.
5. Do not silently weaken security to make a test pass.
6. Do not bypass authorization checks for convenience.
7. Do not trust identifiers coming from clients without server-side ownership validation.
8. Add tests for every security-sensitive behavior.
9. Run relevant tests after changes.
10. Keep current MVP scope small.
11. Record important security decisions in code comments/documentation.
12. Treat OIDC protocol behavior as standards-critical code.
13. Treat tenant isolation as security-critical code.
14. Treat audit logging as a mandatory security capability.
15. Never log secrets while debugging.
16. Never commit generated production secrets/keys.
17. When unsure between two implementations, prefer the standards-compliant and security-preserving behavior.

---

# 75. Final Architectural Rule

The authentication service must establish **who the user is**, **how they authenticated**, **which memberships/scopes they possess**, and **which standardized tokens/claims represent that identity**.

It must not assume that identity alone determines business-resource access.

The final authorization model is:

```text
Identity
    +
Authentication Strength
    +
Role
    +
Membership
    +
Tenant Scope
    +
Action
    +
Target Resource
    +
Explicit Permission
    ↓
Authorization Decision
    ↓
Audit Event
```

The system must fail closed whenever any required security relationship cannot be established.

---

## Standards References

Use the current versions of:

* RFC 9700 — OAuth 2.0 Security Best Current Practice
* RFC 10017 — OAuth 2.0 for Browser-Based Applications
* RFC 7636 — Proof Key for Code Exchange
* OpenID Connect Core 1.0
* OAuth 2.0 Authorization Server Metadata
* OAuth 2.0 Token Revocation
* OWASP ASVS 5.0
* NIST SP 800-63B

These standards are the protocol/security baseline; application governance, privacy, compliance, retention and operational controls must be handled separately.
