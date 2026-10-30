import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  NEW_VILLAGE_MIN_DISTANCE_M,
  advanceVillage,
  checkPersonName,
  checkVillageName,
  distanceToVillages,
  foundedState,
  squareCenter,
  villagePoints,
  normalizePersonName,
  normalizeVillageName,
  type Position,
  type Settlers,
  type SquareGrid,
  type TileCell,
  type VillagePoint,
  type VillageState,
} from '../domain/village';
import type { SeedSource } from './settlements';
import type { VillageRepository, VillageResult } from './villages';

export interface FoundVillageInput {
  settlementId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  name: string;
  /** Poloha první zemnice. */
  dwelling: Position;
  /** Čtverce prvního pole – políčka krajiny; bez nich (prázdné) se ves založí bez pole. */
  fieldCells?: TileCell[];
  /**
   * Osadníci odešlí z jiné vsi (migration.md – Odchod do nové vsi) – místo čtyř zakladatelů,
   * zásob a výchozího stáda.
   */
  settlers?: Settlers;
  /**
   * Jméno vojvody (lord.md – Kde se jméno zadává: jméno vojvody při založení hry) – jen písmena
   * (`checkPersonName`). Bez něj vojvoda na jméno čeká. Jen první ves sídla
   * (`foundVillageForSettlement`); další ves a osadníci ho nepoužijí.
   */
  lordName?: string;
}

/** Zakladatelé nové vsi (`foundVillage` – `lord`); bez nich ves bez rodu. */
type Founders = { name?: string } | undefined;

const ALREADY_FOUNDED = 'Ves už je založená.';
/** Další ves na téže mapě musí stát dál od ostatních (migration.md – Odchod do nové vsi). */
export const TOO_CLOSE_TO_VILLAGE = `Nová ves musí stát nejméně ${NEW_VILLAGE_MIN_DISTANCE_M} m od jiné vsi.`;

/**
 * Založí první ves sídla: jméno, první zemnice a volitelně první pole (ověřené podle krajiny). Ves
 * zakládá vojvoda se svou rodinou (lord.md – Zakladatelé; Martin 24. 10. 2026: „Vesnici zakládá
 * vojvoda a jeho rodina.“) – s ověřeným jménem `lordName`, bez něj vojvoda na jméno čeká. Ves se
 * hned dopočítá do dneška – den založení už proběhl, jako po každé akci.
 */
export async function foundVillageForSettlement(
  deps: { villages: VillageRepository; seeds: SeedSource },
  input: FoundVillageInput,
): Promise<VillageResult> {
  let lord: { name?: string } = {};
  if (input.lordName !== undefined) {
    const check = checkPersonName(input.lordName);
    if (!check.ok) return { ok: false, reason: check.reason ?? 'Neplatné jméno vojvody.' };
    lord = { name: normalizePersonName(input.lordName) };
  }
  if ((await deps.villages.listBySettlement(input.settlementId)).length > 0) {
    return { ok: false, reason: ALREADY_FOUNDED };
  }
  const weatherSeed = await deps.villages.weatherSeedOf(input.settlementId);
  const founded = foundedVillage(deps.seeds, input, weatherSeed, lord);
  if (!founded.ok) return founded;
  const created = await deps.villages.create(input.settlementId, founded.name, founded.state);
  return created === null ? { ok: false, reason: ALREADY_FOUNDED } : { ok: true, village: created };
}

/**
 * Založí další ves na krajině sídla, které už nějakou ves má (víc vsí na téže mapě – migration.md):
 * stejně jako první ves, jen první zemnice musí stát aspoň NEW_VILLAGE_MIN_DISTANCE_M od staveb
 * ostatních vsí sídla. Sídlo bez vsi založí první ves (`foundVillageForSettlement`).
 */
export async function foundAnotherVillage(
  deps: { villages: VillageRepository; seeds: SeedSource },
  input: FoundVillageInput,
): Promise<VillageResult> {
  const others = await deps.villages.listBySettlement(input.settlementId);
  if (others.length === 0) return foundVillageForSettlement(deps, input);
  const cellCenter = (x: number, y: number, grid?: SquareGrid): VillagePoint =>
    squareCenter(input.landscape, grid, { x, y });
  const points = others.flatMap((v) => villagePoints(v.state, cellCenter));
  if (distanceToVillages(input.dwelling, points) < NEW_VILLAGE_MIN_DISTANCE_M) {
    return { ok: false, reason: TOO_CLOSE_TO_VILLAGE };
  }
  const weatherSeed = await deps.villages.weatherSeedOf(input.settlementId);
  const founded = foundedVillage(deps.seeds, input, weatherSeed);
  if (!founded.ok) return founded;
  const village = await deps.villages.add(input.settlementId, founded.name, founded.state);
  return { ok: true, village };
}

/** Stav nové vsi dopočítaný do dneška a její jméno, nebo důvod odmítnutí česky. */
function foundedVillage(
  seeds: SeedSource,
  input: FoundVillageInput,
  weatherSeed: number | null,
  lord?: Founders,
): { ok: true; state: VillageState; name: string } | { ok: false; reason: string } {
  const name = checkVillageName(input.name);
  if (!name.ok) return { ok: false, reason: name.reason ?? 'Neplatné jméno vsi.' };
  const founded = foundedVillageState(seeds.nextSeed(), input, lord, weatherSeed);
  return founded.ok ? { ...founded, name: normalizeVillageName(input.name) } : founded;
}

/**
 * Stav nové vsi se seedem `seed` dopočítaný do dneška – první zemnice (a volitelně pole) ověřené
 * podle krajiny, s osadníky, s vojvodou a jeho rodinou (`lord` – lord.md, Zakladatelé), nebo se
 * čtyřmi zakladateli vsi bez rodu; jinak důvod česky. Bez jména vsi (to drží záznam vsi). Se
 * seedem počasí mapy `weatherSeed` (disasters.md – Kraj) má počasí už den založení.
 */
export function foundedVillageState(
  seed: number,
  input: Omit<FoundVillageInput, 'settlementId' | 'name' | 'lordName'>,
  lord?: Founders,
  weatherSeed: number | null = null,
): { ok: true; state: VillageState } | { ok: false; reason: string } {
  const obstacles = obstaclesOf(input.landscape);
  const founded = foundedState(seed, { ...input, obstacles }, lord, weatherSeed);
  if (!founded.ok) return founded;
  return {
    ok: true,
    state: advanceVillage(founded.state, input.today, obstacles, input.landscape),
  };
}
