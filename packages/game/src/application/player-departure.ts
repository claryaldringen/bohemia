import { deriveSeed } from '../domain/landscape/random';
import { stewardDirections, type Direction8 } from '../domain/village';
import { appointLords } from './appoint-lord';
import { settlementLandscape } from './enter-game';
import type { HouseRepository, PendingDeparture } from './houses';
import {
  FOREIGN_MAP_THERE,
  NO_DRY_MAP_THERE,
  OWN_MAP_THERE,
  leaveVillage,
  type LeaveVillageDeps,
  type LeaveVillageResult,
} from './leave-village';
import { findPlayerVillage } from './player-villages';
import { resolveSuccessionOf, type PlayerSuccessionOutcome } from './player-succession';
import type { DynastyDeps } from './restart-game';
import type { SeedSource } from './settlements';

// Odchod mladšího syna po pohřbu (seniorate.md – Nástupnictví hráče, bod 4): los padl na mladšího
// syna, hráč v jeho kůži má `PLAYER_SUCCESSION.departDays` dní na volbu směru. Zvolí-li, výprava
// vyrazí hned se správcem na cestě vypnutým (první zemnici umístí hráč); nezvolí-li, vyrazí sama
// směrem, který by zvolil správce, se zapnutým správcem. Mateřská ves zůstane s nástupcem jako
// NPC vojvodou a správcem (`leaveVillage` s `afterFuneral`). Čekající odchod je `house.pending_departure`.

export interface PlayerDepartureDeps extends Omit<LeaveVillageDeps, 'houses' | 'seeds'> {
  houses: Pick<HouseRepository, 'activeOf' | 'setLord' | 'clearPendingDeparture'>;
}

/** Závislosti volby hráče – seedy nové vsi dává server. */
export interface ChoosePlayerDepartureDeps extends PlayerDepartureDeps {
  seeds: SeedSource;
}

/** Hráč nečeká na volbu odchodu. */
export const NO_PENDING_DEPARTURE = 'Nic nečeká na volbu odchodu.';
/** Lhůta na volbu směru uplynula – výprava vyrazí sama. */
export const DEPARTURE_DEADLINE_PASSED = 'Lhůta na volbu směru uplynula.';

export type PlayerDepartureResult =
  Extract<LeaveVillageResult, { ok: true }> | { ok: false; reason: string };

/** Je lhůta ještě otevřená? Poslední den lhůty (`deadlineDay`) už vyráží výprava sama. */
const departureOpen = (pending: PendingDeparture, today: number): boolean =>
  today < pending.deadlineDay;

/**
 * Hráč ve lhůtě zvolí směr: výprava vyrazí hned (díl, lidé, jídlo, osivo, stáda, vůz, kůň jako
 * odchod syna), správce na cestě vypnutý; syn bez jména dostane `sonName`. Po úspěchu se čekající
 * odchod smaže podmíněným příkazem – opakované volání nic nezdvojí (syn už ve vsi není). Důvod
 * odmítnutí (cizí mapa tím směrem, chybějící jméno…) čekající odchod ponechá. Volající drží zámek hráče.
 */
export async function choosePlayerDeparture(
  deps: ChoosePlayerDepartureDeps,
  input: {
    playerId: string;
    /** Ves, ve které hráč jedná – odchod patří jen k vsi, kde syn žije. */
    villageId: string;
    direction: Direction8;
    sonName?: string;
    today: number;
  },
): Promise<PlayerDepartureResult> {
  const house = await deps.houses.activeOf(input.playerId);
  const pending = house?.pendingDeparture;
  if (!house || !pending || pending.villageId !== input.villageId) {
    return { ok: false, reason: NO_PENDING_DEPARTURE };
  }
  if (!departureOpen(pending, input.today)) return { ok: false, reason: DEPARTURE_DEADLINE_PASSED };
  const result = await leaveVillage(deps, {
    playerId: input.playerId,
    villageId: pending.villageId,
    today: input.today,
    destination: { kind: 'map', direction: input.direction },
    sonId: pending.sonId,
    afterFuneral: {
      ...(input.sonName === undefined ? {} : { name: input.sonName }),
      stewardOnTheWay: false,
    },
  });
  if (result.ok) await deps.houses.clearPendingDeparture(house.id, pending.sonId);
  return result;
}

