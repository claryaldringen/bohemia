import {
  currentLord,
  dynastySenior,
  isVillageAbandoned,
  isVillageExtinct,
  type VillageState,
} from '../domain/village';
import type { HouseRepository, PersonRef } from './houses';
import { findPlayerVillage, NOT_PLAYER_VILLAGE, type PlayerVillage } from './player-villages';
import type { SettlementRepository } from './settlements';
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
  placeWorkshop: 'build',
  placePen: 'build',
  upgradeRoad: 'build',
  buildWagonRoad: 'build',
  plantRoadApples: 'build',
  buildTrail: 'build',
  cancelConstruction: 'build',
  // první zemnice nové vsi po příchodu lidí – stavba
  settleJourney: 'build',
  relocateHousehold: 'evacuate',
  // odchod domácností (i celé vsi) na novou mapu
  leaveHouseholds: 'evacuate',
  leaveWithSon: 'sendSons',
  nameLineMan: 'nameSons',
  setSteward: 'steward',
  // řízení vsi, které senior v cizí vsi nemá: lov, jméno vsi, vývojové pohromy
  declareHunt: 'steward',
  renameVillage: 'steward',
  forceDevDisaster: 'steward',
  sendExpedition: 'trade',
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
}

/** Ves hráče s právy, která v ní má, a naposledy zapsaný senior rodu (pro stolec v přepínači). */
export interface VillageAccess {
  found: PlayerVillage;
  rights: VillageRights;
  senior: PersonRef | null;
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
  if (!found) return null;
  const house = await deps.houses.activeOf(input.playerId);
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
  return { found, rights, senior: house?.senior ?? null };
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
