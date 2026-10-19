// Výměna lidí se sousedem (docs/design/trade.md – Výměna lidí; Martin 19. 10. 2026: „Se sousedem
// půjde vyměnit i lidi... např. když on jich bude mít moc a nebude je moci uživit, může jich pár
// vyměnit s námi za nějaké suroviny a opačně.“, „Mohou se stěhovat celé rodiny i jen dospělí.
// Podle toho, co je v nabídce.“; detaily návrh Clauda). Soused má na rok obchodu lidi navíc, nebo
// lidi shání (`neighbourPeople`); vyměňují se celé rodiny (muž, žena a jejich svobodné děti)
// a svobodní dospělí 16–44 let za zboží podle hodnoty v kg obilí. Koho ves dá, vybere jádro
// (`emigrantGroups`) – nikdy dědice domu, vojvodovu domácnost ani nikoho, bez koho by se domácnost
// rozpadla; odejdou hned s výpravou. Lidé od souseda přijdou s návratem výpravy
// (`settleNewcomers`). Čisté funkce bez I/O, náhoda ze seedu vsi.
import { createRandom, deriveSeed, type Random } from '../landscape/random';
import { familiesOf, unmarriedHeir } from './households';
import { villageManorId } from './manor';
import { isSingle } from './marriage';
import { ageGroup, householdBreaksUp, isFertile, occupants } from './people';
import { DWELLINGS, PEOPLE_TRADE } from './rules';
import type {
  ChronicleEvent,
  Direction8,
  Dwelling,
  NeighbourPeople,
  NewcomerGroup,
  Person,
  TradePeople,
  VillageState,
} from './types';

const DAYS_PER_YEAR = 365.25;

/** Žádní lidé. */
export const NO_PEOPLE: TradePeople = { families: 0, adults: 0 };

/** Celé číslo v rozmezí od–do včetně. */
function between(rnd: Random, from: number, to: number): number {
  return from + Math.floor(rnd.next() * (to - from + 1));
}

/**
 * Lidé souseda ve směru `direction` na rok obchodu `season` (trade.md – Výměna lidí, návrh Clauda):
 * deterministicky ze seedu, směru a roku – s PEOPLE_TRADE.surplusChance má lidi navíc (0–2 rodiny
 * s 0–3 dětmi a 0–3 svobodné dospělé, aspoň jednoho), s PEOPLE_TRADE.shortageChance lidi shání
 * (vezme 0–2 rodiny a 0–3 dospělé, aspoň jednoho), jinak lidi nemění.
 */
export function neighbourPeople(
  seed: number,
  direction: Direction8,
  season: number,
): NeighbourPeople {
  const rnd = createRandom(deriveSeed(seed, `neighbour-people:${direction}:${season}`));
  const roll = rnd.next();
  const { families, adults, children } = PEOPLE_TRADE;
  const count = (): TradePeople => {
    const f = between(rnd, families.min, families.max);
    const a = between(rnd, adults.min, adults.max);
    return f + a > 0 ? { families: f, adults: a } : { families: 0, adults: 1 };
  };
  if (roll < PEOPLE_TRADE.surplusChance) {
    const offer = count();
    return {
      families: Array.from({ length: offer.families }, () =>
        between(rnd, children.min, children.max),
      ),
      adults: offer.adults,
      takes: { ...NO_PEOPLE },
    };
  }
  if (roll < PEOPLE_TRADE.surplusChance + PEOPLE_TRADE.shortageChance) {
    return { families: [], adults: 0, takes: count() };
  }
  return { families: [], adults: 0, takes: { ...NO_PEOPLE } };
}

/** Hodnota člověka v kg obilí – dospělý PEOPLE_TRADE.adultValueKg, dítě do 14 let polovina. */
export function personValue(person: Person, day: number): number {
  const share = ageGroup(person, day) === 'child' ? PEOPLE_TRADE.childShare : 1;
  return PEOPLE_TRADE.adultValueKg * share;
}

/** Hodnota rodiny souseda s `children` dětmi (muž, žena a děti) v kg obilí. */
export function neighbourFamilyValue(children: number): number {
  return PEOPLE_TRADE.adultValueKg * (2 + children * PEOPLE_TRADE.childShare);
}

/** Skupina lidí, kterou ves může dát sousedovi – rodina, nebo svobodný dospělý. */
export interface EmigrantGroup {
  kind: 'family' | 'adult';
  /** Domácnost, ze které odchází. */
  dwellingId: number;
  people: Person[];
  /** Hodnota v kg obilí (`personValue`). */
  valueKg: number;
}

/** Přeplnění domácnosti obydlí: lidé − kapacita. */
function crowding(state: VillageState, dwelling: Dwelling): number {
  return occupants(state, dwelling.id).length - DWELLINGS[dwelling.type].capacity;
}

