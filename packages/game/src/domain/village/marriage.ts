// Sňatky (kinship.md – Sňatky; Martin, 18. 10. 2026: „Pojďme na příbuzenství a pohlaví“, sňatky
// s okolím varianta „c“, detaily návrh Clauda). Berou se jen svobodný muž a svobodná žena, kteří
// nejsou blízcí příbuzní; žena se stěhuje k muži. Kdo ve vsi nemá s kým se vzít, toho bere nebo
// dává okolí – zatím abstraktně (nevěsta z okolí, dcera se vdá pryč). Krok simulace
// `arrangeMarriages` stav mění, ostatní funkce jen čtou.
import { createRandom, deriveSeed } from '../landscape/random';
import { ageGapYears, areCloseKin, parentIndex, removePeople, type ParentIndex } from './kinship';
import { ageYears, householdBreaksUp, isFertile, occupants } from './people';
import { AGE, DWELLINGS, MARRIAGE, NEIGHBOR_DIRECTIONS } from './rules';
import type { ChronicleEvent, NeighborDirection, Person, VillageState } from './types';

const DAYS_PER_YEAR = 365.25;
/** Denní pravděpodobnost sňatku z okolí – MARRIAGE.outsidePerYear za rok. */
const OUTSIDE_PER_DAY = 1 - (1 - MARRIAGE.outsidePerYear) ** (1 / 365);

/** Od nejstaršího; při shodě data narození nižší id. */
function byAge(a: Person, b: Person): number {
  return a.bornDay - b.bornDay || a.id - b.id;
}

/** Má žena v domě vlastní dítě mladší 14 let? Vdova s ním zůstává v domě manžela. */
function hasYoungChildren(state: VillageState, woman: Person, day: number): boolean {
  return state.people.some(
    (p) =>
      p.motherId === woman.id &&
      p.dwellingId === woman.dwellingId &&
      ageYears(p.bornDay, day) < AGE.adult,
  );
}

/**
 * Svobodný (kinship.md – Sňatky): muž od 16 let nebo žena 16–44 bez žijícího manžela – i vdovec
 * a vdova. Vdova s vlastními dětmi do 14 let zůstává v domě manžela a nevdává se (návrh Clauda).
 */
export function isSingle(state: VillageState, p: Person, day: number): boolean {
  if (p.spouseId !== undefined && state.people.some((q) => q.id === p.spouseId)) return false;
  if (p.sex === 'male') return ageYears(p.bornDay, day) >= AGE.fertile;
  if (p.sex === 'female') return isFertile(p, day) && !hasYoungChildren(state, p, day);
  return false;
}

/** Svobodní vsi od nejstaršího (`isSingle`). */
export function singles(state: VillageState, day: number): Person[] {
  return state.people.filter((p) => isSingle(state, p, day)).sort(byAge);
}

/**
 * Smí se nevěsta přestěhovat k ženichovi? Ze stejného domu vždy. Jinak se její domácnost odchodem
 * nesmí rozpadnout (`householdBreaksUp` – rozpad by zbytek večer přestěhoval a rozpad vsi by se
 * rozjel) a ženichův dům nesmí být přeplněný – po svatbě je nejvýš o jednoho přes kapacitu.
 * Ženich se nestěhuje, takže nikoho nevrací do domu, ze kterého odešel (stěhování tam a zpět).
 */
export function canWed(state: VillageState, day: number, groom: Person, bride: Person): boolean {
  if (groom.dwellingId === bride.dwellingId) return true;
  const home = state.dwellings.find((d) => d.id === groom.dwellingId);
  if (!home) return false;
  const staying = occupants(state, bride.dwellingId).filter((p) => p.id !== bride.id);
  if (householdBreaksUp(staying, day)) return false;
  return occupants(state, home.id).length <= DWELLINGS[home.type].capacity;
}

/** Ženich a nevěsta dvojice různého pohlaví. */
function couple(a: Person, b: Person): { groom: Person; bride: Person } {
  return a.sex === 'male' ? { groom: a, bride: b } : { groom: b, bride: a };
}

/**
 * Nejbližší věkem svobodný opačného pohlaví mezi `candidates`, se kterým se `a` smí vzít: nejsou
 * blízcí příbuzní (`areCloseKin`), věkový rozdíl nejvýš MARRIAGE.maxAgeGapYears a nevěsta se smí
 * přestěhovat (`canWed`). Při shodě rozdílu nižší id; nikdo – undefined.
 */
export function bestMatch(
  state: VillageState,
  day: number,
  index: ParentIndex,
  a: Person,
  candidates: readonly Person[],
): Person | undefined {
  let best: Person | undefined;
  let bestGap = Infinity;
  for (const b of candidates) {
    if (b.id === a.id || b.sex === a.sex) continue;
    const gap = ageGapYears(a, b);
    if (gap > MARRIAGE.maxAgeGapYears || gap > bestGap) continue;
    if (gap === bestGap && best !== undefined && b.id > best.id) continue;
    if (areCloseKin(index, a.id, b.id)) continue;
    const { groom, bride } = couple(a, b);
    if (!canWed(state, day, groom, bride)) continue;
    best = b;
    bestGap = gap;
  }
  return best;
}

