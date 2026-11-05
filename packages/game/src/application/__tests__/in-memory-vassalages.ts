import type { NewVassalage, VassalEdge, Vassalage, VassalageRepository } from '../vassalages';

/** Repozitář vazalství v paměti; `create` a `end` jsou atomické jako v databázi. */
export class InMemoryVassalages implements VassalageRepository {
  readonly vassalages: Vassalage[] = [];
  readonly reasons = new Map<string, string>();
  private nextId = 1;

  async activeOf(houseId: string): Promise<Vassalage[]> {
    return this.vassalages.filter(
      (v) => v.endedAt === null && (v.lordHouseId === houseId || v.vassalHouseId === houseId),
    );
  }

  async create(input: NewVassalage): Promise<Vassalage> {
    await Promise.resolve();
    const existing = this.vassalages.find(
      (v) =>
        v.endedAt === null &&
        v.lordHouseId === input.lordHouseId &&
        v.vassalHouseId === input.vassalHouseId,
    );
    if (existing) return existing;
    const vassalage: Vassalage = {
      ...input,
      id: `vassalage-${this.nextId++}`,
      endedAt: null,
      breaches: 0,
      version: 1,
    };
    this.vassalages.push(vassalage);
    return vassalage;
  }

  async end(id: string, reason: string, at: Date): Promise<boolean> {
    await Promise.resolve();
    const vassalage = this.vassalages.find((v) => v.id === id);
    if (!vassalage || vassalage.endedAt !== null) return false;
    vassalage.endedAt = at;
    this.reasons.set(id, reason);
    return true;
  }

  async edgesNear(houseId: string, depth: number): Promise<VassalEdge[]> {
    const seen = new Set<string>([houseId]);
    const edges = new Map<string, VassalEdge>();
    let frontier = [houseId];
    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const next: string[] = [];
      for (const v of this.vassalages) {
        if (v.endedAt !== null) continue;
        if (!frontier.includes(v.lordHouseId) && !frontier.includes(v.vassalHouseId)) continue;
        edges.set(v.id, { lordHouseId: v.lordHouseId, vassalHouseId: v.vassalHouseId });
        for (const h of [v.lordHouseId, v.vassalHouseId]) {
          if (!seen.has(h)) {
            seen.add(h);
            next.push(h);
          }
        }
      }
      frontier = next;
    }
    return [...edges.values()];
  }
}
