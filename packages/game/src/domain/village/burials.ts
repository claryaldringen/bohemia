import { villageManorId } from './manor';
import { cemeteryEntrance, type Entrance } from './paths/entrances';
import { ageGroup, ageYears } from './people';
import { GRAVE_PLACES, GRAVE_RANK_MOUNDS, GRAVE_RANKS, MOUND_SIZES } from './rules';
import { rotationCosSin } from './square-grid';
import type {
  Cemetery,
  CemeterySquare,
  GraveMound,
  GraveRank,
  MoundSize,
  Person,
  Position,
  VillageState,
} from './types';

// Mohyly podle významu (docs/design/cemetery.md; Martin 19. 10. 2026: „Významnější lidé budou mít
// větší mohyly a na prominentnějších místech. Čili zasloužilá hlava rodiny bude mít větší mohylu,
// než např. dítě zemřelé v dětském věku. Největší mohyly bude mít vojvodova rodina.“). Hřbitov má
// ve čtverci místa na hroby po řadách (GRAVE_PLACES – 7 × 8); mohyla zabere podle velikosti víc
// míst (MOUND_SIZES), takže hřbitov se zaplní dřív, když umírají významní. Významní leží blízko
// branky (`cemeteryEntrance`) a na hlavní ose od ní, děti vzadu a na okrajích. I vojvodova rodina
// je odstupňovaná (Martin 19. 10. 2026: „I ve vojvodově rodině jsou významnější a méně významní
// členové.“) – vojvoda a jeho žena, ostatní dospělí z dvorce, děti z dvorce. Staré hroby (uložené
// před mohylami) leží po jednom místě na prvních místech po řadách – jako dřív; mohyly uložené
// podle dřívějšího pravidla se nemění. Deterministicky ze stavu a dne.

/** Velikost mohyly druhu pohřbeného (když se vejde – GRAVE_RANK_MOUNDS). */
export function moundSizeOf(rank: GraveRank): MoundSize {
  return GRAVE_RANK_MOUNDS[rank][0]!;
}

/** Druhy pohřbených z vojvodovy rodiny (i podle prvního pravidla). */
const MANOR_RANKS: ReadonlySet<GraveRank> = new Set(['voivode', 'manor-adult', 'manor']);

/** Kolik míst na hroby mohyla zabere. */
export function moundPlaces(size: MoundSize): number {
  const s = MOUND_SIZES[size];
  return s.columns * s.rows;
}

/** Staré hroby – pohřbení před mohylami (po jednom místě na prvních místech po řadách). */
export function oldGraves(cemetery: Pick<Cemetery, 'graves' | 'mounds'>): number {
  return Math.max(0, cemetery.graves - (cemetery.mounds?.length ?? 0));
}

/** Obsazená místa hřbitova: staré hroby po jednom místě a místa mohyl. */
export function usedPlaces(cemetery: Pick<Cemetery, 'graves' | 'mounds'>): number {
  let used = oldGraves(cemetery);
  for (const m of cemetery.mounds ?? []) used += moundPlaces(m.size);
  return used;
}

/** Je člověk dítě, které ještě nedorostlo (cemetery.md – dítě zemřelé v dětském věku)? */
function isChild(person: Person, day: number): boolean {
  return ageGroup(person, day) === 'child';
}

/**
 * Hlava domácnosti: nejstarší muž od dětského věku výš a jeho manželka; v domácnosti bez muže
 * nejstarší žena (při shodě nižší id).
 */
function isHouseholdHead(people: readonly Person[], person: Person, day: number): boolean {
  const grown = people.filter((p) => p.dwellingId === person.dwellingId && !isChild(p, day));
  const oldest = (list: readonly Person[]): Person | undefined =>
    [...list].sort((a, b) => a.bornDay - b.bornDay || a.id - b.id)[0];
  const man = oldest(grown.filter((p) => p.sex === 'male'));
  if (man) return person.id === man.id || person.spouseId === man.id;
  return oldest(grown)?.id === person.id;
}

/** Má člověk dítě – žijící ve vsi, nebo odešlé (vdané pryč, dané sousedovi)? */
function hasChildren(state: Pick<VillageState, 'people' | 'emigrants'>, id: number): boolean {
  const of = (p: { motherId?: number; fatherId?: number }): boolean =>
    p.motherId === id || p.fatherId === id;
  return state.people.some(of) || (state.emigrants ?? []).some(of);
}

/**
 * Druh pohřbeného (cemetery.md – Mohyly podle významu): domácnost dvorce je vojvodova rodina –
 * vojvoda (hlava domácnosti dvorce – nejstarší muž i ovdovělý, bez muže nejstarší žena) a jeho
 * žena, ostatní dospělí z dvorce, děti z dvorce; jinak dítě (dětský věk), zasloužilá hlava rodiny
 * (hlava domácnosti od 35 let s dítětem), nebo ostatní dospělý. Volá se za života – ve stavu ještě
 * je.
 */