/** Svatba (mutuje stav): nevěsta se přestěhuje k ženichovi, z obou jsou manželé. */
function wed(groom: Person, bride: Person, day: number): ChronicleEvent {
  const from = bride.dwellingId;
  bride.dwellingId = groom.dwellingId;
  groom.spouseId = bride.id;
  bride.spouseId = groom.id;
  return { day, kind: 'marriage', fromDwellingId: from, toDwellingId: groom.dwellingId };
}

/**
 * Sňatky dne (mutuje stav – kinship.md, Sňatky): nejdřív ve vsi – svobodní od nejstaršího, každý
 * s nejbližším věkem, se kterým svatba jde (`bestMatch`); jeden sňatek na člověka. Pak z okolí
 * (Martin – varianta c): svobodný muž od 18 let, který ve vsi nemá s kým se oženit, si s denní
 * pravděpodobností odpovídající MARRIAGE.outsidePerYear ročně přivede ženu z okolí (16–22 let,
 * rodiče neznámí – do přeplněného domu ne, ani když ves hladoví); svobodná žena od 18 let bez
 * možného ženicha se stejně
 * vdá pryč, když se jí domácnost odchodem nerozpadne. Los ze seedu vsi a dne (každý v pořadí id),
 * takže výsledek nezávisí na kouscích dopočtu. Vrací události kroniky.
 */
export function arrangeMarriages(state: VillageState, day: number): ChronicleEvent[] {
  const index = parentIndex(state);
  const events: ChronicleEvent[] = [];
  const married = new Set<number>();
  const list = singles(state, day);
  for (const a of list) {
    if (married.has(a.id)) continue;
    const b = bestMatch(
      state,
      day,
      index,
      a,
      list.filter((c) => !married.has(c.id)),
    );
    if (!b) continue;
    const { groom, bride } = couple(a, b);
    events.push(wed(groom, bride, day));
    married.add(a.id);
    married.add(b.id);
  }
  events.push(...outsideMarriages(state, day, index, married));
  return events;
}

/** Sňatky s okolím dne (mutuje stav) – viz `arrangeMarriages`. */
function outsideMarriages(
  state: VillageState,
  day: number,
  index: ParentIndex,
  married: ReadonlySet<number>,
): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  const random = createRandom(deriveSeed(state.seed, 'marriage:' + day));
  const candidates = singles(state, day)
    .filter((p) => !married.has(p.id) && ageYears(p.bornDay, day) >= MARRIAGE.outsideFromAge)
    .sort((a, b) => a.id - b.id);
  const leaving = new Map<number, NeighborDirection>();
  for (const p of candidates) {
    const village = singles(state, day).filter((c) => !leaving.has(c.id));
    if (bestMatch(state, day, index, p, village)) continue;
    if (random.next() >= OUTSIDE_PER_DAY) continue;
    if (p.sex === 'male') {
      // v hladu si nevěstu z okolí nikdo nepřivede – byla by jen další ústa (návrh Clauda)
      if (state.hungry) continue;
      const home = state.dwellings.find((d) => d.id === p.dwellingId);
      if (!home || occupants(state, home.id).length > DWELLINGS[home.type].capacity) continue;
      const { from, to } = MARRIAGE.brideAge;
      const years = from + random.next() * (to - from);
      const bride: Person = {
        id: state.nextId++,
        bornDay: day - Math.ceil(years * DAYS_PER_YEAR),
        dwellingId: p.dwellingId,
        sex: 'female',
        spouseId: p.id,
        origin: neighbor(random.next()),
      };
      p.spouseId = bride.id;
      state.people.push(bride);
      events.push({ day, kind: 'bride-from-outside', dwellingId: p.dwellingId });
    } else {
      const staying = occupants(state, p.dwellingId).filter(
        (q) => q.id !== p.id && !leaving.has(q.id),
      );
      if (householdBreaksUp(staying, day)) continue;
      leaving.set(p.id, neighbor(random.next()));
      events.push({ day, kind: 'married-away', dwellingId: p.dwellingId });
    }
  }
  removePeople(state, new Set(leaving.keys()), leaving);
  return events;
}

/** Sousední ves podle losu 0–1 – jeden z osmi směrů (NEIGHBOR_DIRECTIONS). */
function neighbor(roll: number): NeighborDirection {
  const i = Math.min(NEIGHBOR_DIRECTIONS.length - 1, Math.floor(roll * NEIGHBOR_DIRECTIONS.length));
  return NEIGHBOR_DIRECTIONS[i] ?? 'N';
}
