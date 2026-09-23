# RBAC & ABAC Policy

Central authorization design for the MVP authentication platform. All services should import a **single policy module** (monorepo package or shared npm artifact)—not duplicate rules in routes or `.env`.

## Tenancy hierarchy

```text
Platform (scope: PLATFORM)
├── Partner Group (Partner entity, scope: PARTNER)
│   ├── Partner Admin / Partner User
│   └── Customer Group (Customer entity, scope: CUSTOMER)
│       ├── Customer Admin
│       └── Customer User
└── (more partners…)
```

- A **Customer** belongs to exactly one **Partner** (`Customer.partnerId`).
- **Super Admin** operates at platform scope; no partner/customer membership required.

## Roles and scope levels

| Role           | Scope level | Typical `partner_id` | Typical `customer_id` |
|----------------|-------------|----------------------|------------------------|
| `SUPER_ADMIN`  | `PLATFORM`  | null                 | null                   |
| `PARTNER_ADMIN`| `PARTNER`   | set                  | null                   |
| `PARTNER_USER` | `PARTNER`   | set                  | null                   |
| `CUSTOMER_ADMIN` | `CUSTOMER`| set (parent partner) | set                  |
| `CUSTOMER_USER`  | `CUSTOMER`| set (parent partner) | set                  |

## Provisioning rules (who can create what)

| Actor            | Can create                         | Cannot create                          |
|------------------|------------------------------------|----------------------------------------|
| **Partner Admin**| Customer groups under own partner; users as `CUSTOMER_ADMIN` or `CUSTOMER_USER` in those groups | Customer groups under other partners |
| **Customer Admin** | `CUSTOMER_USER` in own customer group only | Customer groups; `CUSTOMER_ADMIN`; users in other customers |
| **Customer User** | —                                | Any users or groups                    |

## Resource access

| Actor            | Manage resources              | Access resources        |
|------------------|-------------------------------|-------------------------|
| **Partner Admin**| Partner + customers under partner (product-defined) | Same (if allowed by product) |
| **Customer Admin** | Own customer group only   | Own customer group      |
| **Customer User**  | —                         | Own customer group      |

Server must **never** trust client-supplied `user_id`, `partner_id`, `customer_id`, or `role` for authorization. Use verified JWT claims plus resource attributes from the database.

## Policy module layout (single source of truth)

Runtime secrets stay in `env.ts`. Authorization rules live in a dedicated module, for example:

```text
auth_policy/   (or packages/auth-policy/)
  roles.ts           # role enum + scope level metadata
  actions.ts         # stable action identifiers
  rbac.matrix.ts     # role → allowed actions
  abac.rules.ts      # action-specific attribute checks
  attributes.ts      # subject + resource attribute names
  evaluate.ts        # authorize(ctx) → allow | deny
  claims.schema.ts   # JWT claim shape (Zod), shared with microservices
```

### Evaluation flow

1. **RBAC**: Is `subject.role` allowed to perform `action`?
2. **ABAC**: For that `action`, do all rules pass given `subject` claims and `resource` attributes?

Single public API for the app and microservices:

```text
authorize({ action, subject, resource }) → boolean
```

## Action catalog (stable IDs)

Use these across auth service and downstream microservices:

| Action                         | Description                          |
|--------------------------------|--------------------------------------|
| `customer_group.create`        | Create customer under a partner      |
| `member.invite.customer_admin` | Invite/assign CUSTOMER_ADMIN         |
| `member.invite.customer_user`  | Invite/assign CUSTOMER_USER          |
| `member.invite.partner_user`   | Invite/assign PARTNER_USER (optional) |
| `resource.manage`              | Administer resources in tenant       |
| `resource.read`                | Read/use resources in tenant         |

## RBAC matrix (baseline)

| Action                         | SUPER_ADMIN | PARTNER_ADMIN | PARTNER_USER | CUSTOMER_ADMIN | CUSTOMER_USER |
|--------------------------------|-------------|---------------|--------------|----------------|---------------|
| `customer_group.create`        | yes*        | yes           | no           | no             | no            |
| `member.invite.customer_admin` | yes*        | yes           | no           | no             | no            |
| `member.invite.customer_user`  | yes*        | yes           | no           | yes            | no            |
| `resource.manage`              | yes*        | yes**         | no**         | yes            | no            |
| `resource.read`                | yes*        | yes**         | yes**        | yes            | yes           |

\* Platform break-glass; define explicitly in product policy.  
\*\* Partner scope: only resources tagged with `partner_id` / customers under that partner—enforce in ABAC.

## ABAC rules (examples)

Subject attributes (from verified JWT):

- `userId` (`sub`)
- `role`
- `scope` (`PLATFORM` | `PARTNER` | `CUSTOMER`)
- `partnerId` (`partner_id` claim)
- `customerId` (`customer_id` claim)

Resource attributes (from DB / API payload after load):

- `partnerId`
- `customerId`

Example predicates:

- **`customer_group.create`**: `subject.role === PARTNER_ADMIN && resource.partnerId === subject.partnerId`
- **`member.invite.customer_user`** (Customer Admin): `subject.customerId === resource.customerId`
- **`member.invite.customer_user`** (Partner Admin): customer exists and `customer.partnerId === subject.partnerId`
- **`resource.read`**: `resource.customerId === subject.customerId` OR partner-admin rule on `resource.partnerId` / parent customer

## Persistence requirements

Membership is the source of truth (extend/fix `RoleAssignment` or rename to `Membership`):

- Foreign keys to `Partner` and `Customer`
- Constraints: partner roles require `partnerId`; customer roles require `customerId`; platform role has neither
- Optional: drop or demote sole reliance on `Partner.ownerId` / `Customer.ownerId` for authorization

## Microservice usage

1. Validate JWT (issuer, signature, expiry) via JWKS.
2. Parse claims with shared `claims.schema.ts`.
3. Map route/handler → `action`.
4. Load resource; call `authorize({ action, subject: claims, resource })`.

Route → action mapping may live per service; **rules must not**.

## Testing

Unit-test the policy module:

- Partner Admin cannot create customers on another partner
- Customer Admin cannot invite users to another customer
- Customer User denied all `member.*` and `resource.manage`
- ABAC failures when `resource.customerId` mismatches token

## Drift prevention

- One shared package imported by auth service and all microservices
- CI runs policy unit tests on every change
- Optional: export JSON snapshot for non-TypeScript services
