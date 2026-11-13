import {
  currentLord,
  dynastySenior,
  isVillageAbandoned,
  isVillageExtinct,
  type VillageState,
} from '../domain/village';
import type { HouseRepository, PendingDeparture, PersonRef } from './houses';
import { findPlayerVillage, NOT_PLAYER_VILLAGE, type PlayerVillage } from './player-villages';
import type { SettlementRepository } from './settlements';
import type { StewardshipRepository } from './stewardships';
import type { VillageRepository } from './villages';

// Práva hráče ve vsích rodu (seniorate.md – Hráčův muž a vlastní ves, Seniorát; Martin 2. 11. 2026
// u nesenioru v cizí vsi rodu: „Jen se dívat“). Každá akce nad vsí má své právo a vstupní bod ji
// pustí jen přes `requireRight`.

/** Co smí hráč ve vsi rodu dělat. */
export type VillageRight =
  | 'build'
  | 'veto'
  | 'steward'
  | 'nameSons'
  | 'sendSons'
  | 'evacuate'
  | 'ennoble'
  | 'dismissSteward'
  | 'trade'
  | 'war';

/** Všechna práva – má je hráč ve vlastní vsi a ve vsi, kterou spravuje sám. */
export const ALL_RIGHTS: readonly VillageRight[] = [
  'build',
  'veto',
  'steward',
  'nameSons',
  'sendSons',
  'evacuate',
  'ennoble',
  'dismissSteward',
  'trade',
  'war',
];

/** Práva seniora rodu v cizí vsi rodu (seniorate.md – Práva seniora): stavět, veto, vystěhovat. */
const SENIOR_RIGHTS: readonly VillageRight[] = ['build', 'veto', 'evacuate'];

/**
 * Práva správce cizí vsi (vassalage.md – Hráč jako správce cizí vsi; Martin 2. 11. 2026: „Ano“):
 * běžné řízení – stavby, veto, zapnutí správce, obchod; **ne** vystěhování vsi, posílání synů
 * držitele, povyšování ani válka (návrh Clauda – válka není běžné řízení). Pojmenování synů rodu
 * a odvolání správce patří držiteli.
 */
const STEWARD_RIGHTS: readonly VillageRight[] = ['build', 'veto', 'steward', 'trade'];

/** Důvod u správce: proč ostatní práva chybí. */
export const STEWARD_ONLY = 'Ves jen spravuješ.';

/**
 * Právo každé akce hráče nad vsí (klíč = jméno akce ve vstupním bodě). **Nová akce nad vsí se
 * zapíše sem** – vstupní bod (`actOn` v apps/web/lib/village.ts) bere jen klíč odtud, takže akce
 * bez práva se nepřeloží a test `rights.test.ts` ji projde mezi ostatními.
 */
export const ACTION_RIGHTS = {
  placeDwelling: 'build',
  placeField: 'build',
  placeCemetery: 'build',
  placeOrchard: 'build',
  placeSacred: 'build',
  placeThreshingFloor: 'build',
  placeQuarry: 'build',
  // stavba kostela (churches.md – Stavba)
  placeChurch: 'build',
  // pozvání stavební huti a mistra (stone-masonry.md) – rozhodnutí rodu jako křest vojvody
  inviteLodge: 'ennoble',
  inviteMaster: 'ennoble',
  orderStoneQuarrying: 'build',
  placeWorkshop: 'build',
  placePen: 'build',
  placeFortification: 'build',
  upgradeFortification: 'build',
  addFortificationGate: 'build',
  demolishFortificationSection: 'build',
  // úsek od brány k bráně jinudy (demolition.md – Rozhodnutí) – jako stavba
  rerouteFortificationSection: 'build',
  // panel úseku a brány (fortifications.md – Hradby a obrana, Rozhraní a scéna) – jako stavba
  addFortificationRampart: 'build',
  fillFortificationMoat: 'build',
  upgradeFortificationGate: 'build',
  upgradeRoad: 'build',
  buildWagonRoad: 'build',
  plantRoadApples: 'build',
  buildTrail: 'build',
  cancelConstruction: 'build',
  // opuštění dílu pole a vrácení do osevu (fields.md – Opuštěný díl) – jako zakládání pole
  abandonFieldParts: 'build',
  // opustit, zbourat a vrátit stavbu (demolition.md – Opustit a zbourat) – jako stavba
  abandonStructure: 'build',
  demolishStructure: 'build',
  restoreStructure: 'build',
  // první zemnice nové vsi po příchodu lidí – stavba
  settleJourney: 'build',
  // odchod domácností (i celé vsi) na novou mapu
  leaveHouseholds: 'evacuate',
  leaveWithSon: 'sendSons',
  // hráč v kůži mladšího syna volí směr odchodu po pohřbu – v mateřské vsi, kde je jeho muž doma,
  // má všechna práva (`dependsOnDynasty`); jde o odchod syna, proto stejné právo jako leaveWithSon
  choosePlayerDeparture: 'sendSons',
  nameLineMan: 'nameSons',
  // povýšení vesničana (vassalage.md) – jen držitel vlastní vsi; správce ani senior ne
  ennobleVillager: 'ennoble',
  // křest vojvody (christianity.md – Křest rodu) – rozhodnutí rodu jako povýšení
  baptizeLord: 'ennoble',
  setSteward: 'steward',
  // řízení vsi, které senior v cizí vsi nemá: lov, jméno vsi, vývojové pohromy
  declareHunt: 'steward',
  renameVillage: 'steward',
  forceDevDisaster: 'steward',
  sendExpedition: 'trade',
  // vojsko a tažení (war.md) – jen držitel vlastní vsi; správce cizí vsi válčit nesmí
  planCampaign: 'war',
  launchCampaign: 'war',
  summonVassals: 'war',
  // výjezd vojvody (lord-control.md) – výběr družiny a vyslání: jen držitel vlastní vsi
  launchJourney: 'war',
  // žádost o ochranu vsi u pána (vassalage.md – Ochrana vojskem) – jen držitel vsi
  requestProtection: 'war',
  // postoj vsi před cizím vojskem (war.md – Obránci) – obrana je válka: jen držitel vsi
  setDefenseStance: 'war',
  // varování, posel a útěk do hradiště, návrat (war.md – Varování, poslové a útěk do hradiště) –
  // obrana je válka: jen držitel vsi
  commandAlarm: 'war',
  returnFromRefuge: 'war',
} as const satisfies Record<string, VillageRight>;