/** Obydlí, ze kterých ves smí lidi dát – bez dvorce vojvody, od nejvíc přeplněného, pak id. */
function givingDwellings(state: VillageState): Dwelling[] {
  const manor = villageManorId(state);
  return state.dwellings
    .filter((d) => d.id !== manor)
    .sort((a, b) => crowding(state, b) - crowding(state, a) || a.id - b.id);
}

/** Od nejstaršího; při shodě data narození nižší id. */
function byAge(a: Person, b: Person): number {
  return a.bornDay - b.bornDay || a.id - b.id;
}

/** Ves bez daných lidí (mělká kopie – jen pro výběr). */
function without(state: VillageState, people: readonly Person[]): VillageState {
  const ids = new Set(people.map((p) => p.id));
  return { ...state, people: state.people.filter((p) => !ids.has(p.id)) };
}

/** První rodina, kterou ves smí dát (`familiesOf` – dědic a jeho rodiče zůstávají). */
function nextFamily(state: VillageState, day: number): EmigrantGroup | undefined {
  for (const dwelling of givingDwellings(state)) {
    const family = familiesOf(state, dwelling, day)[0];
    if (family) return group('family', dwelling.id, family.people, day);
  }
  return undefined;
}

/**
 * První svobodný dospělý 16–44 let, kterého ves smí dát: ne dědic domu (`unmarriedHeir`), ne
 * vdova s malými dětmi (`isSingle`), a jen když v domě zůstane někdo, kdo domácnost udrží.
 * V domě od nejstaršího.
 */
function nextAdult(state: VillageState, day: number): EmigrantGroup | undefined {
  for (const dwelling of givingDwellings(state)) {
    const members = occupants(state, dwelling.id);
    const heir = unmarriedHeir(members, day);
    const singles = members
      .filter((p) => p !== heir && isFertile(p, day) && isSingle(state, p, day))
      .sort(byAge);
    for (const p of singles) {
      const staying = members.filter((m) => m !== p);
      if (staying.length === 0 || householdBreaksUp(staying, day)) continue;
      return group('adult', dwelling.id, [p], day);
    }
  }
  return undefined;
}

function group(
  kind: EmigrantGroup['kind'],
  dwellingId: number,
  people: Person[],
  day: number,
): EmigrantGroup {
  const valueKg = people.reduce((sum, p) => sum + personValue(p, day), 0);
  return { kind, dwellingId, people, valueKg };
}

/**
 * Koho ves dá sousedovi (trade.md – Výměna lidí, návrh Clauda): nejvýš `want.families` rodin a pak
 * `want.adults` svobodných dospělých, postupně – každá další skupina z vsi bez těch předchozích,
 * vždy z nejvíc přeplněného domu (dvorec vojvody ne). Rodina podle `familiesOf` (muž, žena a jejich
 * svobodné děti; dědic domu a jeho rodiče zůstávají, zbytek domácnosti se nesmí rozpadnout),
 * dospělý podle `nextAdult`. Výběr je postupný, takže prvních n rodin je vždy stejných (náhled
 * v panelu). Když tolik lidí není, vrátí méně.
 */
export function emigrantGroups(
  state: VillageState,
  day: number,
  want: TradePeople,
): { families: EmigrantGroup[]; adults: EmigrantGroup[] } {
  let rest = state;
  const families: EmigrantGroup[] = [];
  while (families.length < want.families) {
    const next = nextFamily(rest, day);
    if (!next) break;
    families.push(next);
    rest = without(rest, next.people);
  }
  const adults: EmigrantGroup[] = [];
  while (adults.length < want.adults) {
    const next = nextAdult(rest, day);
    if (!next) break;
    adults.push(next);
    rest = without(rest, next.people);
  }
  return { families, adults };
}

/** Den narození člověka, kterému je dnes `years` let a ještě část roku (los). */
function bornDayFor(day: number, years: number, rnd: Random): number {
  return day - Math.floor(years * DAYS_PER_YEAR) - Math.floor(rnd.next() * 365);
}

/**
 * Kam půjdou lidé od souseda: rodina do prázdného obydlí (nejnižší id); když žádné není – stejně
 * jako svobodný dospělý – do obydlí s nejvíc volnými místy (smí ho dočasně přeplnit; při shodě
 * nižší id), mezi obydlenými, je-li nějaké. Řemeslné dílny až nakonec (jejich domácnost pracuje
 * v dílně) a rodina do dvorce vojvody jen, když jinam nemůže – v domě bez ženatého syna zůstává
 * nejstarší ženatý muž, takže by se z dvorce mohla odstěhovat vojvodova rodina místo přišlých.
 */
