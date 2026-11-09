'use server';

import { NOT_PLAYER_VILLAGE } from '@bohemia/game';
import {
  chooseLanguageForPlayer,
  gameDeps,
  notePlayerActive,
  restartGameForPlayer,
} from '@/lib/game';
import {
  NOTICE_BATCH,
  wantsPlayerNotices,
  type VillageNone,
  type WithPlayerNotices,
} from '@/lib/player-notices';
import { getSession } from '@/lib/session';
import { trimKnownSceneData, type KnownSceneData } from '@/lib/scene-routes';
import { packViewPieces } from '@/lib/view-pieces';
import { withVillageCache } from '@bohemia/server';
import {
  answerNegotiationForPlayer,
  blockHouseForPlayer,
  unblockHouseForPlayer,
  housePanelForPlayer,
  houseSpareForPlayer,
  renounceVassalageForPlayer,
  dismissStewardForPlayer,
  issueInviteForPlayer,
  openNegotiationForPlayer,
  declareWarForPlayer,
  newcomerStatusForPlayer,
  requestLordsForPlayer,
  startFreeForPlayer,
  fileComplaintForPlayer,
  answerComplaintForPlayer,
  judgeDisputeForPlayer,
  revokeInviteForPlayer,
  type NegotiationActionResult,
} from '@/lib/house';
import { answerLevyForPlayer, levyDialogsForPlayer } from '@/lib/levies';
import type { NewcomerStatusView } from '@/lib/newcomer-view';
import {
  announcePassageForPlayer,
  answerPassageForPlayer,
  answerSummonsForPlayer,
  passagesForPlayer,
  summonsDialogsForPlayer,
  summonVassalsForPlayer,
  type PassageView,
  type SummonsDialogView,
} from '@/lib/summons';
import {
  announceWarPassageForPlayer,
  protectionViewForPlayer,
  recallProtectionForPlayer,
  requestProtectionForPlayer,
  sendProtectionForPlayer,
  type ProtectionView,
} from '@/lib/protection';
import { decidePrisonerForPlayer } from '@/lib/prisoners';
import { orderBreakoutForPlayer } from '@/lib/war-scene';
import { alarmViewForPlayer, commandAlarmForPlayer, returnFromRefugeForPlayer } from '@/lib/alarm';
import { parseAlarmCommand, parseAlarmVillage } from '@/lib/alarm-input';
import type { AlarmView } from '@/lib/alarm-view';
import {
  consentEscheatForPlayer,
  escheatDialogsForPlayer,
  proposeEscheatForPlayer,
} from '@/lib/escheats';
import { parseConsentEscheatInput, parseProposeEscheatInput } from '@/lib/escheat-input';
import type { HouseView } from '@/lib/house-view';
import type { CampaignCommand, EscheatView, LevyDialogView, MacroSpare } from '@bohemia/game';
import {
  parseAnswerLevyInput,
  parseBlockInput,
  parsePrisonerInput,
  parseComplaintInput,
  parseStatementInput,
  parseJudgeInput,
  parseDeclareWarInput,
  parseNegotiationAnswerInput,
  parseOpenNegotiationInput,
  parseRenounceInput,
  parseDismissStewardInput,
  parseRevokeInviteInput,
  parseSpareInput,
} from '@/lib/house-input';
import { parsePanelAsk, type PanelOptions } from '@/lib/panel-options';
import { parseChronicleAsk, type ChroniclePage } from '@/lib/chronicle-view';
import { NOTICE_PAGE_SIZE, noticePage, parseNoticeAsk, type NoticePage } from '@/lib/notice-page';
import {
  buildTrailForPlayer,
  buildWagonRoadForPlayer,
  abandonFieldPartsForPlayer,
  abandonStructureForPlayer,
  demolishStructureForPlayer,
  restoreStructureForPlayer,
  cancelConstructionForPlayer,
  sendExpeditionForPlayer,
  forceDevDisasterForPlayer,
  foundVillageForPlayer,
  placeCemeteryForPlayer,
  placeDwellingForPlayer,
  placeFieldForPlayer,
  placeOrchardForPlayer,
  placePenForPlayer,
  placeFortificationForPlayer,
  upgradeFortificationForPlayer,
  addFortificationGateForPlayer,
  demolishFortificationSectionForPlayer,
  rerouteFortificationSectionForPlayer,
  addFortificationRampartForPlayer,
  fillFortificationMoatForPlayer,
  upgradeFortificationGateForPlayer,
  placeSacredForPlayer,
  placeThreshingFloorForPlayer,
  placeQuarryForPlayer,
  orderStoneQuarryingForPlayer,
  placeWorkshopForPlayer,
  leaveVillageForPlayer,
  choosePlayerDepartureForPlayer,
  settleJourneyForPlayer,
  plantRoadApplesForPlayer,
  declareHuntForPlayer,
  setDefenseStanceForPlayer,
  nameLineManForPlayer,
  ennobleVillagerForPlayer,
  setStewardForPlayer,
  renameVillageForPlayer,
  skipTimeForPlayerView,
  upgradeRoadForPlayer,
  panelOptionsForPlayer,
  chronicleForPlayer,
  villageViewForPlayer,
  villageViewIfChanged,
  type TimeSkipResult,
  type VillageActionResult,
  type VillageUnchanged,
  type VillageView,
} from '@/lib/village';
import { armyPanelForPlayer, launchCampaignForPlayer, planCampaignForPlayer } from '@/lib/army';
import type { ArmyPanelData, CampaignEstimate } from '@/lib/army-view';
import { parseArmyPanelInput, parseCampaignPlanInput } from '@/lib/army-input';
import { campaignsOfPlayer, commandCampaignForPlayer } from '@/lib/campaign';
import type { CampaignSummary } from '@/lib/campaign-view';
import {
  parseGroupOrderInput,
  parseLeaderInput,
  parsePresenceInput,
  parseSurrenderedInput,
} from '@/lib/campaign-input';
import {
  parseBuildTrailInput,
  parseAbandonFieldPartsInput,
  parseStructureUseInput,
  parseCancelConstructionInput,
  parseDevDisasterInput,
  parseSendExpeditionInput,
  parseFoundVillageInput,
  parsePlaceCemeteryInput,
  parsePlaceDwellingInput,
  parsePlaceFieldInput,
  parsePlaceOrchardInput,
  parsePlacePenInput,
  parsePlaceFortificationInput,
  parseUpgradeFortificationInput,
  parseAddFortificationGateInput,
  parseDemolishFortificationSectionInput,
  parseRerouteFortificationSectionInput,
  parseFortificationRampartInput,
  parseFortificationGateUpgradeInput,
  parsePlaceSacredInput,
  parsePlaceThreshingFloorInput,
  parseOrderQuarryingInput,
  parsePlaceWorkshopInput,
  parseLeaveVillageInput,
  parseChoosePlayerDepartureInput,
  parseSettleJourneyInput,
  parsePlantRoadApplesInput,
  parseDeclareHuntInput,
  parseSetDefenseStanceInput,
  parseNameLineManInput,
  parseEnnobleInput,
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
  const id = session?.user.id ?? null;
  // hráč s otevřenou hrou je aktivní – jeho vsi neusnou (absence.md – Zátěž serveru)
  if (id !== null) await notePlayerActive(id);
  return id;
}

