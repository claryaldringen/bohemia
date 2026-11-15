import { length2 } from '../../landscape';
import { ageYears, isAway } from '../people/people';
import { AGE, CHARCOAL_POLE, SMITH_SUPPLY, WATER_FETCHING } from '../rules';
import type {
  CharcoalKiln,
  Dwelling,
  Person,
  PolePartnerKind,
  VillageState,
  WorkshopActivity,
} from '../types';
import { kilnPoint } from './charcoal';
import {
  basketManDaysPerKg,
  nearestSmith,
  smithHead,
  smithSons,
  type CharcoalDelivery,
  type SmithMember,
} from './smith-supply';

// Odnos uhlí na tyči (workshops.md – Uhlíř – odnos uhlí na tyči; Martin 14. 11. 2026: „Pokud má
// dostatečně velkého syna, donesou košatinu s uhlím mezi sebou na tyči do kovárny. Pokud syna
// nemá, dojde si do kovárny pro kováře či jeho syna, aby spolu mohli uhlí v košatině na tyči
// odnosit.“; podrobnosti návrh Clauda). Práce odnosu se nemění – nošení v koších podle cesty
// kovárna ↔ milíř (`basketManDaysPerKg`) – a každý z dvojice nese polovinu: uhlíř a jeho syn od
// 14 let z práce dílny uhlíře, syn 12–13 let ten den nepase a nešlape měch, kovář a jeho syn od
// 14 z práce kovárny (odpočívající kovář z práce vsi). Uhlíř bez syna si pro kováře jednou za den
// dojde z práce dílny. Kovář i jeho syn nese týž den jen s jedním uhlířem (návrh Clauda) – další
// uhlíř si vezme jiného syna kováře, kováře, nebo ten den nenese. Nic nemutuje, deterministicky.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;
/** Kdo dnes s kterým uhlířem nese (id člověka → id dílny uhlíře) – zatím nikdo. */
const NO_ONE_TAKEN: ReadonlyMap<number, number> = new Map();
/** Délka pracovního dne v sekundách – jako nošení v koších (smith-supply.ts). */
const DAY_S = WATER_FETCHING.dayHours * 3600;

/** Druhý u tyče: kdo, kolik mu je let, z kterého obydlí a jaký je to druh (syn uhlíře…). */
export interface PolePartner {
  personId: number;
  age: number;
  dwellingId: number;
  kind: PolePartnerKind;
}

/**
 * Smí člověk dnes k tyči? Kdo je pryč (`isAway` – výjezd, výprava), nejde; tyč chce dva dost velké
 * – aspoň CHARCOAL_POLE.sonFromAge let (plán Rozhodnutí 9).
 */
function atPole(person: Person | undefined, day: number): boolean {
  return (
    !!person && !isAway(person, day) && ageYears(person.bornDay, day) >= CHARCOAL_POLE.sonFromAge
  );
}

/** Hlava domácnosti obydlí `dwellingId` (`smithHead`), když dnes smí k tyči; jinak null. */
function headAtPole(
  state: Pick<VillageState, 'people'>,
  day: number,
  dwellingId: number,
): SmithMember | null {
  const members = state.people.filter((p) => p.dwellingId === dwellingId);
  const head = smithHead(members, day);
  const person = head ? members.find((p) => p.id === head.id) : undefined;
  return head && atPole(person, day) ? head : null;
}

/**
 * Uhlíř u tyče – hlava domácnosti dílny uhlíře `burnerId` (`smithHead`); když je pryč (nebo mu není
 * 12 let), dnes uhlí nikdo nenese – null.
 */
export function poleBurner(
  state: Pick<VillageState, 'people'>,
  day: number,
  burnerId: number,
): SmithMember | null {
  return headAtPole(state, day, burnerId);
}

/**
 * Syn domácnosti `dwellingId` k tyči (`smithSons` – od nejstaršího): napřed nejstarší z výrostků
 * 12–13 let (jejich práce není práce dílny), jinak nejmladší syn od 14 let (jako měchař – dospělý
 * je v práci dílny); kdo je pryč nebo dnes nese s jiným uhlířem (`free`), nejde. Bez syna null.
 */
function sonAtPole(
  state: Pick<VillageState, 'people'>,
  day: number,
  dwellingId: number,
  kind: 'burner-son' | 'smith-son',
  free: (personId: number) => boolean,
): PolePartner | null {
  const members = new Map(
    state.people.filter((p) => p.dwellingId === dwellingId).map((p) => [p.id, p]),
  );
  const sons = smithSons(state, dwellingId, day).filter(
    (s) => free(s.id) && atPole(members.get(s.id), day),
  );
  const son = sons.find((s) => s.age < AGE.adult) ?? sons[sons.length - 1];
  return son ? { personId: son.id, age: son.age, dwellingId, kind } : null;
}

