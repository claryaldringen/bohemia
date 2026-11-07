import { TOTAL_GAME_DAYS, type WorldClock } from '../domain/calendar';
import type { Landscape } from '../domain/landscape';
import {
  armyStrength,
  campaignSupplies,
  foodDays,
  houseProtectedUntil,
  lineCandidates,
  lineManStrength,
  musterOf,
  protectedReason,
  protectionDaysLeft,
  villageProtected,
  villagerStrength,
  WAR,
  type CampaignPlace,
  type CampaignVillage,
  type SupplyPlan,
  type SurrenderOrder,
} from '../domain/war';
import { craftCoverage } from '../domain/village/crafts';
import { isLineMan } from '../domain/village/dynasty';
import { villageHorses } from '../domain/village/horses';
import { villageHappiness } from '../domain/village/happiness';
import { ageYears } from '../domain/village/people';
import { deriveSeed } from '../domain/landscape/random';
import { isVillageAbandoned, isVillageExtinct } from '../domain/village';
import type { Person, PersonRef, VillageState } from '../domain/village/types';
import { directionBetween, type GridCell } from '../domain/village/world-grid';
import type { House, HouseRepository } from './houses';
import { NO_HOUSE } from './negotiate';
import { houseName } from './negotiation-chronicle';
import { findPlayerVillage, NOT_PLAYER_VILLAGE, type PlayerVillage } from './player-villages';
import type { LandscapeSource, SettlementRepository } from './settlements';
import type { VillageRepository } from './villages';
import type { WarRepository } from './wars';

// Příprava tažení (war.md – Velení a příprava tažení; plán 2026-11-03 – Úloha 6.6): hráč v panelu
// Vojsko vybere velitele, zástupce, vsi rodu s muži a vesničany, shromaždiště, cíl a jídlo.
// `planCampaign` jen ověří a odhadne sílu a cestu; `launchCampaign` (launch-campaign.ts) tažení
// vyšle. Obojí používá jedno ověření (`prepareCampaign`), takže odhad a vyslání se neliší.

/** Plán tažení, jak ho posílá panel Vojsko. */
export interface CampaignPlan {
  commander: PersonRef;
  deputy: PersonRef | null;
  /** Vsi rodu a kdo z nich jde: muži rodu, přihlášení vesničané (dobrovolníci) a nucení. */
  villages: { villageId: string; lineMen: number[]; villagers: number[]; forced: number[] }[];
  assemblyVillageId: string;
  targetVillageId: string;
  /** Jedna skupina, nebo skupina na ves. */
  groups: 'together' | 'by-village';
  surrendered: SurrenderOrder;
  /** Jídlo (kg obilí) ze zásob shromaždiště. */
  food: number;
}

/** Odhad tažení pro panel (war.md – Co hráč vidí, panel Vojsko). */
export interface CampaignEstimate {
  /** Síla vojska (meč s číslem) – `armyStrength`. */
  strength: number;
  men: { line: number; volunteers: number; forced: number; total: number };
  /** Cesta ke cíli v herních dnech (vzdušnou čarou, ≈ 3,5 m/s). */
  travelDays: number;
  /** Na kolik dní vystačí jídlo. */
  foodDays: number;
  supplies: SupplyPlan;
  /** Velí hráčův muž – hráč vede živě. */
  liveCommand: boolean;
  /** Mezi rody neběží válka – útok je přepadení a válka začne jím. */
  ambush: boolean;
}

/** Dohoda, co se k tažení vybírá z vsi. */
export interface PreparedMan {
  person: Person;
  line: boolean;
  forced: boolean;
  mounted: boolean;
  kin: boolean;
  strength: number;
}

export interface PreparedVillage {
  player: PlayerVillage;
  landscape: Landscape;
  day: number;
  men: PreparedMan[];
}

/** Ověřený plán: vše, co k vyslání potřebuje `launchCampaign`. */
export interface PreparedCampaign {
  house: House;
  target: { record: PlayerVillage['village']; house: House; cell: GridCell };
  ambush: boolean;
  villages: PreparedVillage[];
  assembly: CampaignVillage;
  targetPlace: CampaignVillage;
  liveCommand: boolean;
  estimate: CampaignEstimate;
}

export interface PlanDeps {
  houses: Pick<HouseRepository, 'activeOf' | 'byId'>;
  wars: Pick<WarRepository, 'activeBetween' | 'ownAttackAt'>;
  villages: VillageRepository;
  settlements: SettlementRepository;
  landscapes: LandscapeSource;
  world: WorldClock;
}

const fail = (reason: string): string => reason;

