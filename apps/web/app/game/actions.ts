'use server';

import { getSession } from '@/lib/session';
import {
  foundVillageForPlayer,
  placeCemeteryForPlayer,
  placeDwellingForPlayer,
  placeFieldForPlayer,
  placeOrchardForPlayer,
  renameVillageForPlayer,
  villageViewForPlayer,
  type VillageActionResult,
  type VillageView,
} from '@/lib/village';
import {
  parseFoundVillageInput,
  parsePlaceCemeteryInput,
  parsePlaceDwellingInput,
  parsePlaceFieldInput,
  parsePlaceOrchardInput,
  parseRenameVillageInput,
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

/** Stavba nového obydlí: `{ type: 'zemnice' | 'polozemnice', position: { x, z, rotation } }`. */
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

/** Přejmenování vsi: `{ name }`. */
export async function renameVillage(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseRenameVillageInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return renameVillageForPlayer(id, parsed);
}