/**
 * Kdo dnes nese s uhlířem `burnerId` uhlí do kovárny `smithId` (plán Rozhodnutí 9): syn uhlíře
 * 12–13 let (nejstarší z nich), syn uhlíře od 14 let, syn kováře 12–13, syn kováře od 14, kovář.
 * Syn jde k tyči od CHARCOAL_POLE.sonFromAge let, kdo je pryč (`isAway`), nejde. Kdo dnes už nese
 * s jiným uhlířem (`taken` – id člověka → id dílny uhlíře), nejde taky – s týmž uhlířem ano (víc
 * milířů). Bez nikoho null.
 */
export function polePartner(
  state: Pick<VillageState, 'people'>,
  day: number,
  burnerId: number,
  smithId: number,
  taken: ReadonlyMap<number, number> = NO_ONE_TAKEN,
): PolePartner | null {
  const free = (personId: number): boolean => (taken.get(personId) ?? burnerId) === burnerId;
  const partner =
    sonAtPole(state, day, burnerId, 'burner-son', free) ??
    sonAtPole(state, day, smithId, 'smith-son', free);
  if (partner) return partner;
  const smith = headAtPole(state, day, smithId);
  return smith && free(smith.id)
    ? { personId: smith.id, age: smith.age, dwellingId: smithId, kind: 'smith' }
    : null;
}

/** Cesta uhlíře pro kováře (čd): `walkM` m od milíře ke kovárně rychlostí nošení. */
export function fetchWalkManDays(walkM: number): number {
  return walkM / SMITH_SUPPLY.carryMps / DAY_S;
}

/** Jde uhlíř pro druhého do kovárny – nese s ním kovář nebo jeho syn? */
function fromSmithy(partner: Pick<PolePartner, 'kind'>): boolean {
  return partner.kind !== 'burner-son';
}

/**
 * Kolik z práce dvojice platí dílna uhlíře: se synem od 14 let celou (jeho polovina je v práci
 * dílny), jinak polovinu uhlíře.
 */
export function burnerPoleShare(partner: Pick<PolePartner, 'kind' | 'age'>): number {
  return partner.kind === 'burner-son' && partner.age >= AGE.adult ? 1 : 0.5;
}

/** Odnos uhlí z jednoho milíře do kovárny na tyči ve dvou. */
export interface PoleCarry {
  burnerId: number;
  /** Id milíře (chybí u milíře ze starší vsi před převodem). */
  kilnId?: number;
  smithId: number;
  /** Milíř (m). */
  at: { x: number; z: number };
  /** Kolik uhlí dvojice nese (kg) a práce celé dvojice (čd – nošení v koších). */
  kg: number;
  manDays: number;
  burner: { personId: number; age: number };
  partner: PolePartner;
  /** Cesta uhlíře pro kováře (čd – jen s kovářem nebo jeho synem, jednou za den); jinak 0. */
  fetchWalk: number;
}

/** Odnos uhlí na tyči dne – dvojice a čí práce to je. */
export interface CharcoalCarryDay {
  pairs: PoleCarry[];
  /** Práce domácností uhlířů (čd z práce dílny – uhlíř, syn od 14 let, cesta pro kováře). */
  burners: Map<number, number>;
  /** Práce domácností kováren (čd – kovář nebo syn od 14 let; odpočívající kovárna z práce vsi). */
  smiths: Map<number, number>;
  /** Synové 12–13 let u tyče – ten den nepasou ani nešlapou měch. */
  busy: number[];
}

/** Uhlí, které dnes přiveze vůz (kg z milíře) – nikdo ho nenese. */
interface CartedCharcoal {
  burnerId: number;
  kilnId?: number;
  kg: number;
}

/** Přičte `manDays` k práci obydlí `id`. */
function addWork(work: Map<number, number>, id: number, manDays: number): void {
  if (manDays > EPSILON) work.set(id, (work.get(id) ?? 0) + manDays);
}

/**
 * Kdo dnes nese uhlí do kováren (workshops.md – Uhlíř – odnos uhlí na tyči): uhlí, které uhlíři
 * vytahali (`deliveries`) a vůz nepřiveze (`carts`), nese uhlíř s druhým (`polePartner`) – jen
 * do kováren, které dnes pracují se vsí (`restingOnly` – před rozdělením práce vsi), nebo jen do
 * těch, které pracují v dílně. Cesta pro kováře jednou za den za uhlíře a kovárnu. Kovář i jeho
 * syn nese jen s prvním uhlířem, se kterým jde (`polePartner` – `taken`; lidé kovárny jsou jen
 * v její fázi, takže stačí pro jedno volání). Bez uhlíře nebo druhého u tyče se nenese.
 */