/** Volba jazyka skupiny před založením vsi (účty přes Google – newcomers.md); chyba česky. */
export async function chooseLanguageAction(
  language: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = await playerId();
  if (id === null) return { ok: false, error: NOT_SIGNED_IN };
  const result = await chooseLanguageForPlayer(id, language);
  return result.ok ? result : { ok: false, error: result.reason };
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
 * `{ unchanged: true }`, když se od něj nic nezměnilo. S `withNotices: true` přidá do odpovědi
 * (i `unchanged`) `playerNotices` – dosud nepřečtená upozornění mezi hráči, která tím označí
 * za přečtená (doručují se jen jednou).
 */
export async function getVillageView(
  input: unknown,
): Promise<
  WithPlayerNotices<VillageView | VillageUnchanged | VillageNone> | null | { error: string }
> {
  const result = await withVillageCache(() => villageViewOf(input));
  if ((result !== null && 'error' in result) || !wantsPlayerNotices(input)) return result;
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  // Hráč bez vsi (jen sídlo): upozornění mu dojdou i tak, bez pohledu na ves.
  if (result === null) {
    return {
      noVillage: true,
      playerNotices: await gameDeps().notices.takeUnread(id, NOTICE_BATCH),
    };
  }
  // Doručení = vyzvednutí a označení za přečtená naráz. Výsledek se kopíruje – objekt z dopočtu
  // se nikdy nedoplňuje (mohl by být sdílený).
  const playerNotices = await gameDeps().notices.takeUnread(id, NOTICE_BATCH);
  return { ...result, playerNotices };
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
 * Pohled na jinou ves hráče `{ villageId }` (přepínač v horní liště) – ověří, že ves
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

/** Zrušení rozestavěné stavby: `{ villageId, constructionId }` – nespotřebované dřevo zpět na hromadu. */
export async function cancelConstruction(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseCancelConstructionInput, cancelConstructionForPlayer);
}

/**
 * Opuštění dílů pole, nebo vrácení do osevu (fields.md – Opuštěný díl): `{ villageId, partIds,
 * abandon }`. Server díly ověří znovu.
 */
export async function abandonFieldParts(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseAbandonFieldPartsInput, abandonFieldPartsForPlayer);
}

