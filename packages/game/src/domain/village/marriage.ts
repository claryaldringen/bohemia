// Sňatky (kinship.md – Sňatky; Martin, 18. 10. 2026: „Pojďme na příbuzenství a pohlaví“, sňatky
// s okolím varianta „c“, detaily návrh Clauda; 19. 10. 2026: „Vdova by se měla snažit co nejdříve
// vdát, ideálně ve vesnici. Obecně by měla být pravidla nastavena tak, aby se populace co nejvíce
// rozrůstala.“). Berou se jen svobodný muž a svobodná žena, kteří nejsou blízcí příbuzní; žena se
// stěhuje k muži i s vlastními dětmi, jen když drží dům a muž ne, přižení se muž k ní. Kdo ve vsi
// nemá s kým se vzít, toho bere nebo dává okolí – zatím abstraktně (nevěsta a ženich z okolí,
// dcera se vdá pryč). Krok simulace `arrangeMarriages` stav mění, ostatní funkce jen čtou.
import { createRandom, deriveSeed } from '../landscape/random';
import { ageGapYears, areCloseKin, parentIndex, removePeople, type ParentIndex } from './kinship';
import { ageYears, holdsHousehold, householdBreaksUp, isFertile, occupants } from './people';
import { AGE, BIRTH_SPACING, DWELLINGS, MARRIAGE, NEIGHBOR_DIRECTIONS } from './rules';
import type { ChronicleEvent, NeighborDirection, Person, VillageState } from './types';

const DAYS_PER_YEAR = 365.25;

/** Denní pravděpodobnost události, která nastane `perYear` ročně. */
function perDay(perYear: number): number {
  return 1 - (1 - perYear) ** (1 / 365);
}

/** Od nejstaršího; při shodě data narození nižší id. */
function byAge(a: Person, b: Person): number {
  return a.bornDay - b.bornDay || a.id - b.id;
}

/**
 * Svobodný (kinship.md – Sňatky): muž od 16 let nebo žena 16–44 bez žijícího manžela – i vdovec
 * a vdova, i s malými dětmi (Martin, 19. 10. 2026 – dřív se vdova s dětmi do 14 let nevdávala).
 */
export function isSingle(state: VillageState, p: Person, day: number): boolean {
  if (p.spouseId !== undefined && state.people.some((q) => q.id === p.spouseId)) return false;
  if (p.sex === 'male') return ageYears(p.bornDay, day) >= AGE.fertile;
  if (p.sex === 'female') return isFertile(p, day);
  return false;
}

/** Svobodní vsi od nejstaršího (`isSingle`). */
export function singles(state: VillageState, day: number): Person[] {
  return state.people.filter((p) => isSingle(state, p, day)).sort(byAge);
}

/**
 * Id rodičů – kdo ve vsi, v rodokmenu nebo mezi odešlými má dítě. Děti se rodí jen manželským
 * párům, takže svobodný rodič je vdova nebo vdovec (`isWidowed`).
 */
export function parentIds(state: VillageState): Set<number> {
  const ids = new Set<number>();
  for (const p of [...state.people, ...(state.ancestors ?? []), ...(state.emigrants ?? [])]) {
    if (p.motherId !== undefined) ids.add(p.motherId);
    if (p.fatherId !== undefined) ids.add(p.fatherId);
  }
  return ids;
}

/**
 * Vdova nebo vdovec – svobodný, který už má (nebo měl) dítě. Ve vsích uložených dřív se tak pozná
 * i vdova, která čeká – ovdovění se nikde nezapisuje.
 */
export function isWidowed(
  state: VillageState,
  p: Person,
  day: number,
  parents: ReadonlySet<number> = parentIds(state),
): boolean {
  return parents.has(p.id) && isSingle(state, p, day);
}

/** Vlastní děti mladší 16 let z domu člověka `p` – při svatbě jdou s ním (kinship.md – Sňatky). */
export function dependants(state: VillageState, p: Person, day: number): Person[] {
  return state.people.filter(
    (c) =>
      (c.motherId === p.id || c.fatherId === p.id) &&
      c.dwellingId === p.dwellingId &&
      ageYears(c.bornDay, day) < AGE.fertile,
  );
}