export function graveRank(
  state: Pick<VillageState, 'people' | 'emigrants' | 'manorId' | 'dwellings' | 'constructions'>,
  person: Person,
  day: number,
): GraveRank {
  if (person.dwellingId === villageManorId(state)) {
    if (isChild(person, day)) return 'manor-child';
    return isHouseholdHead(state.people, person, day) ? 'voivode' : 'manor-adult';
  }
  if (isChild(person, day)) return 'child';
  if (
    ageYears(person.bornDay, day) >= GRAVE_RANKS.headMinAgeYears &&
    isHouseholdHead(state.people, person, day) &&
    hasChildren(state, person.id)
  ) {
    return 'head';
  }
  return 'adult';
}

/**
 * Střed místa na hroby (nebo bloku `columns` × `rows` míst od něj) ve světě: čtverec se středem
 * (x, z) a stranou `sizeM`, místa po řadách v osách čtverce s okrajem GRAVE_PLACES.marginM;
 * natočený čtverec (fields.md – Natočené stavby) otočený jako mřížka (místní x, z → svět
 * x·c + z·s, −x·s + z·c). Scéna podle toho kreslí mohyly (cemetery-layout.ts).
 */
export function gravePlaceCenter(
  square: { readonly x: number; readonly z: number },
  sizeM: number,
  rotation: number | undefined,
  column: number,
  row: number,
  columns = 1,
  rows = 1,
): { x: number; z: number } {
  const inner = sizeM - 2 * GRAVE_PLACES.marginM;
  const stepX = inner / GRAVE_PLACES.columns;
  const stepZ = inner / GRAVE_PLACES.rows;
  const lx = -inner / 2 + (column + columns / 2) * stepX;
  const lz = -inner / 2 + (row + rows / 2) * stepZ;
  if (rotation === undefined) return { x: square.x + lx, z: square.z + lz };
  const [c, s] = rotationCosSin(rotation);
  return { x: square.x + lx * c + lz * s, z: square.z - lx * s + lz * c };
}

/** Obsazenost míst hotových čtverců – po čtvercích pole sloupec + řada × sloupců. */
function occupancy(cemetery: Cemetery, ready: readonly CemeterySquare[]): boolean[][] {
  const perSquare = GRAVE_PLACES.columns * GRAVE_PLACES.rows;
  const taken = ready.map(() => new Array<boolean>(perSquare).fill(false));
  // staré hroby po řadách od prvního čtverce (jako je kreslila scéna před mohylami)
  const old = Math.min(oldGraves(cemetery), ready.length * perSquare);
  for (let i = 0; i < old; i++) taken[Math.floor(i / perSquare)]![i % perSquare] = true;
  for (const m of cemetery.mounds ?? []) {
    const k = ready.findIndex((q) => q.cell.x === m.cell.x && q.cell.y === m.cell.y);
    if (k < 0) continue;
    const { columns, rows } = MOUND_SIZES[m.size];
    for (let r = m.row; r < m.row + rows; r++) {
      for (let c = m.column; c < m.column + columns; c++) {
        taken[k]![r * GRAVE_PLACES.columns + c] = true;
      }
    }
  }
  return taken;
}

/** Volné místo pro mohylu – čtverec (index hotových), sloupec, řada a prominence. */
interface Spot {
  square: number;
  column: number;
  row: number;
  /** Hloubka od branky + váha × vzdálenost od osy (m) – menší je prominentnější. */
  score: number;
  /** Vzdálenost středu od hlavní osy od branky (m). */
  lateral: number;
  /** Hloubka nejbližšího místa bloku od branky dovnitř hřbitova (m). */
  near: number;
}

/**
 * Branka hřbitova a směr dovnitř: vchod z jádra (`cemeteryEntrance` – k nejbližšímu obydlí); bez
 * obydlí střed hotových čtverců a dovnitř +z.
 */
function entranceOf(
  cemetery: Cemetery,
  ready: readonly CemeterySquare[],
  dwellings: readonly Position[],
): Entrance {
  const rotation = cemetery.grid?.rotation;
  const gate = cemeteryEntrance(
    {
      squares: cemetery.squares.map((q) => ({
        cell: q.cell,
        x: q.x,
        z: q.z,
        size: cemetery.squareSizeM,
        ...(rotation !== undefined ? { rotation } : {}),
        ...(q.constructionId !== undefined ? { pending: true } : {}),
      })),
      built: cemetery.builtDay !== null,
    },
    dwellings.map((position) => ({ position, built: true })),
  );
  if (gate) return gate;
  const x = ready.reduce((sum, q) => sum + q.x, 0) / Math.max(1, ready.length);
  const z = ready.reduce((sum, q) => sum + q.z, 0) / Math.max(1, ready.length);
  return { x, z, outX: 0, outZ: -1 };
}

