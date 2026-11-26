// Lidé od souseda a lidé, které ves dá (docs/design/trade.md – Výměna lidí; Martin 19. 10. 2026).
// Výměna lidí se smyšlenými sousedy skončila s obchodní výpravou (markets.md – Pravidla 1); kód
// zůstává pro to, co je na cestě a co nesou zásilky vazalů (vassalage.md – Doprava a cílová ves):
// koho ves smí dát (`emigrantGroups` – nikdy dědice domu, vojvodovu domácnost ani nikoho, bez koho
// by se domácnost rozpadla; otroci jsou zboží a jdou každý sám – `sellableSlaves`, markets.md –
// Rozhodnutí plánu 5, bod 6) a kam přijdou lidé, které přivede výprava na cestě (`settleNewcomers`,
// markets.md – Pravidla 10). Čisté funkce bez I/O, náhoda ze seedu vsi.
import { isDisused } from '../buildings/disused';
import { isHouseType } from '../buildings/log-house';
import { createRandom, deriveSeed, type Random } from '../../landscape/random';
import { keptByLine } from '../people/dynasty';
import { familiesOf, unmarriedHeir } from '../people/households';
import { villageManorId } from '../people/manor';
import { isSingle } from '../people/marriage';
import { householdBreaksUp, isAway, isFertile, occupants } from '../people/people';
import { DWELLINGS, PEOPLE_TRADE } from '../rules';
import { NO_RESERVED, sellableSlaves } from './slaves';
import type {
  ChronicleEvent,
  ComingPeople,
  Direction8,
  Dwelling,
  NewcomerGroup,
  Person,
  Sex,
  TradePeople,
  VillageState,
} from '../types';

const DAYS_PER_YEAR = 365.25;

/** Žádní lidé. */
export const NO_PEOPLE: TradePeople = { families: 0, men: 0, women: 0 };

/** Kolik lidí ve výměně (otroci, rodiny, muži a ženy) – součet skupin; chybějící otroci = 0. */
export function tradePeopleCount(people: TradePeople): number {
  return (people.slaves ?? 0) + people.families + people.men + people.women;
}

/** Celé číslo v rozmezí od–do včetně. */
function between(rnd: Random, from: number, to: number): number {
  return from + Math.floor(rnd.next() * (to - from + 1));
}

