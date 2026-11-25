import { isVillageAsleep, type NewVillageEvent, type VillageEvent } from '../../domain/village';
import { PRUNED_INBOX_KINDS, type VillageInbox } from '../inbox';
import type { InMemoryVillages } from './in-memory-villages';

/**
 * Schránka vsí v paměti – chová se jako budoucí adaptér DB: zápis posune den na
 * `max(day, lastDay + 1)` uložené vsi a zvedne její verzi (rozběhnutý dopočet narazí na konflikt),
 * druhý zápis téhož `ref` vrátí null.
 */
export class InMemoryVillageInbox implements VillageInbox {
  readonly events: VillageEvent[] = [];
  private readonly refs = new Set<string>();
  /** `ref` zapsané události podle jejího id (úklid `pruneUsed`). */
  private readonly refOf = new Map<string, string>();
  private nextSeq = 1;

  constructor(private readonly villages: InMemoryVillages) {}

  post(event: NewVillageEvent): Promise<VillageEvent | null> {
    // zápis proběhne hned (synchronně) – test ho tak může vložit doprostřed dopočtu (`beforeSave`)
    return Promise.resolve(this.write(event));
  }

  pending(villageId: string, afterDay: number, toDay: number): Promise<VillageEvent[]> {
    const due = this.events
      .filter((e) => e.villageId === villageId && e.day > afterDay && e.day <= toDay)
      .sort((a, b) => a.day - b.day || a.seq - b.seq);
    return Promise.resolve(structuredClone(due));
  }

  pruneUsed(villageId: string, upToDay: number): Promise<number> {
    let pruned = 0;
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]!;
      if (e.villageId !== villageId || e.day > upToDay || !prunable(e.body.kind)) continue;
      this.events.splice(i, 1);
      // jako smazaný řádek v DB – `ref` přestane blokovat zápis
      const ref = this.refOf.get(e.id);
      if (ref !== undefined) this.refs.delete(ref);
      pruned++;
    }
    return Promise.resolve(pruned);
  }

  strandedResults(): Promise<VillageEvent[]> {
    const stranded = this.events
      .filter((e) => {
        if (e.body.kind !== 'market-result' || !this.gone(e.villageId)) return false;
        const { people = [], newcomers = [], unsold } = e.body.result;
        return people.length + newcomers.length > 0 || (unsold.coins ?? 0) > 0;
      })
      .sort((a, b) => a.day - b.day || a.seq - b.seq);
    return Promise.resolve(structuredClone(stranded));
  }

  dropStranded(eventIds: readonly string[]): Promise<number> {
    const ids = new Set(eventIds);
    let dropped = 0;
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]!;
      if (!ids.has(e.id) || e.body.kind !== 'market-result' || !this.gone(e.villageId)) continue;
      this.events.splice(i, 1);
      // jako smazaný řádek v DB – `ref` přestane blokovat zápis
      const ref = this.refOf.get(e.id);
      if (ref !== undefined) this.refs.delete(ref);
      dropped++;
    }
    return Promise.resolve(dropped);
  }

  /** Zaniklá ves jako v DB: spí (sloupec `asleep`), nebo má sídlo v archivu. */
  private gone(villageId: string): boolean {
    const record = this.villages.records.get(villageId);
    if (!record) return false;
    return (
      isVillageAsleep(record.state) || this.villages.archivedSettlements.has(record.settlementId)
    );
  }

  private write(event: NewVillageEvent): VillageEvent | null {
    const record = this.villages.records.get(event.villageId);
    if (!record) throw new Error(`Ves ${event.villageId} neexistuje.`);
    if (this.refs.has(event.ref)) return null;
    this.refs.add(event.ref);
    const seq = this.nextSeq++;
    const stored: VillageEvent = {
      id: `event-${seq}`,
      villageId: event.villageId,
      day: Math.max(event.day, record.state.lastDay + 1),
      seq,
      body: structuredClone(event.body),
    };
    this.events.push(stored);
    this.refOf.set(stored.id, event.ref);
    // jako zápis v téže transakci s `village.version` – uložení rozběhnutého dopočtu selže
    record.version++;
    return structuredClone(stored);
  }
}

/** Maže úklid schránky událost druhu `kind` (`PRUNED_INBOX_KINDS`)? */
function prunable(kind: string): boolean {
  return (PRUNED_INBOX_KINDS as readonly string[]).includes(kind);
}
