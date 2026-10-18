'use server';

import { restartGameForPlayer } from '@/lib/game';
import { getSession } from '@/lib/session';
import {
  cancelRelocationForPlayer,
  foundDevVillageForPlayer,
  foundVillageForPlayer,
  placeCemeteryForPlayer,
  placeDwellingForPlayer,
  placeFieldForPlayer,
  placeOrchardForPlayer,
  placePenForPlayer,
  placeSacredForPlayer,
  placeWorkshopForPlayer,
  relocateHouseholdForPlayer,
  renameVillageForPlayer,
  skipTimeForPlayerView,
  trainTeamForPlayer,
  villageViewForPlayer,
  type TimeSkipResult,
  type VillageActionResult,
  type VillageView,
} from '@/lib/village';
import {
  parseCancelRelocationInput,
  parseFoundVillageInput,
  parsePlaceCemeteryInput,
  parsePlaceDwellingInput,
  parsePlaceFieldInput,
  parsePlaceOrchardInput,
  parsePlacePenInput,
  parsePlaceSacredInput,
  parsePlaceWorkshopInput,
  parseRelocateHouseholdInput,
  parseRenameVillageInput,
  parseRestartGameInput,
  parseSkipTimeInput,
  parseTrainTeamInput,
  villageIdOf,
} from '@/lib/village-input';

// Server actions vsi. Každá je veřejný POST endpoint: přihlášení ze session, vstup ověřený
// tvarem, herní pravidla ověří use-casy. Akce nad vsí nesou id vsi (`villageId` – hráč může mít
// víc vsí, migration.md) a server ověří, že ves patří hráči. Chyby vrací jako { error } česky.

const NOT_SIGNED_IN = 'Nejsi přihlášený – přihlas se prosím znovu.';
const INVALID_INPUT = 'Neplatný požadavek.';

async function playerId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id ?? null;
}

/**
 * Akce nad vsí: přihlášený hráč, id vsi a vstup ověřený tvarem `parse` – pak `run`. Bez
 * přihlášení, id vsi nebo s jiným tvarem vstupu chyba.
 */
async function villageAction<T>(
  input: unknown,
  parse: (input: unknown) => T | null,
  run: (playerId: string, villageId: string, parsed: T) => Promise<VillageActionResult>,
): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  const parsed = parse(input);
  if (villageId === null || parsed === null) return { error: INVALID_INPUT };
  return run(id, villageId, parsed);
}

/**
 * Ves hráče dopočítaná do dneška: `{ villageId }` – vybraná ves; `{ villageId: null }` (ještě
 * žádnou nezná, zakládá ves) – jeho první ves, nebo null, dokud žádnou nemá.
 */
export async function getVillageView(
  input: unknown,
): Promise<VillageView | null | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  if (villageId === null && !isNullVillage(input)) return { error: INVALID_INPUT };
  return villageViewForPlayer(id, villageId);
}

function isNullVillage(input: unknown): boolean {
  return (
    typeof input === 'object' && input !== null && 'villageId' in input && input.villageId === null
  );
}

/**
 * Pohled na jinou ves hráče na téže mapě `{ villageId }` (přepínač v horní liště) – ověří, že ves
 * patří hráči. Výběr si zapamatuje prohlížeč (cookie – `lib/village-choice.ts`); ves na jiné mapě
 * si klient otevře novým načtením stránky (jiná krajina).
 */
export async function selectVillage(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  if (villageId === null) return { error: INVALID_INPUT };
  const view = await villageViewForPlayer(id, villageId);
  return view ?? { error: INVALID_INPUT };
}

/** Založení první vsi: `{ name, dwelling: { x, z, rotation }, fieldCells?: { x, y }[] }`. */
export async function foundVillage(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseFoundVillageInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return foundVillageForPlayer(id, parsed);
}

/**
 * Vývojový režim: založí druhou ves na mapě vsi `{ villageId }` (jen pro vyzkoušení přepínače vsí
 * – bez lidí ze staré vsi) a vrátí pohled na ni. Jen pro účet s `devMode`.
 */
export async function foundDevVillage(input: unknown): Promise<VillageActionResult> {
  const session = await getSession();
  if (!session) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  if (villageId === null) return { error: INVALID_INPUT };
  return foundDevVillageForPlayer(session.user.id, session.user.devMode === true, villageId);
}

