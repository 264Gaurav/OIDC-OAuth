import type { User, UserStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { DbClient } from "./types.js";

export type CreateUserInput = {
  email: string;
  name: string;
  address: string;
  phone: string | null;
  status: UserStatus;
  passwordHash: string;
};

export function userRepository(db: DbClient = prisma) {
  return {
    findByEmail(email: string) {
      return db.user.findUnique({ where: { email } });
    },
    findById(id: string) {
      return db.user.findUnique({ where: { id } });
    },
    findByIdWithMemberships(id: string) {
      return db.user.findUnique({
        where: { id },
        include: { memberships: true, credential: true }
      });
    },
    findByEmailWithAuth(email: string) {
      return db.user.findUnique({
        where: { email },
        include: { memberships: true, credential: true }
      });
    },
    createWithCredential(input: CreateUserInput): Promise<User> {
      return db.user.create({
        data: {
          email: input.email,
          name: input.name,
          address: input.address,
          phone: input.phone,
          status: input.status,
          credential: { create: { passwordHash: input.passwordHash } }
        }
      });
    }
  };
}
