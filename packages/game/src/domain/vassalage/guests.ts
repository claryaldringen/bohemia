import { cloneState } from '../village/clone';
import { isDynastyTracked, lineMen } from '../village/dynasty';
import { villageManorId } from '../village/manor';
import { ageYears, isAway, laborPerDay } from '../village/people';
import type {
  AwayKind,
  ChronicleEvent,
  Guest,
  Person,
  PersonAway,
  VillageState,
} from '../village/types';
import { VASSALAGE } from './rules-vassalage';

// Lidé pryč na čas a hosté (plán 2026-11-03 – rozhodnutí 11; vassalage.md – Lidé a robota). Kdo je
// pryč jen na čas (robota, služba, tažení, zajetí, ochrana), zůstává ve stavu domovské vsi
// s `Person.away` – doma nepracuje ani nejí (`isAway` v people.ts) – a hostitelská ves ho vede jako
// hosta (`VillageState.guests`): jí z jejích zásob a pracuje jí. Návrat je v pevný den (`untilDay`)
// v obou vsích zvlášť, bez události schránky – výsledek nezávisí na kouscích dopočtu.

/** Pořadí druhů nepřítomnosti v kronice návratu. */
const AWAY_KINDS: readonly AwayKind[] = ['labor', 'service', 'campaign', 'captive', 'protection'];

/**
 * Pošle lidi `ids` pryč na čas (mutuje stav): dostanou `away` a zůstanou ve stavu vsi. Kdo je
 * v den `day` už pryč, zůstane u své nepřítomnosti.
 */
export function sendAway(
  state: VillageState,
  day: number,
  ids: readonly number[],
  away: PersonAway,
): void {
  const wanted = new Set(ids);
  for (const p of state.people) {
    if (wanted.has(p.id) && !isAway(p, day)) p.away = { ...away };
  }
}

/**
 * Začátek dne `day` (mutuje stav): kdo měl návrat do dneška, je zase doma (`away` zmizí) a hosté
 * s odchodem do dneška odejdou. Vrací zápis do kroniky – kolik lidí se vrátilo, po druzích.
 */
export function returnHome(state: VillageState, day: number): ChronicleEvent[] {
  if (state.guests !== undefined) {
    const staying = state.guests.filter((g) => g.untilDay > day);
    if (staying.length === 0) delete state.guests;
    else if (staying.length !== state.guests.length) state.guests = staying;
  }
  let back: Map<AwayKind, number> | null = null;
  for (const p of state.people) {
    const until = p.away?.untilDay;
    if (until === undefined || until > day) continue;
    back ??= new Map();
    back.set(p.away!.kind, (back.get(p.away!.kind) ?? 0) + 1);
    delete p.away;
  }
  if (back === null) return [];
  return AWAY_KINDS.filter((kind) => back.has(kind)).map((kind) => ({
    day,
    kind: 'people-back' as const,
    away: kind,
    people: back.get(kind)!,
  }));
}

/**
 * Hosté přišli (mutuje stav – událost schránky `guests-arrive`): přidají se ti, kdo ještě neodešli
 * (`untilDay` po dni `day`) a ve vsi už nejsou (stejný odkaz a druh). Vstupní pole nemění.
 */
export function hostGuests(state: VillageState, day: number, guests: readonly Guest[]): void {
  const key = (g: Guest): string => `${g.kind}:${g.ref.villageId}:${g.ref.personId}`;
  const present = new Set((state.guests ?? []).map(key));
  const arriving = guests.filter((g) => g.untilDay > day && !present.has(key(g)));
  if (arriving.length === 0) return;
  state.guests = [...(state.guests ?? []), ...arriving.map((g) => structuredClone(g))];
}

/**
 * Koho ves na robotu pošle (vassalage.md – Lidé a robota: „dospělí od 16 let, které ves nejméně
 * postrádá, ne muži rodu“), v pořadí výběru: dospělí od 16 let, kteří dnes pracují (ne zranění, ne
 * už pryč), mimo dvorec vojvody, ne muži rodu ani jejich ženy. Návrh Clauda: po kolech – v každém
 * kole nejvýš jeden z domu, napřed z domů s nejvíc pracujícími dospělými (při shodě nižší id),
 * v domě napřed svobodní, pak nejmladší; dům si vždy nechá aspoň jednoho pracujícího dospělého.
 * Stav nemění.
 */