/** Volná místa pro mohylu velikosti `size` (celý blok volný, v jednom čtverci). */
function freeSpots(
  cemetery: Cemetery,
  ready: readonly CemeterySquare[],
  taken: readonly boolean[][],
  gate: Entrance,
  size: MoundSize,
): Spot[] {
  const { columns, rows } = MOUND_SIZES[size];
  const rotation = cemetery.grid?.rotation;
  const spots: Spot[] = [];
  ready.forEach((square, k) => {
    for (let row = 0; row + rows <= GRAVE_PLACES.rows; row++) {
      for (let column = 0; column + columns <= GRAVE_PLACES.columns; column++) {
        let free = true;
        for (let r = row; r < row + rows && free; r++) {
          for (let c = column; c < column + columns && free; c++) {
            if (taken[k]![r * GRAVE_PLACES.columns + c]) free = false;
          }
        }
        if (!free) continue;
        const p = gravePlaceCenter(
          square,
          cemetery.squareSizeM,
          rotation,
          column,
          row,
          columns,
          rows,
        );
        // dovnitř = proti směru ven z branky
        const depthOf = (q: { x: number; z: number }): number =>
          -((q.x - gate.x) * gate.outX + (q.z - gate.z) * gate.outZ);
        const depth = depthOf(p);
        const lateral = Math.abs((p.x - gate.x) * gate.outZ - (p.z - gate.z) * gate.outX);
        // nejbližší místo bloku k brance – začátek osy zabírá i blok, který do něj jen zasahuje
        let near = depth;
        for (let r = row; r < row + rows; r++) {
          for (let c = column; c < column + columns; c++) {
            const q = gravePlaceCenter(square, cemetery.squareSizeM, rotation, c, r);
            near = Math.min(near, depthOf(q));
          }
        }
        spots.push({
          square: k,
          column,
          row,
          score: depth + GRAVE_RANKS.lateralWeight * lateral,
          lateral,
          near,
        });
      }
    }
  });
  return spots;
}

/** Pořadí míst: podle prominence, při shodě čtverec, řada, sloupec (deterministicky). */
function byScore(a: Spot, b: Spot): number {
  return a.score - b.score || a.square - b.square || a.row - b.row || a.column - b.column;
}

/** Zasahuje místo do začátku osy u branky, který patří vojvodově rodině? */
function inManorFront(spot: Spot): boolean {
  return spot.lateral < GRAVE_RANKS.laneHalfWidthM && spot.near < GRAVE_RANKS.manorFrontM;
}

/**
 * Místo pro mohylu pohřbeného druhu `rank` (cemetery.md – Mohyly podle významu; nemění stav):
 * vojvoda a jeho žena nejprominentněji (blízko branky a na hlavní ose), ostatní dospělí z dvorce
 * hned za nimi; hlava rodiny co nejprominentněji, ale mimo začátek osy u branky (ten drží
 * vojvodově rodině, dokud má kam jinam); ostatní dospělí a děti z dvorce co nejblíž branky mimo
 * pruh podél osy (ten nechávají velkým mohylám, dokud mají kde jinde); děti co nejdál – vzadu
 * a na okrajích. Velká mohyla, která se nevejde, se zmenší (2 × 2 → 2 místa → 1 místo –
 * prominentní místo zůstává). Bez volného místa null.
 */
export function placeMound(
  cemetery: Cemetery,
  rank: GraveRank,
  day: number,
  dwellings: readonly Position[],
): GraveMound | null {
  const ready = cemetery.squares.filter((q) => q.constructionId === undefined);
  if (ready.length === 0) return null;
  const taken = occupancy(cemetery, ready);
  const gate = entranceOf(cemetery, ready, dwellings);
  for (const size of GRAVE_RANK_MOUNDS[rank]) {
    const spots = freeSpots(cemetery, ready, taken, gate, size).sort(byScore);
    let spot: Spot | undefined;
    if (rank === 'child') spot = spots[spots.length - 1];
    else if (rank === 'adult' || rank === 'manor-child') {
      spot = spots.find((s) => s.lateral >= GRAVE_RANKS.laneHalfWidthM) ?? spots[0];
    } else if (MANOR_RANKS.has(rank)) spot = spots[0];
    else spot = spots.find((s) => !inManorFront(s)) ?? spots[0];
    if (!spot) continue;
    const square = ready[spot.square]!;
    return {
      cell: { x: square.cell.x, y: square.cell.y },
      column: spot.column,
      row: spot.row,
      size,
      rank,
      day,
    };
  }
  return null;
}