/**
 * Stavba nového obydlí: `{ villageId, type: 'zemnice' | 'polozemnice', position: { x, z, rotation },
 * plot?: { cell: { x, y }, variant } }` – polozemnice na pozemku (poloha domu podle něj).
 */
export async function placeDwelling(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlaceDwellingInput, placeDwellingForPlayer);
}

/**
 * Přestěhování domácnosti (migration.md): `{ villageId, dwellingId, type, position, plot? }` –
 * nový dům jako stavba obydlí, bez lidí k osídlení. Server umístění ověří znovu.
 */
export async function relocateHousehold(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseRelocateHouseholdInput, relocateHouseholdForPlayer);
}

/** Zrušení rozestavěného přestěhování: `{ villageId, constructionId }` – dřevo zpět na hromadu. */
export async function cancelRelocation(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseCancelRelocationInput, cancelRelocationForPlayer);
}

/** Založení pole po čtvercích (políčkách krajiny): `{ villageId, cells: { x, y }[] }`. */
export async function placeField(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlaceFieldInput, placeFieldForPlayer);
}

/**
 * Založení pohřebiště po čtvercích (políčkách krajiny): `{ villageId, cells }`. Server umístění
 * ověří znovu (`cemeteryPartsFromCells`); blízkost obydlí a vody jen varuje v náhledu.
 */
export async function placeCemetery(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlaceCemeteryInput, placeCemeteryForPlayer);
}

/**
 * Založení jabloňového sadu po čtvercích (políčkách krajiny): `{ villageId, cells }`. Server
 * umístění ověří znovu (`orchardPartsFromCells`).
 */
export async function placeOrchard(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlaceOrchardInput, placeOrchardForPlayer);
}

/**
 * Stavba dřevěné modly nebo svatyně (happiness.md): `{ villageId, kind: 'idol' | 'shrine',
 * position }`. Server umístění ověří znovu (`checkSacredBuildingPlacement`).
 */
export async function placeSacred(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlaceSacredInput, placeSacredForPlayer);
}

/**
 * Stavba ohrady s přístřeškem (oxen.md): `{ villageId, cells: [{ x, y }] }` – jeden čtverec louky.
 * Server umístění ověří znovu (`checkPenPlacement`).
 */
export async function placePen(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlacePenInput, placePenForPlayer);
}

/** Výcvik spřežení v ohradě (oxen.md – „Vycvičit spřežení“): `{ villageId, penId }`. */
export async function trainTeam(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseTrainTeamInput, trainTeamForPlayer);
}

/**
 * Stavba řemeslné dílny (crafts.md): `{ villageId, craft: 'potter' | 'smith' | 'burner',
 * position }`. Server umístění ověří znovu (`checkWorkshopPlacement`).
 */
export async function placeWorkshop(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlaceWorkshopInput, placeWorkshopForPlayer);
}

/** Přejmenování vsi: `{ villageId, name }`. */
export async function renameVillage(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseRenameVillageInput, renameVillageForPlayer);
}

/**
 * Začít znovu – nové sídlo s novou krajinou. Bez vstupu (obrazovka porážky) jen po konci hry
 * (vymřely všechny vsi – ověří use-case); `{ abandon: true }` (potvrzení v nabídce hry) i se
 * živými vsemi, které i s rodem zaniknou. Po úspěchu klient načte stránku znovu.
 */
export async function restartGame(input?: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseRestartGameInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  const result = await restartGameForPlayer(id, parsed);
  return result.ok ? { ok: true } : { error: result.error };
}

/**
 * Vývojový režim: přeskočí čas hráče o měsíc, rok, nebo 10 let – `{ skip: 'month' | 'year' |
 * 'decade', villageId }` (`villageId` null, dokud ves není). Jen pro účet s `devMode` (příznak
 * účtu – klient ho nastavit nemůže; bez něj use-case odmítne). Vrátí ves dopočítanou do nového
 * dneška a nový posun času pro hodiny v prohlížeči.
 */
export async function skipTime(input: unknown): Promise<TimeSkipResult> {
  const session = await getSession();
  if (!session) return { error: NOT_SIGNED_IN };
  const parsed = parseSkipTimeInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return skipTimeForPlayerView(
    session.user.id,
    session.user.devMode === true,
    parsed.skip,
    villageIdOf(input),
  );
}