/**
 * Opuštění stavby (demolition.md – Opustit a zbourat): `{ villageId, structure, id }` – obydlí,
 * ohrada, modla nebo svatyně přestane sloužit a chátrá. Server stavbu ověří znovu.
 */
export async function abandonStructure(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseStructureUseInput, abandonStructureForPlayer);
}

/** Zbourání stavby: `{ villageId, structure, id }` – vesničané ji rozeberou ze společné práce. */
export async function demolishStructure(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseStructureUseInput, demolishStructureForPlayer);
}

/** Vrácení opuštěné stavby do užívání: `{ villageId, structure, id }`. */
export async function restoreStructure(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseStructureUseInput, restoreStructureForPlayer);
}

/**
 * Odchod do nové vsi (migration.md – fáze 3 a 4): `{ villageId, dwellingIds, destination }` – na
 * novou mapu (`{ kind: 'map', direction }`, vrátí starou ves; jedna ves, jedna mapa – jiný cíl
 * server odmítne). Server domácnosti ověří znovu.
 */
export async function leaveVillage(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseLeaveVillageInput, leaveVillageForPlayer);
}

/**
 * Odchod mladšího syna po pohřbu (seniorate.md, bod 4): `{ villageId, direction, sonName? }` –
 * výprava vyrazí hned, první zemnici umístí hráč. Server lhůtu i jméno ověří znovu.
 */
export async function choosePlayerDeparture(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseChoosePlayerDepartureInput, choosePlayerDepartureForPlayer);
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

/** Hráč zahájí stavbu lomu na skalním výchozu (fortifications.md – Kámen); server místo ověří. */
export async function placeQuarry(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlaceThreshingFloorInput, placeQuarryForPlayer);
}

/** Hráč zadá v lomu „nalámat do zásoby“ (fortifications.md – Kámen). */
export async function orderStoneQuarrying(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseOrderQuarryingInput, orderStoneQuarryingForPlayer);
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
 * Stavba opevnění (fortifications.md – Obvod, Cena a stavba): `{ villageId, cells: [{ x, y }],
 * kind: 'fence' | 'palisade' | 'rampart', grid? }`. Server umístění ověří znovu
 * (`checkFortificationPlacement`).
 */
export async function placeFortification(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlaceFortificationInput, placeFortificationForPlayer);
}

/**
 * Vylepšení opevnění (fortifications.md – Druhy): `{ villageId, fortificationId, work: 'upgrade' }`
 * (plot na palisádu), nebo `{ …, work: 'top', top: 'fence' | 'palisade' }` (nástavba na valu).
 */
export async function upgradeFortification(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseUpgradeFortificationInput, upgradeFortificationForPlayer);
}

/**
 * Brána opevnění (fortifications.md – Brány): `{ villageId, fortificationId, position: { x, z } }`
 * – klik na obvod ve světě.
 */
export async function addFortificationGate(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseAddFortificationGateInput, addFortificationGateForPlayer);
}