/**
 * Drží svobodný `p` svůj dům (kinship.md – Sňatky)? Ano, když s ním odejdou jeho děti mladší
 * 16 let a doma po nich nezůstane nikdo 16–44, kdo by dům držel – vdova (vdovec) s dětmi, nebo
 * dcera či syn, po jejichž odchodu by zůstali jen starší a děti (dědic, bez kterého dům nejde).
 * Syn, po kterém doma zůstane otec nebo sourozenec 16–44, dům nedrží, ani kdo žije sám a dětí
 * nemá – smí se přiženit jinam (návrh Clauda – jinak by se vdova s dětmi stěhovala do plného
 * domu a její zůstal prázdný).
 */
export function holdsHome(state: VillageState, p: Person, day: number): boolean {
  const members = occupants(state, p.dwellingId);
  const leaving = new Set([p.id, ...dependants(state, p, day).map((c) => c.id)]);
  const staying = members.filter((m) => !leaving.has(m.id));
  if (staying.some((m) => holdsHousehold(m, day))) return false;
  return staying.length > 0 || leaving.size > 1;
}

/**
 * Kam po svatbě (kinship.md – Sňatky): žena se stěhuje k muži, i do přeplněného domu (Martin,
 * 19. 10. 2026: „Jinak jde ona s dětmi k němu, i za cenu přeplnění.“); když drží svůj dům ona
 * a on ne, přižení se on k ní (`holdsHome`). Drží-li dům oba, stěhuje se ten, u koho bude po
 * svatbě méně těsno (lidé nad kapacitu), při shodě žena (návrh Clauda – jinak by vdova s pěti
 * dětmi odešla z polozemnice do zemnice a polozemnice zůstala prázdná). Kdo se stěhuje, vezme
 * s sebou vlastní děti mladší 16 let (`dependants`). Ze stejného domu se nikdo nestěhuje. Null –
 * nový domov ještě nestojí (zakladatelé na staveništi první zemnice).
 */
export function weddingHome(
  state: VillageState,
  day: number,
  groom: Person,
  bride: Person,
): { mover: Person; dwellingId: number } | null {
  if (groom.dwellingId === bride.dwellingId) return { mover: bride, dwellingId: bride.dwellingId };
  const brideHolds = holdsHome(state, bride, day);
  const groomHolds = holdsHome(state, groom, day);
  const groomMoves =
    brideHolds &&
    (!groomHolds ||
      crowdingAfter(state, day, groom, bride) < crowdingAfter(state, day, bride, groom));
  const home = groomMoves ? bride.dwellingId : groom.dwellingId;
  if (!state.dwellings.some((d) => d.id === home)) return null;
  return { mover: groomMoves ? groom : bride, dwellingId: home };
}

/**
 * O kolik lidí bude dům `host` po svatbě přes kapacitu, když se k němu přestěhuje `mover` i se
 * svými dětmi do 16 let; neexistující dům nekonečno.
 */
function crowdingAfter(state: VillageState, day: number, mover: Person, host: Person): number {
  const home = state.dwellings.find((d) => d.id === host.dwellingId);
  if (!home) return Infinity;
  const coming = 1 + dependants(state, mover, day).length;
  return occupants(state, home.id).length + coming - DWELLINGS[home.type].capacity;
}

/**
 * Smí se ti dva vzít – mají kde bydlet (`weddingHome`)? Přeplněný dům ani rozpad domácnosti, ze
 * které se odchází, svatbě nebrání (Martin, 19. 10. 2026 – co nejvíc růstu): kdo dům drží,
 * k tomu se ten druhý přestěhuje, a zbytek rozpadlé domácnosti se odstěhuje k příbuzným.
 */
export function canWed(state: VillageState, day: number, groom: Person, bride: Person): boolean {
  return weddingHome(state, day, groom, bride) !== null;
}

/** Ženich a nevěsta dvojice různého pohlaví. */
function couple(a: Person, b: Person): { groom: Person; bride: Person } {
  return a.sex === 'male' ? { groom: a, bride: b } : { groom: b, bride: a };
}

/** Největší věkový rozdíl snoubenců – s vdovou nebo vdovcem větší (MARRIAGE). */
function maxAgeGap(widowed: boolean): number {
  return widowed ? MARRIAGE.maxAgeGapWidowedYears : MARRIAGE.maxAgeGapYears;
}

/**
 * Nejbližší věkem svobodný opačného pohlaví mezi `candidates`, se kterým se `a` smí vzít: nejsou
 * blízcí příbuzní (`areCloseKin`), věkový rozdíl nejvýš MARRIAGE.maxAgeGapYears (je-li jeden
 * z nich vdovec nebo vdova – `parents` –, maxAgeGapWidowedYears) a mají kde bydlet (`canWed`).
 * Při shodě rozdílu nižší id; nikdo – undefined.
 */
