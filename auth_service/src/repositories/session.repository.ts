import { prisma } from "../db/prisma.js";
import type { DbClient } from "./types.js";

export function sessionRepository(db: DbClient = prisma) {
  return {
    create(input: { userId: string; membershipId: string; tokenHash: string; expiresAt: Date }) {
      return db.refreshSession.create({ data: input });
    },
    findByTokenHash(tokenHash: string) {
      return db.refreshSession.findUnique({
        where: { tokenHash },
        include: {
          user: true,
          membership: true
        }
      });
    },
    revoke(id: string) {
      return db.refreshSession.update({ where: { id }, data: { revokedAt: new Date() } });
    },
    revokeByTokenHash(tokenHash: string) {
      return db.refreshSession.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }
  };
}