/**
 * Zboření úseku opevnění mezi branami (demolition.md – Opevnění): `{ villageId, fortificationId,
 * segment }` – díl, na který hráč klikl; úsek dohledá server.
 */
export async function demolishFortificationSection(input: unknown): Promise<VillageActionResult> {
  return villageAction(
    input,
    parseDemolishFortificationSectionInput,
    demolishFortificationSectionForPlayer,
  );
}

/**
 * Úsek od brány k bráně jinudy (demolition.md – Rozhodnutí): `{ villageId, fortificationId,
 * segment, points, target }` – díl ve zbořeném úseku, body nové trasy mezi branami a hradba.
 */
export async function rerouteFortificationSection(input: unknown): Promise<VillageActionResult> {
  return villageAction(
    input,
    parseRerouteFortificationSectionInput,
    rerouteFortificationSectionForPlayer,
  );
}

/**
 * Doplnění valu s příkopem pod stojící hradbu (fortifications.md – Hradby a obrana, Druhy):
 * `{ villageId, fortificationId, segment }` – díl úseku, null celé opevnění.
 */
export async function addFortificationRampart(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseFortificationRampartInput, addFortificationRampartForPlayer);
}

/** Napuštění příkopu úseku: `{ villageId, fortificationId, segment }` (Hradby a obrana, Druhy). */
export async function fillFortificationMoat(input: unknown): Promise<VillageActionResult> {
  return villageAction(
    input,
    parseDemolishFortificationSectionInput,
    fillFortificationMoatForPlayer,
  );
}

/**
 * Klešťová brána nebo věž nad branou (fortifications.md – Hradby a obrana, Brány): `{ villageId,
 * fortificationId, segment, level: 'pincer' | 'tower' }`.
 */
export async function upgradeFortificationGate(input: unknown): Promise<VillageActionResult> {
  return villageAction(
    input,
    parseFortificationGateUpgradeInput,
    upgradeFortificationGateForPlayer,
  );
}

/**
/**
 * Úprava pevné cesty s hatí a lávkou (roads.md): `{ villageId, roadId, upgrade: 'improved' }` –
 * server ho ověří znovu (`roadUpgradeOptions`).
 */
/**
 * Nabídka panelu až na vyžádání (panel-options.ts): `{ villageId, panel: 'trails' }` – zemské
 * stezky dvorce do 8 směrů, `{ villageId, panel: 'road-apples', roadId }` – výsadba jabloní
 * podél cesty. Server ji spočítá ze vsi dopočítané do dneška; akce ji ověří znovu.
 */
export async function getPanelOptions(input: unknown): Promise<PanelOptions | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  const ask = parsePanelAsk(input);
  if (villageId === null || ask === null) return { error: INVALID_INPUT };
  return panelOptionsForPlayer(id, villageId, ask);
}

/**
 * Stránka kroniky vsi (panel Kronika): `{ villageId, before? }` – roky před `before`, bez něj od
 * nejnovějšího (chronicle-view.ts).
 */
export async function getChronicle(input: unknown): Promise<ChroniclePage | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const villageId = villageIdOf(input);
  const ask = parseChronicleAsk(input);
  if (villageId === null || ask === null) return { error: INVALID_INPUT };
  return chronicleForPlayer(id, villageId, ask);
}

/**
 * Stránka historie upozornění mezi hráči (panel Upozornění): `{ before? }`. Jen upozornění
 * přihlášeného hráče (id hráče je ze session, ne ze vstupu); nic neoznačuje za přečtené.
 */
export async function getNotices(input: unknown): Promise<NoticePage | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const ask = parseNoticeAsk(input);
  if (ask === null) return { error: INVALID_INPUT };
  return noticePage(await gameDeps().notices.page(id, ask.before, NOTICE_PAGE_SIZE + 1));
}

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
 * Panel Vojsko (war.md): `{ villageId, targetVillageId }` – vsi rodu s muži, cíle ve válce a
 * (s vybraným cílem) dobrovolníci po vsích. Jen s právem `war` ve vsi `villageId`.
 */
export async function getArmyPanel(input: unknown): Promise<ArmyPanelData | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseArmyPanelInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return withVillageCache(() => armyPanelForPlayer(id, parsed));
}

