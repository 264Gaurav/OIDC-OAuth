import type { Membership, Role } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { membershipScopeKey, type Role as PolicyRole } from "../policy/roles.js";
import { AppError } from "../errors/app-error.js";
import { validateMembershipShape } from "../policy/claims.js";
import type { DbClient } from "./types.js";

export type CreateMembershipInput = {
  userId: string;
  role: Role;
  partnerId: string | null;
  customerId: string | null;
};

function toSnapshot(row: Membership) {
  return {
    id: row.id,
    userId: row.userId,
    role: row.role,
    partnerId: row.partnerId,
    customerId: row.customerId
  };
}

export function membershipRepository(db: DbClient = prisma) {
  return {
    toSnapshot,
    async create(input: CreateMembershipInput) {
      if (
        !validateMembershipShape({
          userId: input.userId,
          role: input.role,
          partnerId: input.partnerId,
          customerId: input.customerId
        })
      ) {
        throw new AppError(400, "Membership does not match the selected role");
      }
      return db.membership.create({
        data: {
          userId: input.userId,
          role: input.role,
          partnerId: input.partnerId,
          customerId: input.customerId,
          scopeKey: membershipScopeKey(input.role as PolicyRole, input.partnerId, input.customerId)
        }
      });
    },
    listByUser(userId: string) {
      return db.membership.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
    },
    findById(id: string) {
      return db.membership.findUnique({ where: { id } });
    },
    countByRole(role: Role) {
      return db.membership.count({ where: { role } });
    },
    findDuplicate(input: CreateMembershipInput) {
      return db.membership.findUnique({
        where: {
          userId_role_scopeKey: {
            userId: input.userId,
            role: input.role,
            scopeKey: membershipScopeKey(input.role as PolicyRole, input.partnerId, input.customerId)
          }
        }
      });
    }
  };
}
