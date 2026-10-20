'use server';

import { NOT_PLAYER_VILLAGE } from '@bohemia/game';
import { restartGameForPlayer } from '@/lib/game';
import { getSession } from '@/lib/session';
import {
  buildTrailForPlayer,
  buildWagonRoadForPlayer,
  cancelRelocationForPlayer,
  sendExpeditionForPlayer,
  foundDevVillageForPlayer,
  foundVillageForPlayer,
  placeCemeteryForPlayer,
  placeDwellingForPlayer,
  placeFieldForPlayer,
  placeOrchardForPlayer,
  placePenForPlayer,
  placeSacredForPlayer,
  placeThreshingFloorForPlayer,
  placeWorkshopForPlayer,
  relocateHouseholdForPlayer,
  leaveVillageForPlayer,
  settleJourneyForPlayer,
  plantRoadApplesForPlayer,
  renameVillageForPlayer,
  skipTimeForPlayerView,
  upgradeRoadForPlayer,
  villageViewForPlayer,
  villageViewIfChanged,
  type TimeSkipResult,
  type VillageActionResult,
  type VillageUnchanged,
  type VillageView,
} from '@/lib/village';
import {
  parseBuildTrailInput,
  parseCancelRelocationInput,
  parseSendExpeditionInput,
  parseFoundVillageInput,
  parsePlaceCemeteryInput,
  parsePlaceDwellingInput,
  parsePlaceFieldInput,
  parsePlaceOrchardInput,
  parsePlacePenInput,
  parsePlaceSacredInput,
  parsePlaceThreshingFloorInput,
  parsePlaceWorkshopInput,
  parseRelocateHouseholdInput,
  parseLeaveVillageInput,
  parseSettleJourneyInput,
  parsePlantRoadApplesInput,
  parseRenameVillageInput,
  parseRestartGameInput,
  parseSkipTimeInput,
  villageIdOf,
  parseUpgradeRoadInput,
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
 * žádnou nezná, zakládá ves) – jeho první ves, nebo null, dokud žádnou nemá. Když vybraná ves
 * hráči už nepatří (restart hry v jiném panelu), vrátí jeho první ves (nebo null) – klient pak
 * načte stránku znovu. S `known` (otisk pohledu, který klient má – `VillageView.stamp`) vrátí
 * `{ unchanged: true }`, když se od něj nic nezměnilo.
 */
export async function getVillageView(
  input: unknown,
): Promise<VillageView | VillageUnchanged | null | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  if (villageId === null && !isNullVillage(input)) return { error: INVALID_INPUT };
  const known = knownStampOf(input);
  if (villageId !== null && known !== null) {
    const fresh = await villageViewIfChanged(id, villageId, known);
    if (fresh === null || !('error' in fresh) || fresh.error !== NOT_PLAYER_VILLAGE) return fresh;
    return villageViewForPlayer(id, null);
  }
  const view = await villageViewForPlayer(id, villageId);
  if (villageId !== null && view !== null && 'error' in view && view.error === NOT_PLAYER_VILLAGE) {
    return villageViewForPlayer(id, null);
  }
  return view;
}

/** Otisk pohledu z dotazu (`known` – 16 šestnáctkových číslic), jinak null. */
function knownStampOf(input: unknown): string | null {
  if (typeof input !== 'object' || input === null || !('known' in input)) return null;
  return typeof input.known === 'string' && /^[0-9a-f]{16}$/.test(input.known) ? input.known : null;
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

/**
 * Odchod do nové vsi (migration.md – fáze 3 a 4): `{ villageId, dwellingIds, destination }` –
 * na téže mapě (`{ kind: 'here', dwelling }`, vrátí novou ves) nebo na novou mapu (`{ kind: 'map',
 * direction }`, vrátí starou ves). Server místo i domácnosti ověří znovu.
 */
export async function leaveVillage(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseLeaveVillageInput, leaveVillageForPlayer);
}

/**
 * Lidé dorazili na novou mapu – první zemnice nové vsi: `{ villageId, dwelling }` (migration.md
 * – fáze 4). Server místo ověří znovu.
 */
export async function settleJourney(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseSettleJourneyInput, settleJourneyForPlayer);
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
 * Stavba humna (production-chains.md – Humno): `{ villageId, position }`. Server umístění ověří
 * znovu (`checkThreshingFloorPlacement`).
 */
export async function placeThreshingFloor(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlaceThreshingFloorInput, placeThreshingFloorForPlayer);
}

/**
 * Stavba ohrady s přístřeškem, nebo její rozšíření (oxen.md – Ohrady podle druhu): `{ villageId,
 * cells: [{ x, y }], species, grid? }` – nejvýš 4 čtverce louky, druh zvířat.
 * Server umístění ověří znovu (`penSquaresFromCells`).
 */
export async function placePen(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlacePenInput, placePenForPlayer);
}

/**
/**
 * Vylepšení pevné cesty (roads.md): `{ villageId, roadId, upgrade: 'improved' | 'causeway' }` –
 * server ho ověří znovu (`roadUpgradeOptions`).
 */
export async function upgradeRoad(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseUpgradeRoadInput, upgradeRoadForPlayer);
}

/**
 * Zemská stezka z dvorce vojvody ke kraji mapy (trade.md): `{ villageId, direction }` – server ji
 * naplánuje znovu (`planTrail` – trasa, úseky, dřevo).
 */
export async function buildTrail(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseBuildTrailInput, buildTrailForPlayer);
}

/**
 * Výprava nosičů k sousedovi (trade.md – Obchod): `{ villageId, direction, give, get }` (zboží
 * `{ druh: množství }`) – server výměnu ověří znovu (`tradeQuote`).
 */
export async function sendExpedition(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseSendExpeditionInput, sendExpeditionForPlayer);
}

/**
 * Vozová cesta (roads.md – Vozová cesta): `{ villageId, roadId }` – kterýkoli úsek cesty hráče;
 * server trasu najde znovu (`planWagonRoad` – stejně jako náhled) a zahájí stavbu.
 */
export async function buildWagonRoad(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlantRoadApplesInput, buildWagonRoadForPlayer);
}

/**
 * Výsadba jabloní podél pevné cesty (roads.md – Vysazení jabloní): `{ villageId, roadId }` –
 * server ji ověří znovu (`roadApplesOption`).
 */
export async function plantRoadApples(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlantRoadApplesInput, plantRoadApplesForPlayer);
}

/**
 * Stavba řemeslné dílny (crafts.md, tesař – wagons.md): `{ villageId, craft: 'potter' | 'smith' |
 * 'burner' | 'carpenter', position }`. Server umístění ověří znovu (`checkWorkshopPlacement`).
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
