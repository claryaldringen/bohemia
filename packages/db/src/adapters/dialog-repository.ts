import { and, asc, eq, sql } from 'drizzle-orm';
import type { Dialog, DialogKind, DialogRepository, DialogStatus } from '@bohemia/game';
import type { Database } from '../client';
import { dialog } from '../schema';

type Row = typeof dialog.$inferSelect;

function toDialog(row: Row): Dialog {
  return {
    id: row.id,
    playerId: row.playerId,
    kind: row.kind as DialogKind,
    key: row.key,
    refId: row.refId,
    year: row.year,
    years: row.years,
    body: row.body,
    status: row.status as DialogStatus,
    createdAt: row.createdAt,
  };
}

/** Drizzle adaptér portu DialogRepository (vassalage.md – Roční dialog 1. 11.). */
export function createDialogRepository(db: Database): DialogRepository {
  return {
    async openOnce(key, input) {
      const [row] = await db
        .insert(dialog)
        .values({
          playerId: input.playerId,
          kind: input.kind,
          key,
          refId: input.refId,
          year: input.year,
          body: input.body,
        })
        .onConflictDoNothing({ target: dialog.key })
        .returning();
      return row ? toDialog(row) : null;
    },
    async openFor(refId, kind) {
      const [row] = await db
        .select()
        .from(dialog)
        .where(and(eq(dialog.refId, refId), eq(dialog.kind, kind), eq(dialog.status, 'open')))
        .limit(1);
      return row ? toDialog(row) : null;
    },
    async bumpYears(key, toYear) {
      const [before] = await db.select().from(dialog).where(eq(dialog.key, key)).limit(1);
      if (!before || before.status !== 'open' || before.year >= toYear) return 0;
      // podmíněně na dosavadním roce – souběžné volání rok přičte jen jednou
      const updated = await db
        .update(dialog)
        .set({ years: sql`${dialog.years} + ${toYear - before.year}`, year: toYear })
        .where(and(eq(dialog.key, key), eq(dialog.status, 'open'), eq(dialog.year, before.year)))
        .returning({ id: dialog.id });
      return updated.length > 0 ? toYear - before.year : 0;
    },
    async listOpen(playerId) {
      const rows = await db
        .select()
        .from(dialog)
        .where(and(eq(dialog.playerId, playerId), eq(dialog.status, 'open')))
        .orderBy(asc(dialog.createdAt), asc(dialog.id));
      return rows.map(toDialog);
    },
    async byId(id) {
      const [row] = await db.select().from(dialog).where(eq(dialog.id, id)).limit(1);
      return row ? toDialog(row) : null;
    },
    async answer(id, expectedStatus, reply) {
      const updated = await db
        .update(dialog)
        .set({
          status: 'answered',
          answeredAt: new Date(),
          ...(reply ? { body: sql`${dialog.body} || ${JSON.stringify(reply)}::jsonb` } : {}),
        })
        .where(and(eq(dialog.id, id), eq(dialog.status, expectedStatus)))
        .returning({ id: dialog.id });
      return updated.length > 0;
    },
    async listFor(refId, kind) {
      const rows = await db
        .select()
        .from(dialog)
        .where(and(eq(dialog.refId, refId), eq(dialog.kind, kind)))
        .orderBy(asc(dialog.createdAt), asc(dialog.id));
      return rows.map(toDialog);
    },
    async openOfKind(kind) {
      const rows = await db
        .select()
        .from(dialog)
        .where(and(eq(dialog.kind, kind), eq(dialog.status, 'open')))
        .orderBy(asc(dialog.createdAt), asc(dialog.id));
      return rows.map(toDialog);
    },
    async lapse(id) {
      const updated = await db
        .update(dialog)
        .set({ status: 'dropped' })
        .where(and(eq(dialog.id, id), eq(dialog.status, 'open')))
        .returning({ id: dialog.id });
      return updated.length > 0;
    },
    async dropOpenOf(playerId) {
      await db
        .update(dialog)
        .set({ status: 'dropped' })
        .where(and(eq(dialog.playerId, playerId), eq(dialog.status, 'open')));
    },
    async dropFor(refId) {
      await db
        .update(dialog)
        .set({ status: 'dropped' })
        .where(and(eq(dialog.refId, refId), eq(dialog.status, 'open')));
    },
  };
}