/** Skupina lidí, kterou ves může dát (zásilka vazalů) – otrok sám, rodina, nebo svobodný muž či žena. */
export interface EmigrantGroup {
  kind: NewcomerGroup;
  /** Domácnost, ze které odchází. */
  dwellingId: number;
  people: Person[];
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
 * První rodina, kterou ves smí dát (`familiesOf` – dědic a jeho rodiče zůstávají) – bez mužů rodu
 * a jejich žen (`keptByLine`). Vdané dítě otroka z nabídky (`reserved`) s rodinou neodejde.
 */
function nextFamily(
  state: VillageState,
  day: number,
  reserved: ReadonlySet<number>,
): EmigrantGroup | undefined {
  const kept = keptByLine(state);
  for (const dwelling of givingDwellings(state)) {
    const family = familiesOf(state, dwelling, day, reserved).find(
      (f) => !f.people.some((p) => kept(p) || isAway(p, day)),
    );
    if (family) return group('family', dwelling.id, family.people);
  }
  return undefined;
}

/**
 * První svobodný muž (`sex` male) nebo žena 16–44 let, které ves smí dát: ne dědic domu
 * (`unmarriedHeir`), ne vdova s malými dětmi (`isSingle`), a jen když v domě zůstane někdo, kdo
 * domácnost udrží. Muž rodu ne (`keptByLine`). V domě od nejstaršího. Manžel otroka z nabídky
 * (`reserved`) není svobodný – ve `state` výběru otrok chybí, ale manželství trvá (ženatý bez
 * manžela neodchází – markets.md – Rozhodnutí plánu 3, bod 10, a plánu 5, bod 8).
 */
function nextSingle(
  state: VillageState,
  day: number,
  sex: Sex,
  reserved: ReadonlySet<number>,
): EmigrantGroup | undefined {
  const kept = keptByLine(state);
  for (const dwelling of givingDwellings(state)) {
    const members = occupants(state, dwelling.id);
    const heir = unmarriedHeir(members, day);
    const singles = members
      .filter(
        (p) =>
          p !== heir &&
          p.sex === sex &&
          !kept(p) &&
          !isAway(p, day) &&
          isFertile(p, day) &&
          !(p.spouseId !== undefined && reserved.has(p.spouseId)) &&
          isSingle(state, p, day),
      )
      .sort(byAge);
    for (const p of singles) {
      const staying = members.filter((m) => m !== p);
      if (staying.length === 0 || householdBreaksUp(staying, day)) continue;
      return group(sex === 'male' ? 'man' : 'woman', dwelling.id, [p]);
    }
  }
  return undefined;
}

function group(kind: EmigrantGroup['kind'], dwellingId: number, people: Person[]): EmigrantGroup {
  return { kind, dwellingId, people };
}

/** Koho ves dá – otroci, rodiny, svobodní muži a svobodné ženy (v pořadí výběru). */
export interface Emigrants {
  slaves: EmigrantGroup[];
  families: EmigrantGroup[];
  men: EmigrantGroup[];
  women: EmigrantGroup[];
}

/**
 * Koho ves dá sousedovi (trade.md – Výměna lidí, návrh Clauda): napřed nejvýš `want.slaves` otroků
 * (`sellableSlaves` – každý sám, markets.md – Rozhodnutí plánu 5, bod 6), pak z vsi bez nich
 * nejvýš `want.families` rodin, `want.men` svobodných mužů a `want.women` svobodných žen, postupně –
 * každá další skupina z vsi bez těch předchozích, vždy z nejvíc přeplněného domu (dvorec vojvody
 * ne). Rodina podle `familiesOf` (muž, žena a jejich svobodné děti; dědic domu a jeho rodiče
 * zůstávají, zbytek domácnosti se nesmí rozpadnout), muž a žena podle `nextSingle`. Výběr je
 * postupný, takže prvních n skupin je vždy stejných (náhled v panelu). Když tolik lidí není, vrátí
 * méně. Bez otroků ve `want` se prodejní otroci nehledají a výběr je týž jako před plánem 5.
 * `reserved` – otroci z nabídky vsi (`offeredSlaveIds`, markets.md – Rozhodnutí plánu 5, bod 8):
 * otroci se berou dál napřed ze `sellableSlaves` (rezervovaní jsou mezi nimi první), rodiny, muži
 * a ženy z vsi bez otroků výběru i bez rezervovaných; manžel rezervovaného otroka svobodný není
 * (`nextSingle`), ani když se otrok týmž výběrem prodává (nabídka hostitele a jeho prodej se
 * vybírají jedním voláním). Manžel jiného otroka prodaného výběrem svobodný je – postupné
 * `takePeople` z něj napřed udělá vdovce, takže výběr i odchod souhlasí. Chybí = prázdná, výběr
 * beze změny.
 */
export function emigrantGroups(
  state: VillageState,
  day: number,
  want: TradePeople,
  reserved: ReadonlySet<number> = NO_RESERVED,
): Emigrants {
  // otroci jedním řezem – každý jako skupina sám, ze vsi se odeberou najednou
  const slaves =
    (want.slaves ?? 0) > 0
      ? sellableSlaves(state, day)
          .slice(0, want.slaves)
          .map((p) => group('slave', p.dwellingId, [p]))
      : [];
  const sold = slaves.flatMap((g) => g.people);
  // rezervovaní otroci z nabídky zůstávají stranou – jako rodina, muž ani žena se nevyberou
  const kept = reserved.size > 0 ? state.people.filter((p) => reserved.has(p.id)) : [];
  const aside = [...sold, ...kept];
  let rest = aside.length > 0 ? without(state, aside) : state;
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
  const families = take(want.families, () => nextFamily(rest, day, reserved));
  const men = take(want.men, () => nextSingle(rest, day, 'male', reserved));
  const women = take(want.women, () => nextSingle(rest, day, 'female', reserved));
  return { slaves, families, men, women };
}

/** Všechny skupiny výběru v pořadí otroci, rodiny, muži, ženy. */
export function emigrantList(emigrants: Emigrants): EmigrantGroup[] {
  return [...emigrants.slaves, ...emigrants.families, ...emigrants.men, ...emigrants.women];
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
