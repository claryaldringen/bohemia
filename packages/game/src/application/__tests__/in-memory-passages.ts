import type { NewPassage, Passage, PassageRepository } from '../passages';

/** Ohlášené průchody v paměti – podmíněná odpověď jako v databázi. */
export class InMemoryPassages implements PassageRepository {
  readonly rows: Passage[] = [];
  private nextId = 1;

  async announce(input: NewPassage): Promise<Passage> {
    await Promise.resolve();
    const passage: Passage = {
      ...structuredClone(input),
      id: `passage-${this.nextId++}`,
      trust: null,
      reply: null,
      answeredAt: null,
      voidedAt: null,
    };
    this.rows.push(passage);
    return structuredClone(passage);
  }

  async byId(id: string): Promise<Passage | null> {
    await Promise.resolve();
    const found = this.rows.find((p) => p.id === id);
    return found ? structuredClone(found) : null;
  }

  async answer(id: string, trust: boolean, reply: string | null, at: Date): Promise<boolean> {
    await Promise.resolve();
    const found = this.rows.find((p) => p.id === id);
    if (!found || found.answeredAt !== null || found.voidedAt !== null) return false;
    Object.assign(found, { trust, reply, answeredAt: at });
    return true;
  }

  async validBetween(fromHouseId: string, toHouseId: string): Promise<Passage[]> {
    await Promise.resolve();
    return structuredClone(
      this.rows.filter(
        (p) => p.fromHouseId === fromHouseId && p.toHouseId === toHouseId && p.voidedAt === null,
      ),
    );
  }

  async openTo(toHouseId: string): Promise<Passage[]> {
    await Promise.resolve();
    return structuredClone(
      this.rows.filter(
        (p) => p.toHouseId === toHouseId && p.voidedAt === null && p.answeredAt === null,
      ),
    );
  }

  async voidBetween(a: string, b: string, at: Date): Promise<number> {
    await Promise.resolve();
    let n = 0;
    for (const p of this.rows) {
      const pair =
        (p.fromHouseId === a && p.toHouseId === b) || (p.fromHouseId === b && p.toHouseId === a);
      if (pair && p.voidedAt === null) {
        p.voidedAt = at;
        n++;
      }
    }
    return n;
  }
}