/**
 * Zdroj seedů z jednoho základu: n-tý seed je `deriveSeed(základ, 'player-departure:n')` – výprava
 * po lhůtě tak nezávisí na tom, kdy se ves dopočte ani na `SeedSource` serveru.
 */
function derivedSeeds(base: number): SeedSource {
  let n = 0;
  return { nextSeed: (): number => deriveSeed(base, `player-departure:${n++}`) };
}

/**
 * Lhůta uplynula (`today >= deadlineDay`) a hráč nezvolil: výprava vyrazí sama směrem, který by
 * zvolil správce (`stewardDirections` – nejdřív s hotovou stezkou, pak nejkratší cesta ke kraji;
 * směr s vlastní vsí nebo cizí mapou přeskočí), syn bez jména dostane vygenerované
 * (`generatedLineName`), správce na cestě je zapnutý (po příjezdu umístí zemnici sám). Vrací
 * výsledek odchodu, nebo null – nic nečekalo, lhůta běží, nebo se nikam nedá jít (odchod čeká na další
 * volání). Pending po zániku vsi či syna se smaže. Volající drží zámek hráče.
 */
export async function autoPlayerDeparture(
  deps: PlayerDepartureDeps,
  input: { playerId: string; today: number },
): Promise<PlayerDepartureResult | null> {
  const house = await deps.houses.activeOf(input.playerId);
  const pending = house?.pendingDeparture;
  if (!house || !pending || departureOpen(pending, input.today)) return null;
  const found = await findPlayerVillage(deps, {
    playerId: input.playerId,
    villageId: pending.villageId,
  });
  const son = found?.village.state.people.find((p) => p.id === pending.sonId);
  if (!found || !son) {
    // ves ani syn už nejsou – nástupnictví (smrt syna) rozhodne znovu a zapíše nový odchod
    await deps.houses.clearPendingDeparture(house.id, pending.sonId);
    return null;
  }
  const landscape = settlementLandscape(found.settlement, deps.landscapes);
  const seeds = derivedSeeds(deriveSeed(found.village.state.seed, `departure:${pending.deathDay}`));
  let last: PlayerDepartureResult | null = null;
  for (const { direction } of stewardDirections(found.village.state, landscape)) {
    const result = await leaveVillage(
      { ...deps, seeds },
      {
        playerId: input.playerId,
        villageId: pending.villageId,
        today: input.today,
        destination: { kind: 'map', direction },
        sonId: pending.sonId,
        afterFuneral: { generateName: true, stewardOnTheWay: true },
      },
    );
    last = result;
    if (result.ok) {
      await deps.houses.clearPendingDeparture(house.id, pending.sonId);
      return result;
    }
    // vlastní ves či cizí mapa tím směrem, nebo řeka kostry a v dosahu nic bez ní – zkusit další;
    // jiný důvod platí pro všechny směry
    const tryNext = [OWN_MAP_THERE, FOREIGN_MAP_THERE, NO_DRY_MAP_THERE];
    if (!tryNext.includes(result.reason)) break;
  }
  return last;
}

/**
 * Nástupnictví hráče (`resolveSuccessionOf`), hned za ním odchod mladšího syna, jehož lhůta
 * uplynula (`autoPlayerDeparture`) a dosazení vojvody do vsí bez muže rodu (`appointLords`) – volá ho web (`dynastyForVillage`, `advanceDynasty`) i worker
 * (`closeAtDay`) na jednom místě. Bez rodů se nic neděje. Volající drží zámek hráče.
 */
export async function settleSuccessionOf(
  deps: DynastyDeps & { worldSeed: number },
  input: { playerId: string; today: number },
): Promise<PlayerSuccessionOutcome> {
  const outcome = await resolveSuccessionOf(deps, input);
  if (deps.houses) {
    await autoPlayerDeparture(
      {
        settlements: deps.settlements,
        villages: deps.villages,
        worldSeed: deps.worldSeed,
        ...(deps.landscapes ? { landscapes: deps.landscapes } : {}),
        houses: deps.houses,
      },
      input,
    );
    // ves, která zůstala bez muže rodu, dostane vojvodu z jiné vsi rodu (seniorate.md)
    await appointLords(
      { settlements: deps.settlements, villages: deps.villages, houses: deps.houses },
      input,
    );
  }
  return outcome;
}
