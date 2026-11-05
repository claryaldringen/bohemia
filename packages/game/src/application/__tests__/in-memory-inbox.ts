import type { NewVillageEvent, VillageEvent } from '../../domain/village';
import type { VillageInbox } from '../inbox';
import type { InMemoryVillages } from './in-memory-villages';

/**
 * Schránka vsí v paměti – chová se jako budoucí adaptér DB: zápis posune den na
 * `max(day, lastDay + 1)` uložené vsi a zvedne její verzi (rozběhnutý dopočet narazí na konflikt),
 * druhý zápis téhož `ref` vrátí null.
 */
export class InMemoryVillageInbox implements VillageInbox {
  readonly events: VillageEvent[] = [];
  private readonly refs = new Set<string>();
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
    // jako zápis v téže transakci s `village.version` – uložení rozběhnutého dopočtu selže
    record.version++;
    return structuredClone(stored);
  }
}
