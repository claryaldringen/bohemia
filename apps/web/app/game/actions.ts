'use server';

import { NOT_PLAYER_VILLAGE } from '@bohemia/game';
import { restartGameForPlayer } from '@/lib/game';
import { getSession } from '@/lib/session';
import { trimKnownSceneData, type KnownSceneData } from '@/lib/scene-routes';
import { packViewPieces } from '@/lib/view-pieces';
import { withVillageCache } from '@/lib/village-cache';
import {
  buildTrailForPlayer,
  buildWagonRoadForPlayer,
  cancelConstructionForPlayer,
  sendExpeditionForPlayer,
  forceDevDisasterForPlayer,
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
  declareHuntForPlayer,
  nameLineManForPlayer,
  setStewardForPlayer,
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
  parseCancelConstructionInput,
  parseDevDisasterInput,
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
  parseDeclareHuntInput,
  parseNameLineManInput,
  parseSetStewardInput,
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
  return withVillageCache(() => run(id, villageId, parsed));
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
  return withVillageCache(() => villageViewOf(input));
}

async function villageViewOf(
  input: unknown,
): Promise<VillageView | VillageUnchanged | null | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  if (villageId === null && !isNullVillage(input)) return { error: INVALID_INPUT };
  const known = knownStampOf(input);
  if (villageId !== null && known !== null) {
    const fresh = await villageViewIfChanged(id, villageId, known);
    if (fresh === null || !('error' in fresh) || fresh.error !== NOT_PLAYER_VILLAGE) {
      return trimKnown(fresh, input);
    }
    return villageViewForPlayer(id, null);
  }
  const view = await villageViewForPlayer(id, villageId);
  if (villageId !== null && view !== null && 'error' in view && view.error === NOT_PLAYER_VILLAGE) {
    return villageViewForPlayer(id, null);
  }
  return trimKnown(view, input);
}

/** Trasy a vyšlapanost, které klient už má (`routesKey`, `wearDay` v dotazu), se neposílají. */
function trimKnown<T extends VillageView | VillageUnchanged | null | { error: string }>(
  result: T,
  input: unknown,
): T {
  if (
    result === null ||
    !('scene' in result) ||
    // jen pohled té vsi, na kterou se klient ptal (fallback na první ves netrimovat)
    !('id' in result) ||
    result.id !== villageIdOf(input) ||
    typeof input !== 'object' ||
    input === null
  ) {
    return result;
  }
  const known: KnownSceneData = {
    ...('routesKey' in input && typeof input.routesKey === 'string'
      ? { routesKey: input.routesKey }
      : {}),
    ...('wearDay' in input && typeof input.wearDay === 'number' ? { wearDay: input.wearDay } : {}),
    ...('wearCellM' in input && typeof input.wearCellM === 'number'
      ? { wearCellM: input.wearCellM }
      : {}),
  };
  return packViewPieces(
    { ...result, scene: trimKnownSceneData(result.scene, known) },
    knownPiecesOf(input),
  ) as T;
}

/** Nejvýš tolik částí a otisků v dotazu (`pieces`) – víc pohled nemá. */
const MAX_PIECE_PARTS = 256;
const MAX_PIECE_KEYS = 20_000;

/** Otisky kusů pohledu, které klient má (`pieces` v dotazu – view-pieces.ts), jinak null. */
function knownPiecesOf(input: object): Record<string, string[]> | null {
  if (!('pieces' in input) || typeof input.pieces !== 'object' || input.pieces === null) {
    return null;
  }
  const entries = Object.entries(input.pieces as Record<string, unknown>);
  if (entries.length > MAX_PIECE_PARTS) return null;
  const out: Record<string, string[]> = {};
  let count = 0;
  for (const [name, keys] of entries) {
    if (!/^[a-z]{1,2}\d{0,4}$/.test(name) || !Array.isArray(keys)) return null;
    count += keys.length;
    if (count > MAX_PIECE_KEYS) return null;
    if (!keys.every((k) => typeof k === 'string' && k.length <= 32)) return null;
    out[name] = keys as string[];
  }
  return out;
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
  const view = await withVillageCache(() => villageViewForPlayer(id, villageId));
  return view ?? { error: INVALID_INPUT };
}

/** Založení první vsi: `{ name, dwelling: { x, z, rotation }, fieldCells?: { x, y }[] }`. */
export async function foundVillage(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseFoundVillageInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return withVillageCache(() => foundVillageForPlayer(id, parsed));
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
  return withVillageCache(() =>
    foundDevVillageForPlayer(session.user.id, session.user.devMode === true, villageId),
  );
}

/**
 * Vývojový režim (disasters.md – plán P10): vynutí letošní zlý rok `{ villageId, kind: 'year',
 * value }`, nebo zítřejší pohromu `{ villageId, kind: 'disaster', value }` a vrátí pohled na ves.
 * Jen pro účet s `devMode` (příznak účtu – klient ho nastavit nemůže; bez něj use-case odmítne).
 */
export async function forceDevDisaster(input: unknown): Promise<VillageActionResult> {
  const session = await getSession();
  if (!session) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  const choice = parseDevDisasterInput(input);
  if (villageId === null || choice === null) return { error: INVALID_INPUT };
  return withVillageCache(() =>
    forceDevDisasterForPlayer(session.user.id, session.user.devMode === true, villageId, choice),
  );
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

/** Zrušení rozestavěné stavby: `{ villageId, constructionId }` – nespotřebované dřevo zpět na hromadu. */
export async function cancelConstruction(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseCancelConstructionInput, cancelConstructionForPlayer);
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
 * Úprava pevné cesty s hatí a lávkou (roads.md): `{ villageId, roadId, upgrade: 'improved' }` –
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

/**
 * Jméno vojvody nebo jeho syna (lord.md – Jména): `{ villageId, personId, name }`. Jestli jméno
 * smí být, ověří use-case.
 */
export async function nameLineMan(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseNameLineManInput, nameLineManForPlayer);
}

/** Zapnutí / vypnutí správce vsi (steward.md): `{ villageId, on }`. */
export async function setSteward(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseSetStewardInput, setStewardForPlayer);
}

/**
 * Lov navíc na zítřek (wildlife.md – Lov rodu: Kdy): `{ villageId }`. Hájení, 3 dny od minulého
 * lovu, nikdo k lovu a už vyhlášený lov odmítne use-case s důvodem česky.
 */
export async function declareHunt(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseDeclareHuntInput, (id, villageId) =>
    declareHuntForPlayer(id, villageId),
  );
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
  return withVillageCache(() =>
    skipTimeForPlayerView(
      session.user.id,
      session.user.devMode === true,
      parsed.skip,
      villageIdOf(input),
    ),
  );
}
