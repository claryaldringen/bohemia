import type { Dispute, DisputeRepository, NewDispute, Verdict } from '../disputes';

const pairKeyOf = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Spory v paměti – jediný nerozsouzený spor na dvojici a podmíněné zápisy jako v databázi. */
export class InMemoryDisputes implements DisputeRepository {
  readonly rows: Dispute[] = [];
  private nextId = 1;

  async file(input: NewDispute): Promise<Dispute | null> {
    await Promise.resolve();
    const key = pairKeyOf(input.plaintiffHouseId, input.defendantHouseId);
    const running = this.rows.some(
      (d) => d.status === 'filed' && pairKeyOf(d.plaintiffHouseId, d.defendantHouseId) === key,
    );
    if (running) return null;
    const dispute: Dispute = {
      ...input,
      id: `dispute-${this.nextId++}`,
      statement: null,
      status: 'filed',
      verdict: null,
      judgedDay: null,
      peaceUntilDay: null,
      brokenBy: [],
    };
    this.rows.push(dispute);
    return structuredClone(dispute);
  }

  async byId(id: string): Promise<Dispute | null> {
    await Promise.resolve();
    const found = this.rows.find((d) => d.id === id);
    return found ? structuredClone(found) : null;
  }

  async answer(id: string, statement: string): Promise<boolean> {
    await Promise.resolve();
    const found = this.rows.find((d) => d.id === id);
    if (!found || found.status !== 'filed' || found.statement !== null) return false;
    found.statement = statement;
    return true;
  }

  async judge(
    id: string,
    verdict: Verdict,
    day: number,
    peaceUntilDay: number | null,
  ): Promise<boolean> {
    await Promise.resolve();
    const found = this.rows.find((d) => d.id === id);
    if (!found || found.status !== 'filed') return false;
    Object.assign(found, {
      status: 'judged',
      verdict: structuredClone(verdict),
      judgedDay: day,
      peaceUntilDay,
    });
    return true;
  }

  async listOf(houseId: string, limit: number): Promise<Dispute[]> {
    await Promise.resolve();
    return this.rows
      .filter((d) => [d.lordHouseId, d.plaintiffHouseId, d.defendantHouseId].includes(houseId))
      .sort((a, b) => b.filedAt.getTime() - a.filedAt.getTime())
      .slice(0, limit)
      .map((d) => structuredClone(d));
  }

  async peaceBetween(a: string, b: string, day: number): Promise<Dispute | null> {
    await Promise.resolve();
    const key = pairKeyOf(a, b);
    const found = this.rows.find(
      (d) =>
        d.status === 'judged' &&
        pairKeyOf(d.plaintiffHouseId, d.defendantHouseId) === key &&
        d.peaceUntilDay !== null &&
        d.peaceUntilDay > day,
    );
    return found ? structuredClone(found) : null;
  }

  async markBroken(id: string, houseId: string): Promise<boolean> {
    await Promise.resolve();
    const found = this.rows.find((d) => d.id === id);
    if (!found || found.brokenBy.includes(houseId)) return false;
    found.brokenBy.push(houseId);
    return true;
  }
}
