# RBAC & ABAC Policy

Central authorization for this service lives in `auth_service/src/policy/`. Import that module instead of duplicating role checks in routes.

## Tenancy hierarchy

```text
Platform (SUPER_ADMIN)
└── Partner group
    ├── PARTNER_ADMIN / PARTNER_USER
    └── Customer group
        ├── CUSTOMER_ADMIN
        └── CUSTOMER_USER
```

A customer belongs to one partner. Super admins have no partner/customer membership.

## Evaluation

1. **RBAC** (`rbac.matrix.ts`): is this role allowed to perform the action?
2. **ABAC** (`abac.rules.ts`): do subject claims match the resource tenant?

Call `authorize({ action, subject, resource })` from services. HTTP handlers must not implement extra permission logic.

## Provisioning

| Actor | Can create |
|-------|------------|
| Super Admin | Partners (with a partner admin), any invite allowed by the matrix |
| Partner Admin | Customer groups under own partner; `CUSTOMER_ADMIN` / `CUSTOMER_USER`; `PARTNER_USER` |
| Customer Admin | `CUSTOMER_USER` in own customer group only |
| Customer User | Nothing |

Resource **manage** is admin roles in-scope; resource **read** includes customer users in their group and partner users in their partner.

See [auth.md](./auth.md) for JWT claims.
