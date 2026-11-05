import { pendingStewardDepartures } from '../domain/village';
import { settlementLandscape } from './enter-game';
import { loadVillage } from './load-village';
import type { PlayerLock } from './locks';
import { settleSuccessionOf } from './player-departure';
import { closeDynastyDay, type DynastyDeps } from './restart-game';
import { settleStewardDeparturesSafely } from './settle-steward-departures';
import type { Settlement } from './settlements';
import type { VillageRecord, VillageStamp } from './villages';
import type { WorldQueue } from './world-queue';

// Krok světa (docs/superpowers/plans/2026-10-31-worker.md – 1. Co worker dělá): worker posouvá vsi
// hráčů nejvíc pozadu po dávkách do jejich dneška, i když nikdo není online. Zámek hráče jen
// zkouší (`tryRun`) – když ho drží web (hráč právě jedná), hráče přeskočí; web si stejně dopočte,
// co potřebuje. Výsledek jedné vsi na dávkách nezávisí (determinismus „po kouscích“); to platí
// pro ves, která je na mapě sama. Na mapě s víc vsemi vidí ves při dávce sousedy tak staré, jak
// jsou uložení (až `stepDays` dní starší než ona; ves počítaná po sousedovi vidí souseda dál než
// sebe) – stejně jako dřív, kdy soused byl tak starý, jak dávno hráč hrál. Výjimka z „po kouscích“:
// konec rodu zjišťuje `closeDynastyDay` ke dni dávky, ne ke dni hráče.

/**
 * Nejvýš o tolik herních dní posune worker vsi hráče v jedné dávce (plán – 1. Co worker dělá:
 * 10 dní ≈ 0,2 s Vlkova) – zámek hráče tak drží nejvýš jednu dávku jedné vsi. Není to herní
 * pravidlo (výsledek vsi na dávkách nezávisí), jen mez práce – proto ne v `rules*.ts`.
 */
export const WORLD_STEP_DAYS = 10;

export interface AdvancePlayerDeps extends DynastyDeps {
  /** Seed světa – krajina nového sídla ze schránky správce se odvodí z jeho políčka. */
  worldSeed: number;
  locks: PlayerLock;
  /** Hodiny jen pro statistiku (ms, např. `performance.now`) – výsledek neovlivní; bez nich 0. */
  now?: () => number;
}

export interface AdvancePlayerInput {
  playerId: string;
  /** Dnešní den hráče (`playerDay` – den světa + posun) – dál se nepočítá nikdy. */
  today: number;
  /** Nejvýš o tolik dní za dávku (`WORLD_STEP_DAYS`). */
  stepDays: number;
}

/**
 * `done` – dávka hráče doběhla; `busy` – zámek hráče držel někdo jiný (web), hráč se přeskočil
 * (posunuté vsi zůstanou posunuté); `failed` – chyba (`error`).
 */
export type PlayerStepOutcome = 'done' | 'busy' | 'failed';

/** Co dávka hráče udělala. */
export interface PlayerStep {
  playerId: string;
  outcome: PlayerStepOutcome;
  /** Cílový den dávky: `min(dnešek, nejstarší lastDay nespící vsi + stepDays)`. */
  targetDay: number;
  /** Kolik vsí se posunulo. */
  villages: number;
  /** Součet posunutých herních dní přes vsi. */
  days: number;
  /** Kolik nových vsí vzniklo ze schránek správce (dopočte je další kolo). */
  founded: number;
  /** Hra hráče skončila (vymřel rod nebo všechny vsi) – zjištěno po dávce. */
  gameOver: boolean;
  /** Jak dlouho dávka trvala (ms, z `deps.now`). */
  ms: number;
  /** Jen u `failed`: ves, u které chyba nastala (null – mimo ves), a chyba. */
  error?: { villageId: string | null; cause: unknown };
}

