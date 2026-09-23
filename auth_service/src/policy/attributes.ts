import type { Role, ScopeLevel } from "./roles.js";

export type SubjectAttrs = {
  userId: string;
  role: Role;
  scope: ScopeLevel;
  partnerId: string | null;
  customerId: string | null;
};

export type ResourceAttrs = {
  partnerId?: string | null;
  customerId?: string | null;
};