/** Odhad tažení `{ plan }` (síla, cesta, zásoby), nebo důvod odmítnutí; nic nemění. */
export async function planArmyCampaign(
  input: unknown,
): Promise<CampaignEstimate | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseCampaignPlanInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return withVillageCache(() => planCampaignForPlayer(id, parsed.plan));
}

/** Vyšle tažení `{ plan }`: muži odejdou, jídlo se odečte a tažení vyrazí ze shromaždiště. */
export async function launchArmyCampaign(
  input: unknown,
): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseCampaignPlanInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return withVillageCache(() => launchCampaignForPlayer(id, parsed.plan));
}

/** Běžící tažení, která hráč vede (panel Vojsko – pohled na tažení). */
export async function getMyCampaigns(): Promise<CampaignSummary[] | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return campaignsOfPlayer(id);
}

/** Odmítnutý pokyn do tažení – jedna odpověď pro každý důvod (nic se neprozradí). */
const COMMAND_REFUSED = 'Rozkaz nelze dát.';

async function campaignCommand(
  input: unknown,
  parse: (value: unknown) => { campaignId: string; command: CampaignCommand } | null,
): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parse(input);
  if (parsed === null) return { error: INVALID_INPUT };
  const queued = await commandCampaignForPlayer(id, parsed.campaignId, parsed.command);
  return queued ? { ok: true } : { error: COMMAND_REFUSED };
}

/**
 * Živé vedení (war.md – Velení): `{ campaignId, target }` – velitel jde na místo, k objevené
 * stavbě, napadne muže v dohledu, nebo obrátí domů. Záměr na takt teď + 2; jen vlastní živý
 * nezajatý velitel a cíl, který hráč zná.
 */
export async function commandLeader(input: unknown): Promise<{ ok: true } | { error: string }> {
  return campaignCommand(input, parseLeaderInput);
}

/** Rozkaz skupině `{ campaignId, group, order, at? }` (war.md – Boj – Změna rozkazu). */
export async function setGroupOrder(input: unknown): Promise<{ ok: true } | { error: string }> {
  return campaignCommand(input, parseGroupOrderInput);
}

/** Volba ke vzdaným `{ campaignId, group, choice }` – pobít / odvést / nechat (war.md – Velení). */
export async function chooseSurrendered(input: unknown): Promise<{ ok: true } | { error: string }> {
  return campaignCommand(input, parseSurrenderedInput);
}

/** Hráč je u tažení `{ campaignId }` – posílá jen otevřené tažení (bez ní po 1 dni zástupce). */
export async function presence(input: unknown): Promise<{ ok: true } | { error: string }> {
  return campaignCommand(input, parsePresenceInput);
}

/**
 * Rozkaz „Probít se“ obráncům napadené vsi `{ villageId }` (fortifications.md – Obrana bez násobku
 * 3, Bod zlomu a probíjení): jen držitel vsi (právo `war`) při boji u ní; jinak důvod česky.
 */
export async function orderBreakout(input: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.villageId)) return { error: INVALID_INPUT };
  return orderBreakoutForPlayer(id, input.villageId);
}

/**
 * Pohled na varování vsi `{ villageId }` (war.md – Varování, poslové a útěk do hradiště): volby
 * při varování s důvody a odhady, posel, skupina uprchlíků, Vrátit se; null = ves hráč nevidí.
 * Dotazování `useAlarm` – 2 s při varování, jinak 10 s.
 */
export async function getAlarmView(input: unknown): Promise<AlarmView | null | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseAlarmVillage(input);
  if (parsed === null) return { error: INVALID_INPUT };
  // ves a hradiště se čtou víckrát (práva, volby) a dotaz se opakuje každé 2 s – paměť vsí
  // přes dotazy drží `alarmViewForPlayer` (lib/alarm.ts)
  return alarmViewForPlayer(id, parsed.villageId);
}

/**
 * Příkaz obránce varované vsi `{ villageId, command }` – `{ kind: 'messenger', personId? }`,
 * `{ kind: 'flee', mode: 'forest' | 'people' | 'all' }`, `{ kind: 'domain', to: [vsi] }`: jen
 * držitel vsi (právo `war`); záměr do tažení na takt teď + 2, jinak důvod česky.
 */
