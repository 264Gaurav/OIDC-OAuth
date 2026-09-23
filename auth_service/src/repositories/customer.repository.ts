import { prisma } from "../db/prisma.js";
import type { DbClient } from "./types.js";

export function customerRepository(db: DbClient = prisma) {
  return {
    findById(id: string) {
      return db.customer.findUnique({ where: { id } });
    },
    create(name: string, partnerId: string, ownerId: string | null = null) {
      return db.customer.create({ data: { name, partnerId, ownerId } });
    }
  };
}