export const CAMPAIGN_REASONS = {
  noMen: 'Do tažení musí jít aspoň jeden muž.',
  noCommander: 'Velitelem může být jen muž rodu od 16 let ze zvolených vsí.',
  noDeputy: 'Zástupcem může být jen jiný muž rodu od 16 let ze zvolených vsí.',
  badMan: 'Někdo z vybraných mužů už na tažení jít nemůže.',
  twice: 'Ves je v rozkazu dvakrát.',
  asleep: 'Ta ves zanikla.',
  sameHouse: 'Vlastní ves napadnout nejde.',
  noTargetHouse: 'Ta ves nemá rod, který by šel napadnout.',
  noFood: 'Ve shromaždišti není tolik obilí.',
  tooHeavy: 'Tolik jídla vojsko neunese.',
  badFood: 'Jídlo musí být nezáporné číslo.',
} as const;

/** Místa domovských vsí mužů tažení – po rozpadu jdou hloučky domů (war.md – Velení: Rozpad). */
export function homePlaces(prepared: PreparedCampaign): Record<string, CampaignPlace> {
  const homes: Record<string, CampaignPlace> = {};
  for (const v of prepared.villages) {
    const place = villagePlace(v.player.settlement, v.landscape);
    homes[v.player.village.id] = { cell: place.cell, pos: place.pos };
  }
  return homes;
}

/** Poloha vsi na mapě (m): střed políčka místa pro ves. */
function villagePlace(
  settlement: PlayerVillage['settlement'],
  l: Landscape,
): CampaignVillage & {
  extent: number;
} {
  const half = (l.size * l.cellSizeM) / 2;
  return {
    villageId: '',
    cell: settlement.worldCell ?? { x: 0, y: 0 },
    pos: {
      x: -half + (l.villageSite.x + 0.5) * l.cellSizeM,
      z: -half + (l.villageSite.y + 0.5) * l.cellSizeM,
    },
    extent: l.size * l.cellSizeM,
  };
}

/** Má muž blízké příbuzné v cílové vsi (příchozí ze sousední mapy v cíli: on, žena nebo rodiče). */
export function kinInTarget(
  state: Pick<VillageState, 'people'>,
  from: GridCell,
  to: GridCell,
): (p: Person) => boolean {
  const direction = directionBetween(from, to);
  if (direction === null) return () => false;
  const byId = new Map(state.people.map((q) => [q.id, q]));
  const there = (id: number | undefined): boolean =>
    id !== undefined && byId.get(id)?.origin === direction;
  return (p) =>
    p.origin === direction || there(p.spouseId) || there(p.motherId) || there(p.fatherId);
}

/** Seed náboru vsi: ze seedu vsi a cíle (los se mezi dotazy nemění). */
export function musterSeed(state: Pick<VillageState, 'seed'>, targetVillageId: string): number {
  return deriveSeed(state.seed, `muster:${targetVillageId}`);
}

/** Obilí ve shromaždišti, které smí vojsko vzít (bez osiva). */
function stockOf(state: VillageState): number {
  return Math.max(0, state.storesKg - (state.reservedSeedKg ?? 0));
}

const alive = (state: VillageState): boolean =>
  !isVillageExtinct(state) && !isVillageAbandoned(state);