export async function commandAlarm(input: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseAlarmCommand(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return commandAlarmForPlayer(id, parsed.villageId, parsed.command);
}

/**
 * Vrátit se `{ villageId }` – uprchlíci vsi domů (war.md – Varování: „domů se vrátí, až vojsko
 * odtáhne z jejich mapy – rozhodne hráč“): jen držitel vsi; den příchodu, nebo důvod česky.
 */
export async function returnFromRefuge(
  input: unknown,
): Promise<{ ok: true; arrivesDay: number } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseAlarmVillage(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return returnFromRefugeForPlayer(id, parsed.villageId);
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
/** Povýšení vesničana do šlechtického stavu pro ves bez vojvody (vassalage.md). */
export async function ennobleVillager(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseEnnobleInput, ennobleVillagerForPlayer);
}

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

/** Postoj vsi před cizím vojskem (war.md – Obránci): `{ villageId, stance }`. */
export async function setDefenseStance(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseSetDefenseStanceInput, (id, villageId, parsed) =>
    setDefenseStanceForPlayer(id, villageId, parsed.stance),
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

/**
 * Panel „Rod a vazalové“ (vassalage.md – Co hráč vidí): vlastní rod, páni, vazalové, nejbližší
 * hráči a pozvánky. Bez vstupu; hráč jen ze session, o cizích rodech jen veřejné údaje.
 */
export async function housePanel(): Promise<HouseView | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return housePanelForPlayer(id);
}

/** Vydá novou pozvánku (nejvýš tři nevyužité): `{ code }` bez pomlčky, nebo důvod česky. */
export async function issueInvite(): Promise<{ code: string } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return issueInviteForPlayer(id);
}

/** Zruší vlastní nevyužitý kód: `{ code }`. */
export async function revokeInvite(input: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseRevokeInviteInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return revokeInviteForPlayer(id, parsed.code);
}

/** Nabídne vazalství / požádá o přijetí: `{ to, items, message }` (id rodu, podmínky, vzkaz). */
export async function openNegotiation(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseOpenNegotiationInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return openNegotiationForPlayer(id, parsed);
}

/** Opoví válku rodu: `{ target, items, message }` (id rodu, požadavek jako podmínky míru, vzkaz). */
export async function declareWarOnHouse(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseDeclareWarInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return declareWarForPlayer(id, parsed);
}

/** Stav nováčka: odříznutý (nabídka pánů, žádosti, konec týdne), nebo umístěný (newcomers.md). */
export async function newcomerStatusAction(): Promise<NewcomerStatusView | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return newcomerStatusForPlayer(id);
}

/** Odříznutý nováček začne svobodný – umístí se na mapu světa (newcomers.md). */
export async function startFreeAction(): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return startFreeForPlayer(id);
}

/** Nováček žádá rody z nabídky o přijetí za vazala: pole id rodů (1–5). */
export async function requestLordsAction(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!Array.isArray(input) || !input.every((h): h is string => typeof h === 'string')) {
    return { error: INVALID_INPUT };
  }
  return requestLordsForPlayer(id, input);
}

/** Žaloba na spoluvazala před společným pánem: `{ against, message }`. */
export async function fileComplaintAction(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseComplaintInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return fileComplaintForPlayer(id, parsed);
}

/** Vyjádření obžalovaného: `{ disputeId, statement }`. */
export async function answerComplaintAction(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseStatementInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return answerComplaintForPlayer(id, parsed);
}

/** Rozsudek pána: `{ disputeId, verdict }`. */
export async function judgeDisputeAction(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseJudgeInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return judgeDisputeForPlayer(id, parsed);
}

/** Odpoví na jednání: `{ negotiationId, answer: accept | reject | withdraw | counter, ... }`. */
export async function answerNegotiation(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseNegotiationAnswerInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return answerNegotiationForPlayer(id, parsed);
}

/** Zablokuje rod: `{ target }`. */
export async function blockHouse(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseBlockInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return blockHouseForPlayer(id, parsed.target);
}

/** Věznitel rozhodne o zajatci: `{ prisonerId, action: 'hold' | 'release' | 'execute' }`. */
export async function decidePrisonerAction(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parsePrisonerInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  const result = await decidePrisonerForPlayer(id, parsed);
  return result.ok ? { ok: true } : { error: result.reason };
}