/**
 * Dávka jednoho hráče: cílový den `T = min(dnešek, nejstarší lastDay + stepDays)`; každá nespící
 * ves aktivního sídla s `lastDay < T` (v pořadí jako `dynastyStatus`) se zvlášť pod zámkem hráče
 * (`tryRun`) dopočte do `T` (`loadVillage` – s přestávkami `pause`) a vybaví se její odchozí
 * schránky správce (`settleStewardDeparturesSafely` – nová ves syna vznikne v den odchodu a je
 * pozadu, vezme ji další kolo). Ves na cestě se posouvá jako každá jiná – se správcem ji založí
 * simulace v den příjezdu, bez něj čeká na hráče. Když se něco posunulo, jedno závěrečné držení
 * zjistí konec rodu (`closeDynastyDay` v den `T`) – jen když jsou všechny nespící vsi právě na `T`;
 * ze smíšených dnů (web mezitím posunul ves, nová ves ze schránky) by mohl vyjít falešný konec
 * rodu, a tak se ověří po další dávce (nejpozději na dnešku). Spící vsi se nepočítají vůbec.
 */
export async function advancePlayer(
  deps: AdvancePlayerDeps,
  input: AdvancePlayerInput,
): Promise<PlayerStep> {
  const started = deps.now?.() ?? 0;
  const step: PlayerStep = {
    playerId: input.playerId,
    outcome: 'done',
    targetDay: input.today,
    villages: 0,
    days: 0,
    founded: 0,
    gameOver: false,
    ms: 0,
  };
  const finish = (): PlayerStep => ({ ...step, ms: (deps.now?.() ?? 0) - started });
  let villageId: string | null = null;
  try {
    const { settlements, stamps } = await stampsOfPlayer(deps, input.playerId);
    const awake = stamps.filter((s) => !s.asleep);
    const oldest = Math.min(input.today, ...awake.map((s) => s.lastDay));
    const target = Math.min(input.today, oldest + input.stepDays);
    step.targetDay = target;
    // záznamy dopočtené v této dávce – závěrečné zjištění konce rodu je nenačítá znovu
    const advanced = new Map<string, VillageRecord>();
    let failure: { villageId: string; cause: unknown } | null = null;
    for (const stamp of awake) {
      if (stamp.lastDay >= target) continue;
      villageId = stamp.id;
      try {
        const settlement = settlements.find((s) => s.id === stamp.settlementId);
        if (!settlement) continue;
        const landscape = settlementLandscape(settlement, deps.landscapes);
        const held = await deps.locks.tryRun(input.playerId, async () => {
          const village = await loadVillage(deps, {
            villageId: stamp.id,
            today: target,
            landscape,
          });
          if (!village || pendingStewardDepartures(village.state).length === 0) {
            return { village, founded: 0 };
          }
          const founded = await settleStewardDeparturesSafely(deps, {
            playerId: input.playerId,
            villageId: stamp.id,
          });
          return { village, founded: founded.length };
        });
        if (!held.ran) {
          step.outcome = 'busy';
          return finish();
        }
        const { village, founded } = held.value;
        if (!village) continue; // ves mezitím zmizela (restart hry)
        advanced.set(village.id, village);
        step.villages++;
        step.days += Math.max(0, village.state.lastDay - stamp.lastDay);
        step.founded += founded;
      } catch (error) {
        // chyba jedné vsi nezastaví ostatní vsi hráče (výsledek vsí na pořadí nezávisí) – hráč
        // se označí `failed` na konci, první chyba se zapíše
        failure ??= { villageId: stamp.id, cause: error };
      }
    }
    if (failure) {
      step.outcome = 'failed';
      step.error = failure;
      return finish();
    }
    villageId = null;
    if (advanced.size === 0) return finish();
    const closed = await deps.locks.tryRun(input.playerId, () =>
      closeAtDay(deps, input.playerId, target, advanced),
    );
    if (!closed.ran) step.outcome = 'busy';
    else step.gameOver = closed.value?.gameOver ?? false;
  } catch (error) {
    step.outcome = 'failed';
    step.error = { villageId, cause: error };
  }
  return finish();
}

/**
 * Konec rodu v den `target`, když jsou všechny nespící vsi hráče právě na něm (jinak null).
 * Záznamy z dávky (`advanced`) se použijí, dokud se jejich verze nezměnila; ostatní se načtou.
 */
