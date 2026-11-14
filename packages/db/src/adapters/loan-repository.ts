import { and, eq, sql } from 'drizzle-orm';
import { scheduleValue, type Loan, type LoanRepository } from '@bohemia/game';
import type { Executor } from '../client';
import { loan } from '../schema';

type Row = typeof loan.$inferSelect;

function toLoan(row: Row): Loan {
  return {
    id: row.id,
    negotiationId: row.negotiationId,
    creditorHouseId: row.creditorHouseId,
    debtorHouseId: row.debtorHouseId,
    creditorVillageId: row.creditorVillageId,
    debtorVillageId: row.debtorVillageId,
    principal: row.principal,
    schedule: row.schedule,
    paidKg: row.paidKg,
    breaches: row.breaches,
    status: row.status,
    sinceAt: row.sinceAt,
    sinceDay: row.sinceDay,
    settledAt: row.settledAt,
  };
}

/** Drizzle adaptér portu LoanRepository (vassalage.md – Pomoc na žádost). */
export function createLoanRepository(db: Executor): LoanRepository {
  const active = eq(loan.status, 'active');
  return {
    async create(input): Promise<Loan> {
      // jedinečné `negotiation_id`: druhé přijetí téhož jednání vrátí první půjčku
      const [row] = await db
        .insert(loan)
        .values(input)
        .onConflictDoNothing({ target: loan.negotiationId })
        .returning();
      if (row) return toLoan(row);
      const [existing] = await db
        .select()
        .from(loan)
        .where(eq(loan.negotiationId, input.negotiationId))
        .limit(1);
      if (!existing) throw new Error('Půjčku se nepodařilo založit.');
      return toLoan(existing);
    },
    async cancelOfNegotiation(negotiationId, at): Promise<boolean> {
      const rows = await db
        .update(loan)
        .set({ status: 'cancelled', settledAt: at })
        .where(and(eq(loan.negotiationId, negotiationId), active))
        .returning({ id: loan.id });
      return rows.length > 0;
    },
    async ofNegotiation(negotiationId): Promise<Loan | null> {
      const [row] = await db
        .select()
        .from(loan)
        .where(eq(loan.negotiationId, negotiationId))
        .limit(1);
      return row ? toLoan(row) : null;
    },
    async byId(id): Promise<Loan | null> {
      const [row] = await db.select().from(loan).where(eq(loan.id, id)).limit(1);
      return row ? toLoan(row) : null;
    },
    async allActive(): Promise<Loan[]> {
      return (await db.select().from(loan).where(active)).map(toLoan);
    },
    async activeOfDebtor(houseId): Promise<Loan[]> {
      const rows = await db
        .select()
        .from(loan)
        .where(and(eq(loan.debtorHouseId, houseId), active));
      return rows.map(toLoan);
    },
    async pay(id, valueKg, at): Promise<Loan | null> {
      const [before] = await db
        .select()
        .from(loan)
        .where(and(eq(loan.id, id), active))
        .limit(1);
      if (!before) return null;
      // přičtení v jednom UPDATE (souběžné splátky se nepřepíšou); splaceno při dosažení celku
      const total = scheduleValue(before.schedule);
      const [row] = await db
        .update(loan)
        .set({
          paidKg: sql`${loan.paidKg} + ${valueKg}`,
          status: sql`CASE WHEN ${loan.paidKg} + ${valueKg} >= ${total - 1e-6} THEN 'repaid' ELSE 'active' END`,
          settledAt: sql`CASE WHEN ${loan.paidKg} + ${valueKg} >= ${total - 1e-6} THEN ${at.toISOString()}::timestamptz ELSE NULL END`,
        })
        .where(and(eq(loan.id, id), active))
        .returning();
      return row ? toLoan(row) : null;
    },
    async addBreach(id): Promise<boolean> {
      const rows = await db
        .update(loan)
        .set({ breaches: sql`${loan.breaches} + 1` })
        .where(and(eq(loan.id, id), active))
        .returning({ id: loan.id });
      return rows.length > 0;
    },
    async moveCredits(fromHouseId, debtorHouseId, toHouseId): Promise<string[]> {
      const rows = await db
        .update(loan)
        .set({ creditorHouseId: toHouseId })
        .where(
          and(eq(loan.creditorHouseId, fromHouseId), eq(loan.debtorHouseId, debtorHouseId), active),
        )
        .returning({ id: loan.id });
      return rows.map((r) => r.id);
    },
    async cancelOfDebtor(houseId, at): Promise<string[]> {
      const rows = await db
        .update(loan)
        .set({ status: 'cancelled', settledAt: at })
        .where(and(eq(loan.debtorHouseId, houseId), active))
        .returning({ id: loan.id });
      return rows.map((r) => r.id);
    },
  };
}