/** Zruší zablokování rodu: `{ target }`. */
export async function unblockHouse(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseBlockInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return unblockHouseForPlayer(id, parsed.target);
}

/**
 * Výhled „kolik můžu postrádat“ pro formulář podmínek: `{ toHouseId, targetVillageId? }` →
 * `{ spare }` (makrokomodity, lidé a robota). Počítá se jen na vyžádání.
 */
export async function houseSpare(
  input: unknown,
): Promise<{ spare: MacroSpare } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseSpareInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return houseSpareForPlayer(id, parsed);
}

/** Vypoví dohodu: `{ vassalageId, message? }`; platí hned, upozorní celý strom. */
export async function renounceVassalage(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseRenounceInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return renounceVassalageForPlayer(id, parsed);
}

/** Odvolá správce vsi: `{ villageId }`; smí jen držitel vsi, platí hned. */
export async function dismissSteward(input: unknown): Promise<NegotiationActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseDismissStewardInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return dismissStewardForPlayer(id, parsed.villageId);
}

/** Otevřené dialogy Odvody hráče s předvyplněným rozdělením po vsích (počítá se na vyžádání). */
export async function levyDialogs(): Promise<
  { dialogs: LevyDialogView[]; summons: SummonsDialogView[] } | { error: string }
> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const levy = await levyDialogsForPlayer(id);
  if ('error' in levy) return levy;
  return { ...levy, summons: await summonsDialogsForPlayer(id) };
}

const isText = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.length <= max;
const isId = (v: unknown): v is string => isText(v, 100) && v !== '';
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Svolání vazalů: `{ warId, vassalageIds: string[], targetVillageId }` (vassalage.md – Svolání). */
export async function summonVassals(
  input: unknown,
): Promise<{ ok: true; opened: number; skipped: string[] } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.warId) || !isId(input.targetVillageId)) {
    return { error: INVALID_INPUT };
  }
  const ids = input.vassalageIds;
  if (!Array.isArray(ids) || ids.length > 50 || !ids.every(isId)) return { error: INVALID_INPUT };
  return summonVassalsForPlayer(id, {
    warId: input.warId,
    vassalageIds: ids,
    targetVillageId: input.targetVillageId,
  });
}

/** Odpověď na Svolání: `{ dialogId, men: [{ villageId, personId }], message? }`. */
export async function answerSummons(
  input: unknown,
): Promise<{ ok: true; sent: number; arrivesDay: number | null } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.dialogId) || !Array.isArray(input.men)) {
    return { error: INVALID_INPUT };
  }
  const men = input.men.filter(
    (m): m is { villageId: string; personId: number } =>
      isRecord(m) && isId(m.villageId) && Number.isInteger(m.personId),
  );
  if (men.length !== input.men.length || men.length > 100) return { error: INVALID_INPUT };
  const message = input.message === undefined || input.message === null ? null : input.message;
  if (message !== null && !isText(message)) return { error: INVALID_INPUT };
  return answerSummonsForPlayer(id, {
    dialogId: input.dialogId,
    men: men.map((m) => ({ villageId: m.villageId, personId: m.personId })),
    message,
  });
}

/** Ohlášení průchodu, na která hráč může odpovědět (panel války). */
export async function passagesToAnswer(): Promise<{ passages: PassageView[] } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return { passages: await passagesForPlayer(id) };
}

/** Ohlášení průchodu: `{ house, cells: [{ x, y }], eta, message }` (war.md – Pohyb). */
export async function announcePassage(input: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.house) || !Array.isArray(input.cells)) {
    return { error: INVALID_INPUT };
  }
  const cells = input.cells.filter(
    (c): c is { x: number; y: number } =>
      isRecord(c) && Number.isInteger(c.x) && Number.isInteger(c.y),
  );
  if (cells.length !== input.cells.length || cells.length > 100) return { error: INVALID_INPUT };
  if (!Number.isFinite(input.eta) || !isText(input.message)) return { error: INVALID_INPUT };
  return announcePassageForPlayer(id, {
    house: input.house,
    cells: cells.map((c) => ({ x: c.x, y: c.y })),
    eta: input.eta as number,
    message: input.message,
  });
}

