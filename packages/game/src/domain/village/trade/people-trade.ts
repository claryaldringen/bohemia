import { isDisused } from '../buildings/disused';
import { isHouseType } from '../buildings/log-house';
// Výměna lidí se sousedem (docs/design/trade.md – Výměna lidí; Martin 19. 10. 2026: „Se sousedem
// půjde vyměnit i lidi... např. když on jich bude mít moc a nebude je moci uživit, může jich pár
// vyměnit s námi za nějaké suroviny a opačně.“, „Mohou se stěhovat celé rodiny i jen dospělí.
// Podle toho, co je v nabídce.“; detaily návrh Clauda). Soused má na rok obchodu lidi navíc, nebo
// lidi shání (`neighbourPeople`); vyměňují se celé rodiny (muž, žena a jejich svobodné děti)
// a svobodní muži a ženy 16–44 let zvlášť (Martin 19. 10. 2026 – ve vsi pak bude, s kým založit
// domácnost) za zboží podle hodnoty v kg obilí. Koho ves dá, vybere jádro
// (`emigrantGroups`) – nikdy dědice domu, vojvodovu domácnost ani nikoho, bez koho by se domácnost
// rozpadla; odejdou hned s výpravou. Lidé od souseda přijdou s návratem výpravy
// (`settleNewcomers`). Čisté funkce bez I/O, náhoda ze seedu vsi.
import { createRandom, deriveSeed, type Random } from '../../landscape/random';
import { isDynastyTracked, lineMen } from '../people/dynasty';
import { familiesOf, unmarriedHeir } from '../people/households';
import { villageManorId } from '../people/manor';
import { isSingle } from '../people/marriage';
import { ageGroup, householdBreaksUp, isFertile, occupants } from '../people/people';
import { DWELLINGS, PEOPLE_TRADE } from '../rules';
import type {
  ChronicleEvent,
  ComingPeople,
  Direction8,
  Dwelling,
  NeighbourPeople,
  NewcomerGroup,
  Person,
  Sex,
  TradePeople,
  VillageState,
} from '../types';

const DAYS_PER_YEAR = 365.25;

/** Žádní lidé. */
export const NO_PEOPLE: TradePeople = { families: 0, men: 0, women: 0 };

/** Kolik lidí ve výměně (rodiny, muži a ženy) – součet skupin. */
export function tradePeopleCount(people: TradePeople): number {
  return people.families + people.men + people.women;
}

/** Celé číslo v rozmezí od–do včetně. */
function between(rnd: Random, from: number, to: number): number {
  return from + Math.floor(rnd.next() * (to - from + 1));
}

/** Svobodní dospělí podle losu pohlaví – muži a ženy zvlášť (každý dospělý jeden los). */
function splitAdults(rnd: Random, adults: number): { men: number; women: number } {
  let men = 0;
  for (let i = 0; i < adults; i++) if (rnd.next() < 0.5) men++;
  return { men, women: adults - men };
}

/**
 * Lidé souseda ve směru `direction` na rok obchodu `season` (trade.md – Výměna lidí, návrh Clauda):
 * deterministicky ze seedu, směru a roku – s PEOPLE_TRADE.surplusChance má lidi navíc (0–2 rodiny
 * s 0–3 dětmi a 0–3 svobodné dospělé, aspoň jednoho), s PEOPLE_TRADE.shortageChance lidi shání
 * (vezme 0–2 rodiny a 0–3 dospělé, aspoň jednoho), jinak lidi nemění. Svobodní dospělí jsou muži
 * a ženy zvlášť (Martin 19. 10. 2026) – pohlaví se losuje až na konci, takže rodiny a počet
 * dospělých jsou stejné jako dřív, kdy se pohlaví losovalo až při příchodu.
 */
export function neighbourPeople(
  seed: number,
  direction: Direction8,
  season: number,
): NeighbourPeople {
  const rnd = createRandom(deriveSeed(seed, `neighbour-people:${direction}:${season}`));
  const roll = rnd.next();
  const { families, adults, children } = PEOPLE_TRADE;
  const count = (): { families: number; adults: number } => {
    const f = between(rnd, families.min, families.max);
    const a = between(rnd, adults.min, adults.max);
    return f + a > 0 ? { families: f, adults: a } : { families: 0, adults: 1 };
  };
  if (roll < PEOPLE_TRADE.surplusChance) {
    const offer = count();
    const kids = Array.from({ length: offer.families }, () =>
      between(rnd, children.min, children.max),
    );
    return { families: kids, ...splitAdults(rnd, offer.adults), takes: { ...NO_PEOPLE } };
  }
  if (roll < PEOPLE_TRADE.surplusChance + PEOPLE_TRADE.shortageChance) {
    const want = count();
    return {
      families: [],
      men: 0,
      women: 0,
      takes: { families: want.families, ...splitAdults(rnd, want.adults) },
    };
  }
  return { families: [], men: 0, women: 0, takes: { ...NO_PEOPLE } };
}

