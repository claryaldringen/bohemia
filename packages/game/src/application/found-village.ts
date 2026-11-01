import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  advanceVillage,
  checkPersonName,
  checkVillageName,
  foundedState,
  normalizePersonName,
  normalizeVillageName,
  type Position,
  type Settlers,
  type TileCell,
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
   * (`checkPersonName`). Bez něj vojvoda na jméno čeká. Osadníci ho nepoužijí.
   */
  lordName?: string;
}

/** Zakladatelé nové vsi (`foundVillage` – `lord`); bez nich ves bez rodu. */
type Founders = { name?: string } | undefined;

/** Sídlo (mapa) už ves má – jedna ves, jedna mapa (migration.md – Víc vsí jednoho hráče). */
export const ALREADY_FOUNDED = 'Ves už je založená.';

/**
 * Založí ves sídla – jedinou (jedna ves, jedna mapa; sídlo s vsí → ALREADY_FOUNDED): jméno, první zemnice a volitelně první pole (ověřené podle krajiny). Ves
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
