'use server';

import { restartGameForPlayer } from '@/lib/game';
import { withVillageCache } from '@bohemia/server';
import {
  buildTrailForPlayer,
  buildWagonRoadForPlayer,
  abandonFieldPartsForPlayer,
  abandonStructureForPlayer,
  demolishStructureForPlayer,
  restoreStructureForPlayer,
  cancelConstructionForPlayer,
  sendExpeditionForPlayer,
  foundVillageForPlayer,
  placeCemeteryForPlayer,
  placeDwellingForPlayer,
  placeFieldForPlayer,
  placeOrchardForPlayer,
  placePenForPlayer,
  placeSacredForPlayer,
  placeThreshingFloorForPlayer,
  placeQuarryForPlayer,
  placeChurchForPlayer,
  inviteLodgeForPlayer,
  inviteMasterForPlayer,
  orderStoneQuarryingForPlayer,
  placeWorkshopForPlayer,
  leaveVillageForPlayer,
  choosePlayerDepartureForPlayer,
  settleJourneyForPlayer,
  plantRoadApplesForPlayer,
  declareHuntForPlayer,
  setDefenseStanceForPlayer,
  nameLineManForPlayer,
  baptizeLordForPlayer,
  ennobleVillagerForPlayer,
  setStewardForPlayer,
  renameVillageForPlayer,
  upgradeRoadForPlayer,
  type DeclareHuntRefusal,
  type VillageActionResult,
} from '@/lib/village';
import { HUNT_DENIED_TEXT, NOT_PLAYER_VILLAGE } from '@bohemia/game';
import {
  parseBuildTrailInput,
  parseAbandonFieldPartsInput,
  parseStructureUseInput,
  parseCancelConstructionInput,
  parseSendExpeditionInput,
  parseFoundVillageInput,
  parsePlaceCemeteryInput,
  parsePlaceDwellingInput,
  parsePlaceFieldInput,
  parsePlaceOrchardInput,
  parsePlacePenInput,
  parsePlaceSacredInput,
  parsePlaceThreshingFloorInput,
  parsePlaceChurchInput,
  parseOrderQuarryingInput,
  parsePlaceWorkshopInput,
  parseLeaveVillageInput,
  parseChoosePlayerDepartureInput,
  parseSettleJourneyInput,
  parsePlantRoadApplesInput,
  parseDeclareHuntInput,
  parseSetDefenseStanceInput,
  parseNameLineManInput,
  parseBaptizeInput,
  parseInviteLodgeInput,
  parseInviteMasterInput,
  parseEnnobleInput,
  parseSetStewardInput,
  parseRenameVillageInput,
  parseRestartGameInput,
  parseUpgradeRoadInput,
} from '@/lib/village-input';
import { NOT_SIGNED_IN, INVALID_INPUT, playerId, villageAction } from './_shared';

/** Založení první vsi: `{ name, dwelling: { x, z, rotation }, fieldCells?: { x, y }[] }`. */
export async function foundVillage(input: unknown): Promise<VillageActionResult> {
  const id = await playerId();
  if (id === null) return { error: NOT_SIGNED_IN };
  const parsed = parseFoundVillageInput(input);
  if (parsed === null) return { error: INVALID_INPUT };
  return withVillageCache(() => foundVillageForPlayer(id, parsed));
}

/**
 * Stavba nového obydlí: `{ villageId, type: 'zemnice' | 'polozemnice' | 'vypleteny' | 'srub',
 * position: { x, z, rotation }, plot?: { cell: { x, y }, variant } }` – polozemnice a nadzemní domy
 * na pozemku (poloha domu podle něj); vypletený dům před rokem 750 a nadzemní dům (srub) před rokem
 * 800 server odmítne (`dwellingYearReason`).
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

/**
 * Stavba kostela (churches.md – Stavba): `{ villageId, type, dims, position }` – rozměry
 * `{ kind: 'round', diameter, height }` nebo `{ kind: 'long', width, length, height }`.
 */
export async function placeChurch(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlaceChurchInput, placeChurchForPlayer);
}

/** Hráč zadá v lomu „nalámat do zásoby“ (fortifications.md – Kámen). */
export async function orderStoneQuarrying(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseOrderQuarryingInput, orderStoneQuarryingForPlayer);
}

/** Pozvání stavební huti (stone-masonry.md): `{ villageId, circle: 'adriatic' | 'carolingian' }`. */
export async function inviteLodge(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseInviteLodgeInput, inviteLodgeForPlayer);
}

/** Pozvání chybějícího mistra (stone-masonry.md): `{ villageId, craft }`. */
export async function inviteMaster(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseInviteMasterInput, inviteMasterForPlayer);
}

/**
 * Stavba ohrady s přístřeškem, nebo její rozšíření (oxen.md – Ohrady podle druhu): `{ villageId,
 * cells: [{ x, y }], species, grid? }` – nejvýš 4 čtverce louky, druh zvířat.
 * Server umístění ověří znovu (`penSquaresFromCells`).
 */
export async function placePen(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parsePlacePenInput, placePenForPlayer);
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
 * 'burner' | 'carpenter', position, type? }`; `type` 'vypleteny' | 'srub' je nadzemní dílna
 * (workshops.md), server ověří rok, cenu i místo (`checkWorkshopPlacement`).
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

/**
 * Křest vojvody (christianity.md – Křest rodu): `{ villageId }`. Rod, který křesťanství nezná, je
 * už pokřtěný nebo jehož vojvoda žije jinde, odmítne use-case s důvodem česky.
 */
export async function baptizeLord(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseBaptizeInput, (id, villageId) =>
    baptizeLordForPlayer(id, villageId),
  );
}

export async function nameLineMan(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseNameLineManInput, nameLineManForPlayer);
}

/** Zapnutí / vypnutí správce vsi (steward.md): `{ villageId, on }`. */
export async function setSteward(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseSetStewardInput, setStewardForPlayer);
}

/**
 * Lov (hunting.md – Pravidla 2; plán 2026-11-22-hunting – Úloha 9): `{ villageId }`. Lov běží ve
 * výpravě vsi a honci chybí v práci vsi zítra – vrátí pohled na ves; důvod odepření use-case
 * (`DeclareHuntRefusal`) jde jako chyba česky.
 */
export async function declareHunt(input: unknown): Promise<VillageActionResult> {
  return villageAction(input, parseDeclareHuntInput, async (id, villageId) => {
    const result = await declareHuntForPlayer(id, villageId);
    return 'refused' in result ? { error: huntRefusalText(result.refused) } : result;
  });
}

/** Důvod odepření lovu česky – důvody vsi `HUNT_DENIED_TEXT`. */
function huntRefusalText(reason: DeclareHuntRefusal): string {
  switch (reason) {
    case 'no-village':
      return NOT_PLAYER_VILLAGE;
    case 'busy':
      return 'Zkus to znovu.';
    default:
      return HUNT_DENIED_TEXT[reason];
  }
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