export function charcoalCarryDay(
  state: Pick<VillageState, 'people'>,
  day: number,
  deliveries: readonly CharcoalDelivery[],
  carts: { charcoal: readonly CartedCharcoal[] },
  resting: ReadonlyMap<number, WorkshopActivity>,
  restingOnly: boolean,
): CharcoalCarryDay {
  const out: CharcoalCarryDay = { pairs: [], burners: new Map(), smiths: new Map(), busy: [] };
  const fetched = new Set<string>();
  const taken = new Map<number, number>();
  for (const d of deliveries) {
    if (resting.has(d.smithId) !== restingOnly) continue;
    const carted = carts.charcoal
      .filter((c) => c.burnerId === d.burnerId && c.kilnId === d.kilnId)
      .reduce((sum, c) => sum + c.kg, 0);
    const kg = Math.max(0, d.kg - carted);
    const manDays = kg * basketManDaysPerKg(d.walkM, SMITH_SUPPLY.basketKg.charcoal);
    if (manDays <= EPSILON) continue;
    const burner = poleBurner(state, day, d.burnerId);
    const partner = burner ? polePartner(state, day, d.burnerId, d.smithId, taken) : null;
    if (!burner || !partner) continue;
    taken.set(partner.personId, d.burnerId);
    const key = `${d.burnerId}:${d.smithId}`;
    const fetchWalk = fromSmithy(partner) && !fetched.has(key) ? fetchWalkManDays(d.walkM) : 0;
    if (fromSmithy(partner)) fetched.add(key);
    addWork(out.burners, d.burnerId, manDays * burnerPoleShare(partner) + fetchWalk);
    if (partner.age < AGE.adult) {
      if (!out.busy.includes(partner.personId)) out.busy.push(partner.personId);
    } else if (fromSmithy(partner)) {
      addWork(out.smiths, d.smithId, manDays / 2);
    }
    out.pairs.push({
      burnerId: d.burnerId,
      ...(d.kilnId !== undefined ? { kilnId: d.kilnId } : {}),
      smithId: d.smithId,
      at: d.at,
      kg,
      manDays,
      burner: { personId: burner.id, age: burner.age },
      partner,
      fetchWalk,
    });
  }
  return out;
}

/**
 * Odnos dne z obou fází (`charcoalCarryDay` – odpočívající kovárny napřed): dvojice za sebou,
 * práce dílen sečtená, synové u tyče jednou.
 */
export function mergeCarryDays(
  first: CharcoalCarryDay,
  second: CharcoalCarryDay,
): CharcoalCarryDay {
  const sum = (a: Map<number, number>, b: Map<number, number>): Map<number, number> => {
    const out = new Map(a);
    for (const [id, manDays] of b) addWork(out, id, manDays);
    return out;
  };
  return {
    pairs: [...first.pairs, ...second.pairs],
    burners: sum(first.burners, second.burners),
    smiths: sum(first.smiths, second.smiths),
    busy: [...new Set([...first.busy, ...second.busy])],
  };
}

/**
 * Odnos z milíře `kiln` v plánu uhlíře (`burnerPlans` – vůz se rozhoduje až z vytahaného uhlí,
 * plán počítá s nošením pěšky): kovárna jako u `charcoalDeliveries` (nejbližší z `smiths`),
 * vzdálenost chůze uložená u milíře, jinak vzdušně; kdo už nese s jiným uhlířem (`taken` – jako
 * u `charcoalCarryDay`), nejde. Vrací kovárnu, druhého u tyče, práci dílny uhlíře na kg
 * (`burnerPoleShare` z nošení v koších) a cestu pro kováře (čd – jen když nese kovář nebo jeho
 * syn); bez kovárny, uhlíře nebo druhého u tyče null.
 */
export function plannedPoleCarry(
  state: Pick<VillageState, 'people'>,
  day: number,
  burner: Dwelling,
  kiln: CharcoalKiln,
  smiths: readonly Dwelling[],
  taken: ReadonlyMap<number, number> = NO_ONE_TAKEN,
): { smithId: number; partnerId: number; perKg: number; fetchWalk: number } | null {
  if (smiths.length === 0 || !poleBurner(state, day, burner.id)) return null;
  const at = kilnPoint(burner, kiln);
  const smith = nearestSmith(smiths, at);
  const partner = polePartner(state, day, burner.id, smith.id, taken);
  if (!partner) return null;
  const walkM =
    kiln.carry?.smithId === smith.id
      ? kiln.carry.walkM
      : length2(smith.position.x - at.x, smith.position.z - at.z);
  return {
    smithId: smith.id,
    partnerId: partner.personId,
    perKg: basketManDaysPerKg(walkM, SMITH_SUPPLY.basketKg.charcoal) * burnerPoleShare(partner),
    fetchWalk: fromSmithy(partner) ? fetchWalkManDays(walkM) : 0,
  };
}