export function bestMatch(
  state: VillageState,
  day: number,
  index: ParentIndex,
  a: Person,
  candidates: readonly Person[],
  parents: ReadonlySet<number> = parentIds(state),
): Person | undefined {
  let best: Person | undefined;
  let bestGap = Infinity;
  for (const b of candidates) {
    if (b.id === a.id || b.sex === a.sex) continue;
    const gap = ageGapYears(a, b);
    if (gap > maxAgeGap(parents.has(a.id) || parents.has(b.id)) || gap > bestGap) continue;
    if (gap === bestGap && best !== undefined && b.id > best.id) continue;
    if (areCloseKin(index, a.id, b.id)) continue;
    const { groom, bride } = couple(a, b);
    if (!canWed(state, day, groom, bride)) continue;
    best = b;
    bestGap = gap;
  }
  return best;
}

/** Těhotenství po svatbě – žena porodí nejdřív za BIRTH_SPACING.afterWeddingDays (mutuje). */
function startMarriage(bride: Person, day: number): void {
  bride.nextBirthFrom = Math.max(bride.nextBirthFrom ?? day, day + BIRTH_SPACING.afterWeddingDays);
}

/**
 * Svatba (mutuje stav): kdo se stěhuje (`weddingHome`), přestěhuje se i s vlastními dětmi do
 * 16 let, z obou jsou manželé.
 */
function wed(
  state: VillageState,
  day: number,
  groom: Person,
  bride: Person,
  widow: boolean,
): ChronicleEvent {
  const groomFrom = groom.dwellingId;
  const brideFrom = bride.dwellingId;
  const home = weddingHome(state, day, groom, bride);
  const mover = home?.mover ?? bride;
  const to = home?.dwellingId ?? groom.dwellingId;
  const from = mover.dwellingId;
  for (const child of dependants(state, mover, day)) child.dwellingId = to;
  mover.dwellingId = to;
  groom.spouseId = bride.id;
  bride.spouseId = groom.id;
  startMarriage(bride, day);
  return {
    day,
    kind: 'marriage',
    fromDwellingId: from,
    toDwellingId: to,
    ...(mover === groom && from !== to ? { groomMoved: true as const } : {}),
    ...(widow ? { widow: true as const } : {}),
    groomId: groom.id,
    brideId: bride.id,
    groomFromDwellingId: groomFrom,
    brideFromDwellingId: brideFrom,
  };
}

/**
 * Sňatky dne (mutuje stav – kinship.md, Sňatky): nejdřív ve vsi – vdovy a vdovci mají přednost
 * (Martin, 19. 10. 2026 – vdova se má vdát co nejdřív, nejlépe ve vsi), pak ostatní svobodní od
 * nejstaršího, každý s nejbližším věkem, se kterým svatba jde (`bestMatch`); jeden sňatek na
 * člověka. Pak s okolím (`outsideMarriages`). Los ze seedu vsi a dne (každý v pořadí id), takže
 * výsledek nezávisí na kouscích dopočtu. Vrací události kroniky.
 */
export function arrangeMarriages(state: VillageState, day: number): ChronicleEvent[] {
  const index = parentIndex(state);
  const parents = parentIds(state);
  const events: ChronicleEvent[] = [];
  const married = new Set<number>();
  const list = singles(state, day);
  const widowed = list.filter((p) => parents.has(p.id));
  for (const a of [...widowed, ...list.filter((p) => !parents.has(p.id))]) {
    if (married.has(a.id)) continue;
    const b = bestMatch(
      state,
      day,
      index,
      a,
      list.filter((c) => !married.has(c.id)),
      parents,
    );
    if (!b) continue;
    const { groom, bride } = couple(a, b);
    events.push(wed(state, day, groom, bride, parents.has(bride.id)));
    married.add(a.id);
    married.add(b.id);
  }
  events.push(...outsideMarriages(state, day, index, parents, married));
  return events;
}

/**
 * Patří svobodná žena mezi ty, ke kterým se muž z okolí přižení raději, než aby se vdala pryč
 * (Martin, 19. 10. 2026 – „hlavně k vdově nebo dceři z domu bez mužů“)? Vdova (má děti), žena,
 * která drží dům (`holdsHome` – dědička), nebo žena z domu, kde není jiný muž od 16 let.
 */