function newcomerHome(state: VillageState, family: boolean): number | undefined {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  const byId = [...state.dwellings].sort((a, b) => a.id - b.id);
  if (family) {
    const empty = byId.find((d) => !occupied.has(d.id) && d.workshop === undefined);
    if (empty) return empty.id;
  }
  const manor = villageManorId(state);
  const lived = byId.filter((d) => occupied.has(d.id));
  const pool = lived.length > 0 ? lived : byId;
  // pořadí: ne dílna, (rodina) ne dvorec, nejvíc volných míst, nižší id
  const rank = (d: Dwelling): number[] => [
    Number(d.workshop !== undefined),
    family ? Number(d.id === manor) : 0,
    occupants(state, d.id).length - DWELLINGS[d.type].capacity,
  ];
  let best: Dwelling | undefined;
  let bestRank: number[] = [];
  for (const d of pool) {
    const r = rank(d);
    const i = r.findIndex((v, k) => v !== bestRank[k]);
    if (best === undefined || (i >= 0 && r[i]! < bestRank[i]!)) {
      best = d;
      bestRank = r;
    }
  }
  return best?.id ?? state.people[0]?.dwellingId;
}

/**
 * Lidé od souseda ve směru `direction` přijdou do vsi (mutuje stav – trade.md, Výměna lidí): rodiny
 * (muž, žena a jejich děti – podle počtu dětí v `families`) a svobodní dospělí. Rodiče dospělých
 * jsou neznámí (s lidmi vsi nepříbuzní), děti mají rodiče z rodiny, všichni nesou `origin` = směr
 * souseda (kinship.md, war.md). Rodina jde do prázdného obydlí, jinak do domu s nejvíc místy
 * (`newcomerHome`) – tam je pak ženatý muž bez rodičů v domě, takže smí do nového domu (lidé
 * k osídlení); dospělý do domu s nejvíc místy a vezme se podle pravidel sňatků. Věk a pohlaví
 * z losu ze seedu vsi a id výpravy (`key`) – nezávisle na kouscích dopočtu. Vrací kroniku.
 */
export function settleNewcomers(
  state: VillageState,
  day: number,
  direction: Direction8,
  people: { families: readonly number[]; adults: number },
  key: string,
): ChronicleEvent[] {
  const rnd = createRandom(deriveSeed(state.seed, `newcomers:${key}`));
  const events: ChronicleEvent[] = [];
  const arrive = (group: NewcomerGroup, newcomers: Person[]): void => {
    const home = newcomerHome(state, group === 'family');
    if (home === undefined) return;
    for (const p of newcomers) p.dwellingId = home;
    state.people.push(...newcomers);
    events.push({
      day,
      kind: 'newcomer',
      direction,
      group,
      people: newcomers.length,
      dwellingId: home,
    });
  };
  const T = PEOPLE_TRADE;
  for (const children of people.families) {
    const husbandAge = between(rnd, T.husbandAge.from, T.husbandAge.to);
    const wifeAge = Math.max(
      T.wifeMinAge + T.wifeYearsPerChild * children,
      husbandAge - between(rnd, T.wifeYounger.from, T.wifeYounger.to),
    );
    const husband: Person = {
      id: state.nextId++,
      bornDay: bornDayFor(day, husbandAge, rnd),
      dwellingId: -1,
      sex: 'male',
      origin: direction,
    };
    const wife: Person = {
      id: state.nextId++,
      bornDay: bornDayFor(day, wifeAge, rnd),
      dwellingId: -1,
      sex: 'female',
      origin: direction,
      spouseId: husband.id,
    };
    husband.spouseId = wife.id;
    const kids: Person[] = [];
    let age = between(rnd, T.youngestChildAge.from, T.youngestChildAge.to);
    for (let i = 0; i < children; i++) {
      kids.push({
        id: state.nextId++,
        bornDay: bornDayFor(day, age, rnd),
        dwellingId: -1,
        sex: rnd.next() < 0.5 ? 'male' : 'female',
        motherId: wife.id,
        fatherId: husband.id,
        origin: direction,
      });
      age += between(rnd, T.childSpacing.from, T.childSpacing.to);
    }
    arrive('family', [husband, wife, ...kids]);
  }
  for (let i = 0; i < people.adults; i++) {
    const sex = rnd.next() < 0.5 ? 'male' : 'female';
    const adult: Person = {
      id: state.nextId++,
      bornDay: bornDayFor(day, between(rnd, T.adultAge.from, T.adultAge.to), rnd),
      dwellingId: -1,
      sex,
      origin: direction,
    };
    arrive(sex === 'male' ? 'man' : 'woman', [adult]);
  }
  return events;
}

/** Kolik lidí je ve skupinách. */
export function peopleCount(groups: readonly EmigrantGroup[]): number {
  return groups.reduce((sum, g) => sum + g.people.length, 0);
}