export function corveeWorkers(state: VillageState, day: number): Person[] {
  const manor = villageManorId(state);
  const line = isDynastyTracked(state) ? new Set(lineMen(state).map((p) => p.id)) : new Set();
  const kept = (p: Person): boolean =>
    line.has(p.id) || (p.spouseId !== undefined && line.has(p.spouseId));
  const working = new Map<number, Person[]>();
  for (const p of state.people) {
    if (p.dwellingId === manor || laborPerDay(p, day) <= 0) continue;
    const list = working.get(p.dwellingId) ?? [];
    list.push(p);
    working.set(p.dwellingId, list);
  }
  const homes = [...working.entries()]
    .map(([dwellingId, adults]) => ({
      dwellingId,
      adults: adults.length,
      candidates: adults
        .filter((p) => !kept(p) && ageYears(p.bornDay, day) >= VASSALAGE.corvee.fromAge)
        .sort(
          (a, b) =>
            Number(a.spouseId !== undefined) - Number(b.spouseId !== undefined) ||
            b.bornDay - a.bornDay ||
            a.id - b.id,
        ),
    }))
    .sort((a, b) => b.adults - a.adults || a.dwellingId - b.dwellingId);
  const out: Person[] = [];
  for (let round = 0; ; round++) {
    let took = false;
    for (const home of homes) {
      // doma zůstane aspoň jeden pracující dospělý
      if (round < home.candidates.length && home.adults - round > 1) {
        out.push(home.candidates[round]!);
        took = true;
      }
    }
    if (!took) return out;
  }
}

/**
 * Rozdělení `laborDays` člověkodní mezi lidi (návrh Clauda): tolik lidí, aby nikdo nepracoval víc
 * než `VASSALAGE.corvee.maxStintDays` dní (nejvýš `hands` – kolik jich ves může poslat; pak déle),
 * dny rovným dílem, zbytek po dni prvním. Součet je vždy přesně `laborDays` (bez lidí prázdné).
 */
export function corveeStints(laborDays: number, hands: number): number[] {
  const total = Math.max(0, Math.floor(laborDays));
  if (total === 0 || hands <= 0) return [];
  const people = Math.min(hands, Math.ceil(total / VASSALAGE.corvee.maxStintDays));
  const base = Math.floor(total / people);
  const extra = total - base * people;
  return Array.from({ length: people }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Ves nemá koho (nebo tolik lidí) na robotu poslat. */
export const CORVEE_NO_HANDS = 'Ves nemá tolik lidí na robotu.';

/** Vstup odeslání roboty: kolik člověkodní, kam a jak daleko (dní cesty tam). */
export interface CorveeInput {
  laborDays: number;
  /** Dní cesty do hostitelské vsi (stejně zpět) – do dní roboty se nepočítají. */
  travelDays: number;
  homeVillageId: string;
  hostVillageId: string;
  hostName: string;
  /** Odkaz na důvod (dialog Odvody a ves) – podle něj se pozná už odeslaná robota. */
  refId: string;
}

/** Hosté, které už odeslaná robota `refId` (ve stavu domovské vsi) dává hostiteli. */
export function corveeGuests(state: VillageState, input: CorveeInput): Guest[] {
  return state.people
    .filter((p) => p.away?.refId === input.refId && p.away.untilDay !== undefined)
    .map((p) => ({
      ref: { villageId: input.homeVillageId, personId: p.id },
      kind: p.away!.kind,
      untilDay: p.away!.untilDay! - input.travelDays,
      adult: true as const,
    }));
}

/**
 * Pošle lidi na robotu do pánovy vsi (vassalage.md – Lidé a robota) po dni `day` (ves je spočítaná
 * do `day`): vybere lidi (`corveeWorkers`), rozdělí dny (`corveeStints`) a pošle je pryč
 * (`sendAway`). Kdo odpracuje `d` dní, je u pána od dne `day + travelDays` do `day + travelDays + d`
 * (host) a doma zase v den `day + 2 × travelDays + d` – cesta se do dní nepočítá. Vrací novou ves
 * (vstupní stav nemění) a hosty pro hostitele (`guests-arrive`). Bez koho poslat → `ok: false`.
 */
export function dispatchCorvee(
  state: VillageState,
  day: number,
  input: CorveeInput,
): { ok: true; state: VillageState; guests: Guest[] } | { ok: false; reason: string } {
  const workers = corveeWorkers(state, day);
  const stints = corveeStints(input.laborDays, workers.length);
  if (stints.length === 0) {
    return input.laborDays > 0
      ? { ok: false, reason: CORVEE_NO_HANDS }
      : { ok: true, state, guests: [] };
  }
  if (stints[0]! > VASSALAGE.corvee.maxDaysPerPerson) return { ok: false, reason: CORVEE_NO_HANDS };
  const next = cloneState(state);
  const guests: Guest[] = [];
  let lastHome = day;
  stints.forEach((days, i) => {
    const person = workers[i]!;
    const hostUntil = day + input.travelDays + days;
    const homeUntil = hostUntil + input.travelDays;
    lastHome = Math.max(lastHome, homeUntil);
    sendAway(next, day, [person.id], {
      kind: 'labor',
      untilDay: homeUntil,
      hostVillageId: input.hostVillageId,
      refId: input.refId,
    });
    guests.push({
      ref: { villageId: input.homeVillageId, personId: person.id },
      kind: 'labor',
      untilDay: hostUntil,
      adult: true,
    });
  });
  next.chronicle.push({
    day,
    kind: 'people-away',
    away: 'labor',
    people: guests.length,
    villageName: input.hostName,
    untilDay: lastHome,
  });
  return { ok: true, state: next, guests };
}
