// Schránka vsi – jediná cesta, jak cizí věc (jiný hráč, svět) změní ves (docs/code/village-core.md
// – Schránka vsi). Událost má herní den a tělo; dopočet ji použije na začátku jejího dne, před
// simulací dne (`advanceVillageSteps`). Výsledek tak nezávisí na tom, po jakých kouscích se ves
// dopočítá – události dne patří k tomu dni, ne k dopočtu.

import { settleAppointee, type AppointeeParty } from './appoint-lord';
import type { ChronicleEvent, VillageState } from './types';

/**
 * Tělo události schránky – diskriminovaná unie podle `kind`. Další druhy přidají pozdější
 * mechaniky (vazalství, zásilky, válka); `applyEvent` je musí obsloužit (kontrola vyčerpání).
 */
export type VillageEventBody =
  /** Zápis do kroniky vsi – den zápisu je den použití události. */
  | { kind: 'chronicle'; event: ChronicleEvent }
  /**
   * Dosazený vojvoda z jiné vsi rodu dorazil s rodinou a jídlem (seniorate.md – dosazení vojvody;
   * `settleAppointee`). Ves, která mezitím vojvodu má, družinu přijme jako ostatní muže rodu.
   */
  | { kind: 'lord-arrives'; party: AppointeeParty; fromVillageId: string };

/**
 * Událost ve schránce vsi `villageId`. `day` = herní den, na jehož začátku se použije (nikdy ne
 * už spočítaný den – schránka ho při zápisu posune na `lastDay + 1`); `seq` = pořadí zápisu
 * (v rámci dne se události použijí podle něj).
 */
export interface VillageEvent {
  id: string;
  villageId: string;
  day: number;
  seq: number;
  body: VillageEventBody;
}

/** Nová událost pro zápis do schránky; `ref` je jedinečný – druhý zápis téhož `ref` se zahodí. */
export type NewVillageEvent = Omit<VillageEvent, 'id' | 'seq'> & { ref: string };

/**
 * Použije události dne `day` (ostatní dny přeskočí) v pořadí `seq` – mutuje stav jako kroky dne
 * simulace. Vrací zápisy do kroniky (volající je přidá do `state.chronicle`). Vstupní události
 * nemění.
 */
export function applyInboxDay(
  state: VillageState,
  day: number,
  events: readonly VillageEvent[],
): ChronicleEvent[] {
  const chronicle: ChronicleEvent[] = [];
  const today = events.filter((e) => e.day === day).sort((a, b) => a.seq - b.seq);
  for (const event of today) chronicle.push(...applyEvent(state, day, event.body));
  return chronicle;
}

/** Jedna událost – každý druh těla má svou větev (nový druh bez větve = chyba překladu). */
function applyEvent(state: VillageState, day: number, body: VillageEventBody): ChronicleEvent[] {
  switch (body.kind) {
    case 'chronicle':
      return [{ ...structuredClone(body.event), day }];
    case 'lord-arrives':
      return settleAppointee(state, day, structuredClone(body.party));
    default:
      return unknownBody(body);
  }
}

function unknownBody(body: never): never {
  throw new Error(`Neznámý druh události schránky vsi: ${JSON.stringify(body)}`);
}

/** Události podle dne – dopočet je hledá den po dni. */
export function inboxByDay(events: readonly VillageEvent[]): Map<number, VillageEvent[]> {
  const byDay = new Map<number, VillageEvent[]>();
  for (const event of events) {
    const list = byDay.get(event.day);
    if (list) list.push(event);
    else byDay.set(event.day, [event]);
  }
  return byDay;
}