function favouredBride(
  state: VillageState,
  woman: Person,
  day: number,
  parents: ReadonlySet<number>,
): boolean {
  if (parents.has(woman.id) || holdsHome(state, woman, day)) return true;
  return !occupants(state, woman.dwellingId).some(
    (m) => m.sex === 'male' && ageYears(m.bornDay, day) >= AGE.fertile,
  );
}

/** Je dům člověka `p` přeplněný (víc lidí než míst)? Neexistující dům ano. */
function crowded(state: VillageState, p: Person): boolean {
  const home = state.dwellings.find((d) => d.id === p.dwellingId);
  return !home || occupants(state, home.id).length > DWELLINGS[home.type].capacity;
}

/**
 * Sňatky s okolím dne (mutuje stav – Martin, varianta c): svobodní od MARRIAGE.outsideFromAge
 * let, kteří ve vsi nemají s kým se vzít, v pořadí id, jeden los dne. Muž si s denní
 * pravděpodobností odpovídající MARRIAGE.outside.bridePerYear ročně přivede nevěstu z okolí
 * (rodiče neznámí, odkud přišla); k ženě se přižení muž z okolí (groomPerYear, u vdovy, dědičky
 * a ženy z domu bez mužů favouredGroomPerYear), jinak se s awayPerYear vdá pryč (vdova, dědička
 * ani žena z domu bez mužů ne), když se jí domácnost odchodem nerozpadne. Z okolí nikdo nepřijde,
 * když ves hladoví (byla by jen další ústa), ani do přeplněného domu (návrh Clauda).
 */
function outsideMarriages(
  state: VillageState,
  day: number,
  index: ParentIndex,
  parents: ReadonlySet<number>,
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
    if (bestMatch(state, day, index, p, village, parents)) continue;
    const roll = random.next();
    const age = (day - p.bornDay) / DAYS_PER_YEAR;
    const widowed = parents.has(p.id);
    if (p.sex === 'male') {
      if (roll >= perDay(MARRIAGE.outside.bridePerYear)) continue;
      if (state.hungry || crowded(state, p)) continue;
      // nevěsta 16–22 let; starší muž si bere ženu nejvýš o povolený rozdíl mladší, do 44 let
      const from = Math.min(
        AGE.elder - 1,
        Math.max(MARRIAGE.brideAge.from, age - maxAgeGap(widowed)),
      );
      const to = Math.min(AGE.elder - 1, Math.max(MARRIAGE.brideAge.to, from + 6));
      const years = from + random.next() * (to - from);
      const bride: Person = {
        id: state.nextId++,
        bornDay: day - Math.ceil(years * DAYS_PER_YEAR),
        dwellingId: p.dwellingId,
        sex: 'female',
        spouseId: p.id,
        origin: neighbor(random.next()),
      };
      startMarriage(bride, day);
      p.spouseId = bride.id;
      state.people.push(bride);
      events.push({
        day,
        kind: 'bride-from-outside',
        dwellingId: p.dwellingId,
        groomId: p.id,
        brideId: bride.id,
      });
      continue;
    }
    const favoured = favouredBride(state, p, day, parents);
    const groomChance = perDay(
      favoured ? MARRIAGE.outside.favouredGroomPerYear : MARRIAGE.outside.groomPerYear,
    );
    const awayChance = favoured ? 0 : perDay(MARRIAGE.outside.awayPerYear);
    if (roll < groomChance) {
      if (state.hungry || crowded(state, p)) continue;
      // ženich o 2 roky mladší až o 8 let starší, od 18 let
      const from = Math.max(MARRIAGE.outsideFromAge, age - MARRIAGE.groomAge.below);
      const years = from + random.next() * (age + MARRIAGE.groomAge.above - from);
      const groom: Person = {
        id: state.nextId++,
        bornDay: day - Math.ceil(years * DAYS_PER_YEAR),
        dwellingId: p.dwellingId,
        sex: 'male',
        spouseId: p.id,
        origin: neighbor(random.next()),
      };
      p.spouseId = groom.id;
      startMarriage(p, day);
      state.people.push(groom);
      events.push({
        day,
        kind: 'groom-from-outside',
        dwellingId: p.dwellingId,
        ...(widowed ? { widow: true as const } : {}),
        groomId: groom.id,
        brideId: p.id,
      });
    } else if (roll < groomChance + awayChance) {
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
export function neighbor(roll: number): NeighborDirection {
  const i = Math.min(NEIGHBOR_DIRECTIONS.length - 1, Math.floor(roll * NEIGHBOR_DIRECTIONS.length));
  return NEIGHBOR_DIRECTIONS[i] ?? 'N';
}