/** Odpověď na ohlášení průchodu: `{ passageId, trust, message? }` (trust false = „Nevěřit“). */
export async function answerPassage(input: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.passageId) || typeof input.trust !== 'boolean') {
    return { error: INVALID_INPUT };
  }
  const message = input.message === undefined ? '' : input.message;
  if (!isText(message)) return { error: INVALID_INPUT };
  return answerPassageForPlayer(id, { passageId: input.passageId, trust: input.trust, message });
}

/**
 * Odpoví na dialog Odvody: `{ dialogId, lines: [{ good, amount }], split: { <villageId>: svazek },
 * message? }`; pošle zásilky z vsí rodu a upozorní pána.
 */
export async function answerLevy(
  input: unknown,
): Promise<{ ok: true; arrivesDay: number | null } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseAnswerLevyInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return answerLevyForPlayer(id, parsed);
}

/** Nerozhodnuté odúmrti hráče (dialog Odúmrť – počítá se na vyžádání). */
export async function escheatDialogs(): Promise<{ escheats: EscheatView[] } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  return escheatDialogsForPlayer(id);
}

/** Návrh dělení odúmrti: `{ escheatId, parts: [{ toHouseId, villageIds, vassalIds }] }`. */
export async function proposeEscheat(
  input: unknown,
): Promise<{ ok: true; decided: boolean } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseProposeEscheatInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return proposeEscheatForPlayer(id, parsed);
}

/** Souhlas s návrhem dělení odúmrti: `{ escheatId, version }`. */
export async function consentEscheat(
  input: unknown,
): Promise<{ ok: true; decided: boolean } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseConsentEscheatInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return consentEscheatForPlayer(id, parsed);
}

/** Ochrana v panelu války pro zobrazenou ves `{ villageId }` (vassalage.md – Ochrana vojskem). */
export async function protectionView(
  input: unknown,
): Promise<{ protection: ProtectionView } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !(input.villageId === null || isId(input.villageId))) {
    return { error: INVALID_INPUT };
  }
  return { protection: await protectionViewForPlayer(id, input.villageId) };
}

/** Vazal žádá pána o ochranu vsi: `{ vassalageId, villageId, message? }`. */
export async function requestProtection(input: unknown): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.vassalageId) || !isId(input.villageId)) {
    return { error: INVALID_INPUT };
  }
  const message = input.message ?? '';
  if (!isText(message)) return { error: INVALID_INPUT };
  return requestProtectionForPlayer(id, {
    vassalageId: input.vassalageId,
    villageId: input.villageId,
    message,
  });
}

/** Pán pošle muže rodu na ochranu vsi vazala: `{ vassalageId, villageId, men }` (počet). */
export async function sendProtection(
  input: unknown,
): Promise<{ ok: true; sent: number } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.vassalageId) || !isId(input.villageId)) {
    return { error: INVALID_INPUT };
  }
  const men = input.men;
  if (typeof men !== 'number' || !Number.isInteger(men) || men < 1 || men > 100) {
    return { error: INVALID_INPUT };
  }
  return sendProtectionForPlayer(id, {
    vassalageId: input.vassalageId,
    villageId: input.villageId,
    men,
  });
}

/** Pán odvolá své muže z ochrany vsi vazala: `{ vassalageId, villageId }`. */
export async function recallProtection(
  input: unknown,
): Promise<{ ok: true; men: number } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.vassalageId) || !isId(input.villageId)) {
    return { error: INVALID_INPUT };
  }
  return recallProtectionForPlayer(id, {
    vassalageId: input.vassalageId,
    villageId: input.villageId,
  });
}

/** Ohlášení průchodu z panelu války: `{ warId, house, message? }` – mapy dopočte server. */
export async function announceWarPassage(
  input: unknown,
): Promise<{ ok: true } | { error: string }> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  if (!isRecord(input) || !isId(input.warId) || !isId(input.house)) {
    return { error: INVALID_INPUT };
  }
  const message = input.message ?? '';
  if (!isText(message)) return { error: INVALID_INPUT };
  return announceWarPassageForPlayer(id, { warId: input.warId, house: input.house, message });
}