/** Jméno akce nad vsí. */
export type VillageAction = keyof typeof ACTION_RIGHTS;

/** Důvod u nesenioru: „Rozhoduje Bořivoj.“ */
export const decidesSenior = (name: string): string => `Rozhoduje ${name}.`;
/** Důvod u seniora v cizí vsi: „Ves vede Ctibor.“ */
export const ledBy = (name: string): string => `Ves vede ${name}.`;

/** Náhradní jména, když muž rodu ještě nemá jméno. */
const LORD_FALLBACK = 'Vojvoda';
const SENIOR_FALLBACK = 'Senior rodu';

export interface RightsContext {
  /** Ves, ve které hráč jedná. */
  villageId: string;
  /** Živé vsi rodu se stavy (pro seniora); stačí ves `villageId`, pokud se neřeší senior. */
  villages: readonly { villageId: string; state: VillageState }[];
  /** Hráčův muž (`House.lord`); null před převodem rozehrané hry. */
  playerLord: PersonRef | null;
  /** Dnešní herní den. */
  day: number;
  /** Hráč ves jen spravuje (živá správa jeho rodu) – dostane `STEWARD_RIGHTS`. */
  stewarding?: boolean;
}

export interface VillageRights {
  allowed: ReadonlySet<VillageRight>;
  /** Proč ostatní práva chybí (jméno seniora / vojvody); null, když chybí jen málo nebo nic. */
  reason: string | null;
}

const samePerson = (a: PersonRef | null, b: PersonRef | null): boolean =>
  a !== null && b !== null && a.villageId === b.villageId && a.personId === b.personId;

/**
 * Rozhoduje se podle ostatních vsí rodu (senior)? Ne u vlastní vsi, vsi bez vojvody ani před
 * převodem – tam stačí ves sama a nemusí se načítat stavy ostatních.
 */
export function dependsOnDynasty(ctx: {
  villageId: string;
  state: VillageState;
  playerLord: PersonRef | null;
}): boolean {
  return (
    ctx.playerLord !== null &&
    ctx.playerLord.villageId !== ctx.villageId &&
    currentLord(ctx.state) !== undefined
  );
}

/**
 * Práva hráče ve vsi (čistá funkce): vlastní ves (v ní je vojvodou hráčův muž) a ves bez vojvody,
 * kterou hráč spravuje sám – vše; senior rodu v cizí vsi rodu – stavět, veto, vystěhovat; ostatní
 * v cizí vsi rodu – nic. Před převodem rozehrané hry (bez hráčova muže) vše jako dřív.
 */
export function villageRights(ctx: RightsContext): VillageRights {
  if (ctx.stewarding) return { allowed: new Set(STEWARD_RIGHTS), reason: STEWARD_ONLY };
  const all: VillageRights = { allowed: new Set(ALL_RIGHTS), reason: null };
  const target = ctx.villages.find((v) => v.villageId === ctx.villageId);
  if (!target || !dependsOnDynasty({ ...ctx, state: target.state })) return all;
  const lord = currentLord(target.state);
  const senior = dynastySenior(ctx.villages, ctx.day);
  if (samePerson(senior, ctx.playerLord)) {
    return { allowed: new Set(SENIOR_RIGHTS), reason: ledBy(lord?.name ?? LORD_FALLBACK) };
  }
  const seniorState = ctx.villages.find((v) => v.villageId === senior?.villageId)?.state;
  const seniorName = seniorState?.people.find((p) => p.id === senior?.personId)?.name;
  return { allowed: new Set(), reason: decidesSenior(seniorName ?? SENIOR_FALLBACK) };
}

