import { warPair, type NewWar, type War, type WarRepository, type WarStatus } from '../wars';

/** Repozitář válek v paměti – jedna aktivní válka na dvojici rodů, jako unikátní index v databázi. */
export class InMemoryWars implements WarRepository {
  readonly all: War[] = [];
  readonly warned = new Set<string>();
  readonly attacks = new Map<string, Date>();
  private nextId = 1;

  async activeBetween(a: string, b: string): Promise<War | null> {
    const [x, y] = warPair(a, b);
    return (
      this.all.find((w) => w.status === 'active' && w.houses[0] === x && w.houses[1] === y) ?? null
    );
  }

  async start(input: NewWar): Promise<{ war: War; created: boolean }> {
    const [x, y] = warPair(input.houses[0], input.houses[1]);
    const existing = await this.activeBetween(x, y);
    if (existing) return { war: existing, created: false };
    const war: War = {
      id: `war-${this.nextId++}`,
      houses: [x, y],
      startedAt: input.startedAt,
      startedDay: input.startedDay,
      how: input.how,
      status: 'active',
      lastClashDay: input.startedDay,
      endedAt: null,
    };
    this.all.push(war);
    return { war, created: true };
  }

  async activeOf(houseId: string): Promise<War[]> {
    return this.all.filter((w) => w.status === 'active' && w.houses.includes(houseId));
  }

  async listActive(): Promise<War[]> {
    return this.all.filter((w) => w.status === 'active');
  }

  async touchClash(id: string, day: number): Promise<void> {
    const war = this.all.find((w) => w.id === id);
    if (war && day > war.lastClashDay) war.lastClashDay = day;
  }

  async end(id: string, status: Exclude<WarStatus, 'active'>, at: Date): Promise<boolean> {
    const war = this.all.find((w) => w.id === id);
    if (!war || war.status !== 'active') return false;
    war.status = status;
    war.endedAt = at;
    return true;
  }

  async extinctOf(houseId: string, at: Date): Promise<number> {
    let n = 0;
    for (const w of await this.activeOf(houseId)) if (await this.end(w.id, 'extinct', at)) n++;
    return n;
  }

  async ownAttackAt(houseId: string): Promise<Date | null> {
    return this.attacks.get(houseId) ?? null;
  }

  async claimProtectionNotice(houseId: string): Promise<boolean> {
    if (this.warned.has(houseId)) return false;
    this.warned.add(houseId);
    return true;
  }

  async markAttack(houseId: string, at: Date): Promise<void> {
    if (!this.attacks.has(houseId)) this.attacks.set(houseId, at);
  }
}
