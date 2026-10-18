import type { ObstacleLayer } from '../landscape';
import { affordability, BUILD_COSTS, villageStock, type Affordability } from './costs';
import { occupants } from './people';
import type { Construction, DwellingType, VillageState } from './types';
import { addLogs } from './wood';

// Přestěhování domácnosti (migration.md – Přestěhování domácnosti): domácnost si postaví nový dům
// jinde ve vsi a po dostavění se do něj přestěhuje, starý dům zůstane prázdný (dál ho řeší běžná
// pravidla – osídlení, chátrání, rozpad). Stavba je běžná stavba obydlí (`kind: 'dwelling'`)
// s `relocates` = id domácnosti – ze společné práce vsi, bez lidí k osídlení.

/** Domácnosti, které si právě staví nový dům (id jejich obydlí). */
export function relocatingHouseholds(state: Pick<VillageState, 'constructions'>): Set<number> {
  const households = new Set<number>();
  for (const c of state.constructions) if (c.relocates !== undefined) households.add(c.relocates);
  return households;
}

/** Rozestavěné přestěhování domácnosti `householdId`, nebo undefined. */
export function relocationOf(
  state: Pick<VillageState, 'constructions'>,
  householdId: number,
): Construction | undefined {
  return state.constructions.find((c) => c.relocates === householdId);
}

/**
 * Proč se domácnost obydlí `householdId` teď přestěhovat nemůže: obydlí neexistuje nebo v něm
 * nikdo nebydlí (`no-household`), domácnost si nový dům už staví (`relocating`), nebo svůj dům
 * právě přestavuje (`rebuilding` – přestavba jde ze stejné práce vsi). Null = přestěhovat se může.
 */
export type RelocationBlock = 'no-household' | 'relocating' | 'rebuilding';

export function relocationBlock(state: VillageState, householdId: number): RelocationBlock | null {
  if (!state.dwellings.some((d) => d.id === householdId)) return 'no-household';
  if (occupants(state, householdId).length === 0) return 'no-household';
  if (relocationOf(state, householdId)) return 'relocating';
  if (state.constructions.some((c) => c.kind === 'rebuild' && c.dwellingId === householdId)) {
    return 'rebuilding';
  }
  return null;
}

/**
 * Má ves na nový dům domácnosti suroviny předem? Jako cena obydlí (`BUILD_COSTS`), ale bez lidí
 * k osídlení – domácnost už existuje, jen si staví nový dům (migration.md, návrh Clauda).
 */
export function relocationAffordability(
  state: VillageState,
  type: DwellingType,
  obstacles?: ObstacleLayer | null,
): Affordability {
  const { settlers, ...upfront } = BUILD_COSTS[type].upfront;
  void settlers; // lidé k osídlení se u přestěhování neplatí
  return affordability(villageStock(state, obstacles), upfront);
}

/**
 * Dostavěné přestěhování (krok simulace – dokončené stavby): obyvatelé domácnosti `c.relocates`
 * se přestěhují do nového obydlí `dwellingId` (mutuje stav). Když domácnost mezitím zanikla
 * (vymřela, sloučila se se sousedy), nikdo se nestěhuje – nové obydlí je prázdné a osídlí ho
 * ještě týž den mladý pár nebo dospělé děti jako každé prázdné obydlí.
 */
export function moveRelocatedHousehold(
  state: VillageState,
  day: number,
  c: Construction,
  dwellingId: number,
): void {
  const from = c.relocates;
  if (from === undefined) return;
  const movers = occupants(state, from);
  if (movers.length === 0) return;
  for (const p of movers) p.dwellingId = dwellingId;
  state.chronicle.push({
    day,
    kind: 'household-relocated',
    fromDwellingId: from,
    toDwellingId: dwellingId,
  });
}

/**
 * Dřevo zrušené stavby se vrátí na hromadu (mutuje stav): klády, které vzala z hromady, a stromy,
 * které pro ni už skáceli. Neskácené vyhrazené stromy se zrušením stavby uvolní samy.
 */
export function returnConstructionWood(state: VillageState, c: Construction): void {
  if (c.wood) addLogs(state, c.wood.fromPile + c.wood.felled);
}
