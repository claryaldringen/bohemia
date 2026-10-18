'use server';

import { restartGameForPlayer } from '@/lib/game';
import { getSession } from '@/lib/session';
import {
  foundVillageForPlayer,
  placeCemeteryForPlayer,
  placeDwellingForPlayer,
  placeFieldForPlayer,
  placeOrchardForPlayer,
  placeSacredForPlayer,
  placeWorkshopForPlayer,
  renameVillageForPlayer,
  skipTimeForPlayerView,
  villageViewForPlayer,
  type TimeSkipResult,
  type VillageActionResult,
  type VillageView,
} from '@/lib/village';
import {
  parseFoundVillageInput,
  parsePlaceCemeteryInput,
  parsePlaceDwellingInput,
  parsePlaceFieldInput,
  parsePlaceOrchardInput,
  parsePlaceSacredInput,
  parsePlaceWorkshopInput,
  parseRenameVillageInput,
  parseRestartGameInput,
  parseSkipTimeInput,
} from '@/lib/village-input';

// Server actions vsi. Každá je veřejný POST endpoint: přihlášení ze session, vstup ověřený
// tvarem, herní pravidla ověří use-casy. Chyby vrací jako { error } česky pro hráče.

const NOT_SIGNED_IN = 'Nejsi přihlášený – přihlas se prosím znovu.';
const INVALID_INPUT = 'Neplatný požadavek.';

async function playerId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id ?? null;
}

/** Ves hráče dopočítaná do dneška; null = ves ještě není založená. */
export async function getVillageView(): Promise<VillageView | null | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return villageViewForPlayer(id);
}

/** Založení vsi: `{ name, dwelling: { x, z, rotation }, fieldCells?: { x, y }[] }`. */
export async function foundVillage(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseFoundVillageInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return foundVillageForPlayer(id, parsed);
}

/**
 * Stavba nového obydlí: `{ type: 'zemnice' | 'polozemnice', position: { x, z, rotation },
 * plot?: { cell: { x, y }, variant } }` – polozemnice na pozemku (poloha domu podle něj).
 */
export async function placeDwelling(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parsePlaceDwellingInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return placeDwellingForPlayer(id, parsed);
}

/** Založení pole po čtvercích (políčkách krajiny): `{ cells: { x, y }[] }`. */
export async function placeField(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parsePlaceFieldInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return placeFieldForPlayer(id, parsed);
}

/**
 * Založení pohřebiště po čtvercích (políčkách krajiny): `{ cells: { x, y }[] }`. Server
 * umístění ověří znovu (`cemeteryPartsFromCells`); blízkost obydlí a vody jen varuje v náhledu.
 */
export async function placeCemetery(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parsePlaceCemeteryInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return placeCemeteryForPlayer(id, parsed);
}

/**
 * Založení jabloňového sadu po čtvercích (políčkách krajiny): `{ cells }`. Server umístění
 * ověří znovu (`orchardPartsFromCells`).
 */
export async function placeOrchard(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parsePlaceOrchardInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return placeOrchardForPlayer(id, parsed);
}

/**
 * Stavba dřevěné modly nebo svatyně (happiness.md): `{ kind: 'idol' | 'shrine', position:
 * { x, z, rotation } }`. Server umístění ověří znovu (`checkSacredBuildingPlacement`).
 */
export async function placeSacred(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parsePlaceSacredInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return placeSacredForPlayer(id, parsed);
}

/**
 * Stavba řemeslné dílny (crafts.md): `{ craft: 'potter' | 'smith' | 'burner', position:
 * { x, z, rotation } }`. Server umístění ověří znovu (`checkWorkshopPlacement`).
 */
export async function placeWorkshop(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parsePlaceWorkshopInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return placeWorkshopForPlayer(id, parsed);
}

/** Přejmenování vsi: `{ name }`. */
export async function renameVillage(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseRenameVillageInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return renameVillageForPlayer(id, parsed);
}

/**
 * Začít znovu – nové sídlo s novou krajinou. Bez vstupu (obrazovka porážky) jen po konci hry
 * (vymřely všechny vsi – ověří use-case); `{ abandon: true }` (potvrzení v nabídce hry) i se
 * živou vsí, která i s rodem zanikne. Po úspěchu klient načte stránku znovu.
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
 * Vývojový režim: přeskočí čas hráče o měsíc, nebo rok – `{ skip: 'month' | 'year' }`. Jen pro
 * účet s `devMode` (příznak účtu – klient ho nastavit nemůže; bez něj use-case odmítne). Vrátí
 * ves dopočítanou do nového dneška a nový posun času pro hodiny v prohlížeči.
 */
export async function skipTime(input: unknown): Promise<TimeSkipResult> {
  const session = await getSession();
  if (!session) return { error: NOT_SIGNED_IN };
  const parsed = parseSkipTimeInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return skipTimeForPlayerView(session.user.id, session.user.devMode === true, parsed.skip);
}