async function closeAtDay(
  deps: AdvancePlayerDeps,
  playerId: string,
  target: number,
  advanced: ReadonlyMap<string, VillageRecord>,
): Promise<{ gameOver: boolean } | null> {
  const { settlements, stamps } = await stampsOfPlayer(deps, playerId);
  if (stamps.some((s) => !s.asleep && s.lastDay !== target)) return null;
  const villages: VillageRecord[] = [];
  for (const stamp of stamps) {
    const known = advanced.get(stamp.id);
    const village = known?.version === stamp.version ? known : await deps.villages.find(stamp.id);
    if (village) villages.push(village);
  }
  const status = await closeDynastyDay(deps, { settlements, villages, today: target });
  if (!status.gameOver) await settleSuccessionOf(deps, { playerId, today: target });
  return { gameOver: status.gameOver };
}

/** Aktivní sídla hráče a otisky jejich vsí v pořadí jako `dynastyStatus` (sídelní první). */
async function stampsOfPlayer(
  deps: DynastyDeps,
  playerId: string,
): Promise<{ settlements: Settlement[]; stamps: VillageStamp[] }> {
  const settlements = await deps.settlements.listActive(playerId);
  const all = await deps.villages.stampsOf(settlements.map((s) => s.id));
  const stamps = settlements.flatMap((s) => all.filter((v) => v.settlementId === s.id));
  return { settlements, stamps };
}

export interface WorldStepDeps extends AdvancePlayerDeps {
  queue: WorldQueue;
}

export interface WorldStepInput {
  /** Dnešní herní den světa (z hodin – `currentWorld`); dnešek hráče přidá fronta. */
  worldDay: number;
  /** Nejvýš o tolik dní za dávku hráče (`WORLD_STEP_DAYS`). */
  stepDays: number;
  /** Nejvýš tolik hráčů za kolo. */
  limit: number;
  /**
   * Hráči s odkladem (zámek držel web – 2 s, chyba – 1 až 15 min), kteří se v tomto kole
   * přeskočí. Odklady drží volající (worker) v mapě se svými hodinami – use-case hodiny nezná.
   */
  skip?: ReadonlySet<string>;
  /** Vrátí true, když se má kolo ukončit (signál workeru) – kontroluje se mezi hráči. */
  shouldStop?: () => boolean;
}

/** Souhrn kola. */
export interface WorldStep {
  /** Dávky hráčů v pořadí fronty (nejvíc pozadu první). */
  players: PlayerStep[];
  /** Kolik vsí se posunulo a o kolik dní celkem. */
  villages: number;
  days: number;
  /**
   * Nikdo (kromě odložených) nebyl pozadu – další práce přibude nejdřív s dalším herním dnem
   * (nebo posunem času hráče, novou vsí); jinak worker pokračuje hned dalším kolem.
   */
  idle: boolean;
}

/**
 * Kolo workeru: z fronty (`WorldQueue.behind` – nejvíc pozadu první) vezme nejvýš `limit` hráčů
 * bez odkladu a každému posune vsi o dávku (`advancePlayer`). Chyba u jednoho hráče ostatní
 * nezastaví – vrátí se v jeho `PlayerStep` (`failed`). Celý worker bez procesu kolem.
 */
export async function advanceWorldStep(
  deps: WorldStepDeps,
  input: WorldStepInput,
): Promise<WorldStep> {
  const skip = input.skip ?? new Set<string>();
  const queue = await deps.queue.behind(input.worldDay, input.limit + skip.size);
  const due = queue.filter((p) => !skip.has(p.playerId)).slice(0, input.limit);
  const players: PlayerStep[] = [];
  for (const player of due) {
    if (input.shouldStop?.()) break;
    players.push(
      await advancePlayer(deps, {
        playerId: player.playerId,
        today: player.today,
        stepDays: input.stepDays,
      }),
    );
  }
  return {
    players,
    villages: players.reduce((sum, p) => sum + p.villages, 0),
    days: players.reduce((sum, p) => sum + p.days, 0),
    idle: due.length === 0,
  };
}
