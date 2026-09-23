import { prisma } from "../db/prisma.js";
import type { DbClient } from "./types.js";

export function partnerRepository(db: DbClient = prisma) {
  return {
    findById(id: string) {
      return db.partner.findUnique({ where: { id } });
    },
    create(name: string, ownerId: string | null = null) {
      return db.partner.create({ data: { name, ownerId } });
    }
  };
}