export interface RightsDeps {
  settlements: SettlementRepository;
  villages: VillageRepository;
  houses: Pick<HouseRepository, 'activeOf'>;
  /** Správy cizích vsí; bez nich hráč jedná jen ve vlastních vsích. */
  stewardships?: Pick<StewardshipRepository, 'of'>;
}

/** Ves hráče s právy, která v ní má, a naposledy zapsaný senior rodu (pro stolec v přepínači). */
export interface VillageAccess {
  found: PlayerVillage;
  rights: VillageRights;
  senior: PersonRef | null;
  /** Odchod mladšího syna po pohřbu, na jehož volbu hráč čeká (seniorate.md, bod 4), nebo null. */
  pendingDeparture: PendingDeparture | null;
  /**
   * Vojvoda rodu se tu smí nechat pokřtít (christianity.md – Křest rodu): rod křesťanství zná, ještě
   * není pokřtěný a vojvoda rodu (`House.lord`) žije v téhle vsi – tlačítko u vojvody. Správce
   * cizí vsi nikdy; právo (`ACTION_RIGHTS.baptizeLord`) je v `rights`.
   */
  baptizable?: true;
}

/**
 * Přístup správce ke vsi, kterou drží jiný hráč: jen při živé správě jeho rodu. Jinak null – stejně
 * jako u cizí vsi, nic o vsi se neprozradí (po odvolání správce přístup zmizí hned).
 */
async function stewardAccess(
  deps: RightsDeps,
  houseId: string | null,
  input: { villageId: string; today: number },
): Promise<VillageAccess | null> {
  if (!houseId || !deps.stewardships) return null;
  const steward = await deps.stewardships.of(input.villageId);
  if (!steward || steward.stewardHouseId !== houseId || steward.kind !== 'player') return null;
  const village = await deps.villages.find(input.villageId);
  const settlement = village ? await deps.settlements.find(village.settlementId) : null;
  if (!village || !settlement) return null;
  const rights = villageRights({
    villageId: village.id,
    villages: [],
    playerLord: null,
    day: input.today,
    stewarding: true,
  });
  return { found: { settlement, village }, rights, senior: null, pendingDeparture: null };
}

/**
 * Práva hráče ve vsi `villageId` ke dni `today` (`villageRights` nad skutečnými repozitáři); ves
 * hráči nepatří – null. Stavy ostatních vsí rodu se načtou, jen když na nich záleží (cizí ves
 * s vojvodou).
 */
export async function villageAccess(
  deps: RightsDeps,
  input: { playerId: string; villageId: string; today: number },
): Promise<VillageAccess | null> {
  const found = await findPlayerVillage(deps, input);
  const house = await deps.houses.activeOf(input.playerId);
  if (!found) return stewardAccess(deps, house?.id ?? null, input);
  const playerLord = house?.lord ?? null;
  const self = { villageId: found.village.id, state: found.village.state };
  let villages = [self];
  if (dependsOnDynasty({ ...self, playerLord })) {
    villages = [];
    for (const settlement of await deps.settlements.listActive(input.playerId)) {
      for (const v of await deps.villages.listBySettlement(settlement.id)) {
        if (v.id === self.villageId) villages.push(self);
        else if (!isVillageExtinct(v.state) && !isVillageAbandoned(v.state)) {
          villages.push({ villageId: v.id, state: v.state });
        }
      }
    }
  }
  const rights = villageRights({
    villageId: self.villageId,
    villages,
    playerLord,
    day: input.today,
  });
  return {
    found,
    rights,
    senior: house?.senior ?? null,
    pendingDeparture: house?.pendingDeparture ?? null,
    ...(house &&
    house.christianityKnownYear !== null &&
    house.baptizedDay === null &&
    house.lord?.villageId === found.village.id
      ? { baptizable: true as const }
      : {}),
  };
}

/**
 * Ves `villageId` hráče, když v ní smí vykonat `right`; jinak důvod česky (ves hráči nepatří,
 * „Rozhoduje …“, „Ves vede …“). Nahrazuje `findPlayerVillage` v akcích nad vsí.
 */
export async function requireRight(
  deps: RightsDeps,
  input: { playerId: string; villageId: string; right: VillageRight; today: number },
): Promise<PlayerVillage | string> {
  const access = await villageAccess(deps, input);
  if (!access) return NOT_PLAYER_VILLAGE;
  if (access.rights.allowed.has(input.right)) return access.found;
  return access.rights.reason ?? NOT_PLAYER_VILLAGE;
}