/** Ověří plán a spočte odhad; text = důvod odmítnutí česky. */
export async function prepareCampaign(
  deps: PlanDeps,
  input: { playerId: string; plan: CampaignPlan; today: number; now: Date },
): Promise<PreparedCampaign | string> {
  const { plan } = input;
  const house = await deps.houses.activeOf(input.playerId);
  if (!house) return fail(NO_HOUSE);
  if (plan.villages.length === 0) return fail(CAMPAIGN_REASONS.noMen);
  if (!Number.isFinite(plan.food) || plan.food < 0) return fail(CAMPAIGN_REASONS.badFood);

  const target = await loadTarget(deps, house, plan.targetVillageId, input);
  if (typeof target === 'string') return target;

  const assemblyVillage = await findPlayerVillage(deps, {
    playerId: input.playerId,
    villageId: plan.assemblyVillageId,
  });
  if (!assemblyVillage) return fail(NOT_PLAYER_VILLAGE);
  if (!alive(assemblyVillage.village.state)) return fail(CAMPAIGN_REASONS.asleep);

  const seen = new Set<string>();
  const villages: PreparedVillage[] = [];
  for (const entry of plan.villages) {
    if (seen.has(entry.villageId)) return fail(CAMPAIGN_REASONS.twice);
    seen.add(entry.villageId);
    // jen vlastní vsi rodu – ves spravovaná cizí do `listActive` hráče nepatří
    const own = await findPlayerVillage(deps, {
      playerId: input.playerId,
      villageId: entry.villageId,
    });
    if (!own) return fail(NOT_PLAYER_VILLAGE);
    if (!alive(own.village.state)) return fail(CAMPAIGN_REASONS.asleep);
    const landscape = deps.landscapes.landscapeOf(
      own.settlement.landscapeSeed,
      own.settlement.layerVersions,
    );
    const men = chooseMen(
      own.village.state,
      own.settlement.worldCell ?? { x: 0, y: 0 },
      target.cell,
      entry,
      plan,
    );
    if (typeof men === 'string') return men;
    villages.push({ player: own, landscape, day: own.village.state.lastDay, men });
  }

  const commander = findMan(villages, plan.commander);
  if (!commander || !commander.line) return fail(CAMPAIGN_REASONS.noCommander);
  if (plan.deputy) {
    const deputy = findMan(villages, plan.deputy);
    const same =
      plan.deputy.villageId === plan.commander.villageId &&
      plan.deputy.personId === plan.commander.personId;
    if (!deputy || !deputy.line || same) return fail(CAMPAIGN_REASONS.noDeputy);
  }
  const total = villages.reduce((n, v) => n + v.men.length, 0);
  if (total === 0) return fail(CAMPAIGN_REASONS.noMen);

  const assemblyLandscape = deps.landscapes.landscapeOf(
    assemblyVillage.settlement.landscapeSeed,
    assemblyVillage.settlement.layerVersions,
  );
  const assemblyPlace = villagePlace(assemblyVillage.settlement, assemblyLandscape);
  const targetPlace = villagePlace(target.settlement, target.landscape);
  const assembly: CampaignVillage = {
    villageId: assemblyVillage.village.id,
    name: assemblyVillage.village.name,
    cell: assemblyPlace.cell,
    pos: assemblyPlace.pos,
  };
  const targetVillage: CampaignVillage = {
    villageId: target.record.id,
    name: target.record.name,
    cell: targetPlace.cell,
    pos: targetPlace.pos,
  };

  if (plan.food > stockOf(assemblyVillage.village.state)) return fail(CAMPAIGN_REASONS.noFood);
  const supplies = campaignSupplies(total, 0, 0, 0);
  if (plan.food > supplies.carryKg) return fail(CAMPAIGN_REASONS.tooHeavy);

  const travelDays = travelDaysOf(assembly, targetVillage, assemblyPlace.extent, deps.world);
  const lord = house.lord;
  const liveCommand =
    lord !== null &&
    lord.villageId === plan.commander.villageId &&
    lord.personId === plan.commander.personId;
  const strength = villages.reduce((sum, v) => {
    const coverage = craftCoverage(v.player.village.state, v.day).tools;
    return (
      sum +
      armyStrength(
        v.men.map((m) => m.strength),
        coverage,
      )
    );
  }, 0);
  const estimate: CampaignEstimate = {
    strength,
    men: {
      line: villages.reduce((n, v) => n + v.men.filter((m) => m.line).length, 0),
      volunteers: villages.reduce(
        (n, v) => n + v.men.filter((m) => !m.line && !m.forced).length,
        0,
      ),
      forced: villages.reduce((n, v) => n + v.men.filter((m) => m.forced).length, 0),
      total,
    },
    travelDays,
    foodDays: foodDays(plan.food, total),
    supplies: campaignSupplies(total, 0, 0, Math.ceil(travelDays * 2)),
    liveCommand,
    ambush: target.ambush,
  };
  return {
    house,
    target: { record: target.record, house: target.house, cell: target.cell },
    ambush: target.ambush,
    villages,
    assembly,
    targetPlace: targetVillage,
    liveCommand,
    estimate,
  };
}

/** Cesta vzdušnou čarou v herních dnech: metry ÷ tempo vojska ÷ sekundy herního dne. */
function travelDaysOf(
  from: CampaignVillage,
  to: CampaignVillage,
  extent: number,
  world: WorldClock,
): number {
  const dx = (to.cell.x - from.cell.x) * extent + (to.pos.x - from.pos.x);
  const dz = (to.cell.y - from.cell.y) * extent + (to.pos.z - from.pos.z);
  const meters = Math.sqrt(dx * dx + dz * dz);
  const secondsPerDay = (world.endMs - world.startMs) / 1000 / TOTAL_GAME_DAYS;
  return meters / WAR.pace.metersPerSecond / secondsPerDay;
}

/** Cílová ves: existuje, žije, patří cizímu rodu a rod ani ves nejsou v ochraně. */
async function loadTarget(
  deps: PlanDeps,
  own: House,
  villageId: string,
  input: { today: number; now: Date },
): Promise<
  | string
  | {
      record: PlayerVillage['village'];
      settlement: PlayerVillage['settlement'];
      house: House;
      cell: GridCell;
      landscape: Landscape;
      ambush: boolean;
    }
