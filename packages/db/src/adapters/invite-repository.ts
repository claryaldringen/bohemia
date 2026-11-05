import { and, desc, eq, gt, isNull, or, ne } from 'drizzle-orm';
import type { Invite, InviteRepository } from '@bohemia/game';
import type { Database } from '../client';
import { inviteCode } from '../schema';

type InviteRow = typeof inviteCode.$inferSelect;

function toInvite(row: InviteRow): Invite {
  return { ...row };
}

/** Drizzle adaptér portu InviteRepository. */
export function createInviteRepository(db: Database): InviteRepository {
  return {
    async issue(input): Promise<Invite | null> {
      // Kolize primárního klíče = kód už existuje, use-case zkusí jiný.
      const [row] = await db.insert(inviteCode).values(input).onConflictDoNothing().returning();
      return row ? toInvite(row) : null;
    },
    async find(code): Promise<Invite | null> {
      const [row] = await db.select().from(inviteCode).where(eq(inviteCode.code, code)).limit(1);
      return row ? toInvite(row) : null;
    },
    async revoke(code, issuerId, at): Promise<boolean> {
      const rows = await db
        .update(inviteCode)
        .set({ revokedAt: at })
        .where(
          and(
            eq(inviteCode.code, code),
            eq(inviteCode.issuerId, issuerId),
            isNull(inviteCode.usedBy),
            isNull(inviteCode.revokedAt),
          ),
        )
        .returning({ code: inviteCode.code });
      return rows.length > 0;
    },
    async listOf(issuerId): Promise<Invite[]> {
      const rows = await db
        .select()
        .from(inviteCode)
        .where(eq(inviteCode.issuerId, issuerId))
        .orderBy(desc(inviteCode.createdAt));
      return rows.map(toInvite);
    },
    async reserve(code, userId, now): Promise<'ok' | 'invalid'> {
      // Jediný podmíněný UPDATE: ze souběžných rezervací uspěje jedna (druhá vidí už cizí rezervaci).
      const rows = await db
        .update(inviteCode)
        .set({ reservedBy: userId, reservedAt: now })
        .where(
          and(
            eq(inviteCode.code, code),
            isNull(inviteCode.revokedAt),
            isNull(inviteCode.usedBy),
            gt(inviteCode.validUntil, now),
            ne(inviteCode.issuerId, userId),
            or(isNull(inviteCode.reservedBy), eq(inviteCode.reservedBy, userId)),
          ),
        )
        .returning({ code: inviteCode.code });
      return rows.length > 0 ? 'ok' : 'invalid';
    },
    async consumeReservation(userId, now): Promise<Invite | null> {
      const [candidate] = await db
        .select({ code: inviteCode.code })
        .from(inviteCode)
        .where(
          and(
            eq(inviteCode.reservedBy, userId),
            isNull(inviteCode.usedBy),
            isNull(inviteCode.revokedAt),
          ),
        )
        .orderBy(desc(inviteCode.reservedAt))
        .limit(1);
      if (!candidate) return null;
      // Podmínka v UPDATE zaručí, že kód využije jen jedno z více souběžných volání.
      const [row] = await db
        .update(inviteCode)
        .set({ usedBy: userId, usedAt: now })
        .where(
          and(
            eq(inviteCode.code, candidate.code),
            eq(inviteCode.reservedBy, userId),
            isNull(inviteCode.usedBy),
            isNull(inviteCode.revokedAt),
          ),
        )
        .returning();
      return row ? toInvite(row) : null;
    },
  };
}