/** Zbytek roku souseda uložený před muži a ženami zvlášť – dospělí bez pohlaví. */
interface LegacyPeople {
  families: number[];
  adults?: number;
  men?: number;
  women?: number;
  takes: { families: number; adults?: number; men?: number; women?: number };
}

/**
 * Lidé souseda ze zbytku roku – uložené dřív s `adults` (bez pohlaví) se deterministicky převedou
 * na muže a ženy podle povahy roku (`neighbourPeople`): nejdřív tolik mužů, kolik jich soused
 * ten rok měl, zbytek ženy. Nové se vrátí beze změny.
 */
export function storedNeighbourPeople(
  stored: NeighbourPeople,
  seed: number,
  direction: Direction8,
  season: number,
): NeighbourPeople {
  const legacy = stored as LegacyPeople;
  if (legacy.adults === undefined && legacy.takes.adults === undefined) return stored;
  const nature = neighbourPeople(seed, direction, season);
  const split = (
    adults: number | undefined,
    men: number | undefined,
    women: number | undefined,
    natureMen: number,
  ): { men: number; women: number } => {
    if (adults === undefined) return { men: men ?? 0, women: women ?? 0 };
    const m = Math.min(natureMen, adults);
    return { men: m, women: adults - m };
  };
  return {
    families: [...legacy.families],
    ...split(legacy.adults, legacy.men, legacy.women, nature.men),
    takes: {
      families: legacy.takes.families,
      ...split(legacy.takes.adults, legacy.takes.men, legacy.takes.women, nature.takes.men),
    },
  };
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

/** Skupina lidí, kterou ves může dát sousedovi – rodina, nebo svobodný muž či žena. */
export interface EmigrantGroup {
  kind: NewcomerGroup;
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

/**
 * Koho ves sousedovi nedá – muže rodu ani manželku muže rodu (lord.md – Rod vojvody, Manželky;
 * návrh Clauda: rod se nesmí dát sousedovi). Ves bez rodu dá kohokoli.
 */
function keptByLine(state: VillageState): (p: Person) => boolean {
  if (!isDynastyTracked(state)) return () => false;
  const line = new Set(lineMen(state).map((p) => p.id));
  return (p) => line.has(p.id) || (p.spouseId !== undefined && line.has(p.spouseId));
}

/**
 * První rodina, kterou ves smí dát (`familiesOf` – dědic a jeho rodiče zůstávají) – bez mužů rodu
 * a jejich žen (`keptByLine`).
 */
function nextFamily(state: VillageState, day: number): EmigrantGroup | undefined {
  const kept = keptByLine(state);
  for (const dwelling of givingDwellings(state)) {
    const family = familiesOf(state, dwelling, day).find((f) => !f.people.some(kept));
    if (family) return group('family', dwelling.id, family.people, day);
  }
  return undefined;
}

/**
 * První svobodný muž (`sex` male) nebo žena 16–44 let, které ves smí dát: ne dědic domu
 * (`unmarriedHeir`), ne vdova s malými dětmi (`isSingle`), a jen když v domě zůstane někdo, kdo
 * domácnost udrží. Muž rodu ne (`keptByLine`). V domě od nejstaršího.
 */
function nextSingle(state: VillageState, day: number, sex: Sex): EmigrantGroup | undefined {
  const kept = keptByLine(state);
  for (const dwelling of givingDwellings(state)) {
    const members = occupants(state, dwelling.id);
    const heir = unmarriedHeir(members, day);
    const singles = members
      .filter(
        (p) =>
          p !== heir && p.sex === sex && !kept(p) && isFertile(p, day) && isSingle(state, p, day),
      )
      .sort(byAge);
    for (const p of singles) {
      const staying = members.filter((m) => m !== p);
      if (staying.length === 0 || householdBreaksUp(staying, day)) continue;
      return group(sex === 'male' ? 'man' : 'woman', dwelling.id, [p], day);
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

/** Koho ves dá – rodiny, svobodní muži a svobodné ženy (v pořadí výběru). */
export interface Emigrants {
  families: EmigrantGroup[];
  men: EmigrantGroup[];
  women: EmigrantGroup[];
}

/**
 * Koho ves dá sousedovi (trade.md – Výměna lidí, návrh Clauda): nejvýš `want.families` rodin, pak
 * `want.men` svobodných mužů a `want.women` svobodných žen, postupně – každá další skupina z vsi
 * bez těch předchozích, vždy z nejvíc přeplněného domu (dvorec vojvody ne). Rodina podle
 * `familiesOf` (muž, žena a jejich svobodné děti; dědic domu a jeho rodiče zůstávají, zbytek
 * domácnosti se nesmí rozpadnout), muž a žena podle `nextSingle`. Výběr je postupný, takže prvních
 * n skupin je vždy stejných (náhled v panelu). Když tolik lidí není, vrátí méně.
 */
export function emigrantGroups(state: VillageState, day: number, want: TradePeople): Emigrants {
  let rest = state;
  const take = (count: number, next: () => EmigrantGroup | undefined): EmigrantGroup[] => {
    const out: EmigrantGroup[] = [];
    while (out.length < count) {
      const g = next();
      if (!g) break;
      out.push(g);
      rest = without(rest, g.people);
    }
    return out;
  };
  const families = take(want.families, () => nextFamily(rest, day));
  const men = take(want.men, () => nextSingle(rest, day, 'male'));
  const women = take(want.women, () => nextSingle(rest, day, 'female'));
  return { families, men, women };
}

/** Všechny skupiny výběru v pořadí rodiny, muži, ženy. */
export function emigrantList(emigrants: Emigrants): EmigrantGroup[] {
  return [...emigrants.families, ...emigrants.men, ...emigrants.women];
}

/** Člověk od souseda: pohlaví, věk v letech a dny navíc (narozeniny – los) a role ve skupině. */
export interface NewcomerMember {
  sex: Sex;
  ageYears: number;
  extraDays: number;
  role: 'husband' | 'wife' | 'child' | 'single';
}

/** Skupina lidí od souseda – rodina (muž, žena, děti), nebo svobodný muž či žena. */
export interface NewcomerProfile {
  group: NewcomerGroup;
  members: NewcomerMember[];
}

/** Věk v letech a dny navíc (los) – den narození `day − roky − dny navíc`. */
function ageWithDays(rnd: Random, years: number): { ageYears: number; extraDays: number } {
  return { ageYears: years, extraDays: Math.floor(rnd.next() * 365) };
}

/**
 * Kdo s výpravou přijde (trade.md – Výměna lidí) – pohlaví a věk z losu ze seedu vsi a klíče
 * výpravy (`key` = id výpravy), stejně při příchodu (`settleNewcomers`) i pro postavy ve scéně
 * (karavana jde zpátky s nimi). Rodina souseda: muž PEOPLE_TRADE.husbandAge, žena o
 * PEOPLE_TRADE.wifeYounger let mladší (aspoň 18 + 3 roky na dítě), děti od nejmladšího. Svobodní
 * dospělí z výprav uložených dřív (`adults`) losují pohlaví jako dřív, muži a ženy zvlášť ho mají
 * dané. Čistá funkce.
 */
export function newcomerProfiles(
  seed: number,
  key: string,
  people: ComingPeople,
): NewcomerProfile[] {
  const rnd = createRandom(deriveSeed(seed, `newcomers:${key}`));
  const T = PEOPLE_TRADE;
  const out: NewcomerProfile[] = [];
  for (const children of people.families) {
    const husbandAge = between(rnd, T.husbandAge.from, T.husbandAge.to);
    const wifeAge = Math.max(
      T.wifeMinAge + T.wifeYearsPerChild * children,
      husbandAge - between(rnd, T.wifeYounger.from, T.wifeYounger.to),
    );
    const members: NewcomerMember[] = [
      { sex: 'male', role: 'husband', ...ageWithDays(rnd, husbandAge) },
      { sex: 'female', role: 'wife', ...ageWithDays(rnd, wifeAge) },
    ];
    let age = between(rnd, T.youngestChildAge.from, T.youngestChildAge.to);
    for (let i = 0; i < children; i++) {
      const kid = ageWithDays(rnd, age);
      members.push({ sex: rnd.next() < 0.5 ? 'male' : 'female', role: 'child', ...kid });
      age += between(rnd, T.childSpacing.from, T.childSpacing.to);
    }
    out.push({ group: 'family', members });
  }
  const single = (sex: Sex): NewcomerProfile => {
    const years = between(rnd, T.adultAge.from, T.adultAge.to);
    return {
      group: sex === 'male' ? 'man' : 'woman',
      members: [{ sex, role: 'single', ...ageWithDays(rnd, years) }],
    };
  };
  // výprava uložená dřív – pohlaví se losuje jako dřív
  for (let i = 0; i < (people.adults ?? 0); i++)
    out.push(single(rnd.next() < 0.5 ? 'male' : 'female'));
  for (let i = 0; i < (people.men ?? 0); i++) out.push(single('male'));
  for (let i = 0; i < (people.women ?? 0); i++) out.push(single('female'));
  return out;
}

/**
 * Kam půjdou lidé od souseda: rodina do prázdného obydlí (nejnižší id, ne nadzemní dům); když žádné není – stejně
 * jako svobodný dospělý – do obydlí s nejvíc volnými místy (smí ho dočasně přeplnit; při shodě
 * nižší id), mezi obydlenými, je-li nějaké. Řemeslné dílny až nakonec (jejich domácnost pracuje
 * v dílně) a rodina do dvorce vojvody jen, když jinam nemůže – v domě bez ženatého syna zůstává
 * nejstarší ženatý muž, takže by se z dvorce mohla odstěhovat vojvodova rodina místo přišlých.
 */
export function newcomerHome(state: VillageState, family: boolean): number | undefined {
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  const byId = state.dwellings.filter((d) => !isDisused(d)).sort((a, b) => a.id - b.id);
  if (family) {
    // prázdný nadzemní dům obsadí jen lidé z pořadí (log-house.md – Kdo v domě bydlí)
    const empty = byId.find(
      (d) => !occupied.has(d.id) && d.workshop === undefined && !isHouseType(d.type),
    );
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
 * (muž, žena a jejich děti) a svobodní muži a ženy (`newcomerProfiles`). Rodiče dospělých jsou
 * neznámí (s lidmi vsi nepříbuzní), děti mají rodiče z rodiny, všichni nesou `origin` = směr
 * souseda (kinship.md, war.md). Rodina jde do prázdného obydlí, jinak do domu s nejvíc místy
 * (`newcomerHome`) – tam je pak ženatý muž bez rodičů v domě, takže smí do nového domu (lidé
 * k osídlení); svobodný muž či žena do domu s nejvíc místy a vezme se podle pravidel sňatků. Věk
 * a pohlaví z losu ze seedu vsi a id výpravy (`key`) – nezávisle na kouscích dopočtu. Vrací kroniku.
 */
export function settleNewcomers(
  state: VillageState,
  day: number,
  direction: Direction8,
  people: ComingPeople,
  key: string,
): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  for (const profile of newcomerProfiles(state.seed, key, people)) {
    const newcomers: Person[] = [];
    let husband: Person | undefined;
    let wife: Person | undefined;
    for (const m of profile.members) {
      const person: Person = {
        id: state.nextId++,
        bornDay: day - Math.floor(m.ageYears * DAYS_PER_YEAR) - m.extraDays,
        dwellingId: -1,
        sex: m.sex,
        origin: direction,
      };
      if (m.role === 'husband') husband = person;
      if (m.role === 'wife' && husband) {
        wife = person;
        person.spouseId = husband.id;
        husband.spouseId = person.id;
      }
      if (m.role === 'child' && husband && wife) {
        person.motherId = wife.id;
        person.fatherId = husband.id;
      }
      newcomers.push(person);
    }
    const home = newcomerHome(state, profile.group === 'family');
    if (home === undefined) continue;
    for (const p of newcomers) p.dwellingId = home;
    state.people.push(...newcomers);
    events.push({
      day,
      kind: 'newcomer',
      direction,
      group: profile.group,
      people: newcomers.length,
      dwellingId: home,
    });
  }
  return events;
}

/** Kolik lidí je ve skupinách. */
export function peopleCount(groups: readonly EmigrantGroup[]): number {
  return groups.reduce((sum, g) => sum + g.people.length, 0);
}