> {
  const record = await deps.villages.find(villageId);
  if (!record) return fail(CAMPAIGN_REASONS.asleep);
  const settlement = await deps.settlements.find(record.settlementId);
  if (!settlement || !alive(record.state)) return fail(CAMPAIGN_REASONS.asleep);
  const house = await deps.houses.activeOf(settlement.ownerId);
  if (!house) return fail(CAMPAIGN_REASONS.noTargetHouse);
  if (house.id === own.id) return fail(CAMPAIGN_REASONS.sameHouse);
  const name = await houseName({ villages: deps.villages }, house);
  if (villageProtected(record.state, input.today)) {
    return fail(`${name} má novou ves pod ochranou.`);
  }
  const war = await deps.wars.activeBetween(own.id, house.id);
  if (!war) {
    const left = protectionDaysLeft(
      houseProtectedUntil(house, await deps.wars.ownAttackAt(house.id)),
      input.now,
    );
    if (left > 0) return fail(protectedReason(name, left));
  }
  return {
    record,
    settlement,
    house,
    cell: settlement.worldCell ?? { x: 0, y: 0 },
    landscape: deps.landscapes.landscapeOf(settlement.landscapeSeed, settlement.layerVersions),
    ambush: war === null,
  };
}

function findMan(villages: readonly PreparedVillage[], ref: PersonRef): PreparedMan | null {
  const village = villages.find((v) => v.player.village.id === ref.villageId);
  return village?.men.find((m) => m.person.id === ref.personId) ?? null;
}

/**
 * Vybrané muže jedné vsi: muži rodu (od 16 let), přihlášení vesničané (dobrovolníci z `musterOf`)
 * a nucení (ostatní způsobilí). Kdo není způsobilý, plán se odmítne.
 */
function chooseMen(
  state: VillageState,
  from: GridCell,
  to: GridCell,
  entry: CampaignPlan['villages'][number],
  plan: CampaignPlan,
): PreparedMan[] | string {
  const day = state.lastDay;
  const kin = kinInTarget(state, from, to);
  const muster = musterOf(state, day, kin, musterSeed(state, plan.targetVillageId));
  const fitLine = new Map(lineCandidates(state, day).map((p) => [p.id, p]));
  const fitVillagers = new Map(
    state.people
      .filter((p) => muster.volunteers.includes(p.id) || muster.others.includes(p.id))
      .map((p) => [p.id, p]),
  );
  const horses = new Map(
    villageHorses(state).flatMap((h) => (h.riderId === undefined ? [] : [[h.riderId, h] as const])),
  );
  const happiness = villageHappiness(state);
  const out: PreparedMan[] = [];
  const taken = new Set<number>();
  const take = (id: number): boolean => {
    if (taken.has(id)) return false;
    taken.add(id);
    return true;
  };
  for (const id of entry.lineMen) {
    const person = fitLine.get(id);
    if (
      !person ||
      !isLineMan(person) ||
      ageYears(person.bornDay, day) < WAR.army.minAge ||
      !take(id)
    ) {
      return fail(CAMPAIGN_REASONS.badMan);
    }
    const horse = horses.get(id) ?? null;
    out.push({
      person,
      line: true,
      forced: false,
      mounted: horse !== null,
      kin: kin(person),
      strength: lineManStrength(person, horse),
    });
  }
  for (const id of entry.villagers) {
    const person = fitVillagers.get(id);
    if (!person || !muster.volunteers.includes(id) || !take(id))
      return fail(CAMPAIGN_REASONS.badMan);
    out.push({
      person,
      line: false,
      forced: false,
      mounted: false,
      kin: false,
      strength: villagerStrength(false, happiness),
    });
  }
  for (const id of entry.forced) {
    const person = fitVillagers.get(id);
    if (!person || !muster.others.includes(id) || !take(id)) return fail(CAMPAIGN_REASONS.badMan);
    const withKin = kin(person);
    const base = villagerStrength(true, happiness);
    out.push({
      person,
      line: false,
      forced: true,
      mounted: false,
      kin: withKin,
      strength: withKin
        ? (base * WAR.strength.forcedWithKinFactor) / WAR.strength.forcedFactor
        : base,
    });
  }
  return out;
}

/**
 * Odhad tažení pro panel: ověří plán (velitel, vsi jen vlastního rodu, cíl mimo ochranu, jídlo)
 * a spočte sílu (`armyStrength`), cestu a zásoby; jinak důvod odmítnutí česky.
 */
export async function planCampaign(
  deps: PlanDeps,
  input: { playerId: string; plan: CampaignPlan; today: number; now: Date },
): Promise<CampaignEstimate | string> {
  const prepared = await prepareCampaign(deps, input);
  return typeof prepared === 'string' ? prepared : prepared.estimate;
}
