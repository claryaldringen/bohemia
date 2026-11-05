import type { Landscape } from '../domain/landscape';
import {
  abandonForLineEnd,
  isGameOver,
  isLineExtinct,
  isVillageDormant,
  lineEndDay,
} from '../domain/village';
import type { HouseRepository } from './houses';
import type { NoticeRepository } from './notices';
import type { SuccessionCreditRepository } from './succession-credits';
import { enterGame, settlementLandscape, type EnterGameDeps } from './enter-game';
import { loadVillage } from './load-village';
import { updateVillage } from './update-village';
import type { LandscapeSource, Settlement, SettlementRepository } from './settlements';
import type {
  Pause,
  ProgressReport,
  VillageRecord,
  VillageRepository,
  VillageStamp,
} from './villages';

// Konec hry a nový začátek (population.md – Hlad a vymření; Martin, 18. 10. 2026: „když hráči
// vymřou všechny vesnice, tak pro něj hra končí – musí začínat znovu“).

export interface DynastyDeps {
  settlements: SettlementRepository;
  villages: VillageRepository;
  /** Krajina uloženého sídla – bez ní se pokaždé vygeneruje znovu. */
  landscapes?: LandscapeSource;
  /** Přestávky v dlouhém dopočtu vsí (server) – bez nich se dopočítá vcelku. */
  pause?: Pause;
  /** Hlášení průběhu dopočtu vsí rodu (přeskok času) – na výsledek nemá vliv. */
  onProgress?: ProgressReport;
  /** Rody – hráčův muž odejde-li na novou mapu, jeho ves se přepíše (`followPlayerLord`). */
  houses?: Pick<HouseRepository, 'activeOf' | 'setLord' | 'setSenior' | 'commitSuccession'>;
  /** Upozornění mezi hráči a kredity – s rody dovolují nástupnictví hráče po smrti jeho muže. */
  notices?: NoticeRepository;
  successionCredits?: Pick<SuccessionCreditRepository, 'unused' | 'consumeOne'>;
}

export interface DynastyInput {
  playerId: string;
  /** Dnešní herní den (index dne). */
  today: number;
}

/** Vsi hráče dopočítané do dneška a jestli pro něj hra skončila. */
export interface DynastyStatus {
  /** Aktivní sídla hráče. */
  settlements: Settlement[];
  /** Všechny vsi aktivních sídel (sídelní první, pak podle založení), dopočítané do dneška. */
  villages: VillageRecord[];
  /** Hráč má vsi a žádná nežije. */
  gameOver: boolean;
}

/**
 * Stav rodu hráče: všechny vsi jeho aktivních sídel (sídelní první, na každém sídle v pořadí
 * založení – migration.md, Víc vsí jednoho hráče) dopočítané do dneška (dopočet se uloží – ves
 * mohla mezitím vymřít). Hra končí, až vymřou všechny, nebo vymře rod po meči (lord.md – Konec
 * rodu) – pak každá ves, která ještě žije, zanikne ode dne konce rodu (`abandonForLineEnd`)
 * a uloží se; dál se nedopočítává.
 */
export async function dynastyStatus(
  deps: DynastyDeps,
  input: DynastyInput,
): Promise<DynastyStatus> {
  const settlements = await deps.settlements.listActive(input.playerId);
  const villages: VillageRecord[] = [];
  // jen id vsí (levný dotaz bez stavu) – stav načte a dopočítá až `loadVillage`, jednou
  const stamps = await deps.villages.stampsOf(settlements.map((s) => s.id));
  const progress = deps.onProgress && progressOf(stamps, input.today, deps.onProgress);
  for (const settlement of settlements) {
    const landscape = settlementLandscape(settlement, deps.landscapes);
    for (const stored of stamps.filter((v) => v.settlementId === settlement.id)) {
      const village = await loadVillage(
        progress ? { ...deps, pause: progress.pauseFor(stored, deps.pause) } : deps,
        { villageId: stored.id, today: input.today, landscape },
      );
      progress?.finished(stored);
      if (village) villages.push(village);
    }
  }
  return closeDynastyDay(deps, { settlements, villages, today: input.today });
}

/**
 * Průběh dopočtu vsí rodu (`onProgress` – accounts.md, Průběh přeskoku): celkem jsou dny, které
 * vsím do dneška chybí (spící ves se nedopočítává – 0), hotovo = dny dopočítaných vsí + den, kam
 * došla počítaná ves. Den počítané vsi se dozví z přestávek (`Pause` dostane odsimulovaný den),
 * proto má počítaná ves přestávky vždy (bez `pause` jen hlášení) – výsledek je týž jako bez nich.
 * Hlášené hotovo jen roste a nepřeleze celek (opakovaný pokus `updateVillage` po souběhu začne
 * od čerstvé verze), po každém dni nejvýš jedno hlášení.
 */
function progressOf(
  stamps: readonly VillageStamp[],
  today: number,
  report: ProgressReport,
): {
  pauseFor: (stamp: VillageStamp, pause: Pause | undefined) => Pause;
  finished: (stamp: VillageStamp) => void;
} {
  const missing = (stamp: VillageStamp): number =>
    stamp.asleep ? 0 : Math.max(0, today - stamp.lastDay);
  const totalDays = stamps.reduce((sum, stamp) => sum + missing(stamp), 0);
  // dny vsí, které už jsou dopočítané
  let finishedDays = 0;
  let doneDays = 0;
  const advance = (days: number): void => {
    if (days <= doneDays) return;
    doneDays = Math.min(days, totalDays);
    report({ doneDays, totalDays });
  };
  report({ doneDays, totalDays });
  return {
    pauseFor: (stamp, pause) => (day) => {
      if (day !== undefined) {
        advance(finishedDays + Math.min(missing(stamp), Math.max(0, day - stamp.lastDay)));
      }
      return pause?.(day) ?? null;
    },
    finished: (stamp) => {
      finishedDays += missing(stamp);
      advance(finishedDays);
    },
  };
}

/**
 * Konec rodu (lord.md – Konec rodu) nad vsemi hráče, které už jsou dopočítané do dneška `today`:
 * když vymřel rod po meči (`isLineExtinct`), každá ves, která ještě žije, zanikne ode dne konce
 * rodu (`abandonForLineEnd`) a uloží se. Vrací stav rodu jako `dynastyStatus`; `villages` jsou
 * výsledné záznamy. Samostatně ho volá i worker po dopočtu všech vsí hráče.
 */
export async function closeDynastyDay(
  deps: DynastyDeps,
  input: { settlements: Settlement[]; villages: VillageRecord[]; today: number },
): Promise<DynastyStatus> {
  const { settlements, today } = input;
  const villages = [...input.villages];
  const states = villages.map((v) => v.state);
  const endDay = isLineExtinct(states) ? lineEndDay(states) : undefined;
  if (endDay !== undefined) {
    const landscapes = new Map<string, Landscape>();
    for (const settlement of settlements) {
      landscapes.set(settlement.id, settlementLandscape(settlement, deps.landscapes));
    }
    for (const [i, village] of villages.entries()) {
      const landscape = landscapes.get(village.settlementId);
      if (isVillageDormant(village.state) || !landscape) continue;
      const result = await updateVillage(
        deps.villages,
        village.id,
        today,
        landscape,
        (state) => ({ ok: true, state: abandonForLineEnd(state, endDay) }),
        deps.pause,
      );
      if (result.ok) villages[i] = result.village;
    }
  }
  return { settlements, villages, gameOver: isGameOver(villages.map((v) => v.state)) };
}

/** Rod ještě žije – hráč má živou ves, hra nekončí. */
export const DYNASTY_ALIVE = 'Rod ještě žije – hra pokračuje.';

export interface RestartGameInput extends DynastyInput {
  /**
   * Začít znovu i se živou vsí (nabídka hry – Martin, 18. 10. 2026): ves i rod zaniknou.
   * Bez něj jen po konci hry (obrazovka porážky).
   */
  abandon?: boolean;
}

export type RestartGameResult =
  { ok: true; settlement: Settlement; landscape: Landscape } | { ok: false; reason: string };

/**
 * Začít znovu: všechna aktivní sídla hráče i se všemi vsemi jdou do archivu a vznikne nové sídelní sídlo
 * s novým seedem krajiny – pak hráč zakládá ves jako nový (první zemnice). Bez `abandon` jen po
 * konci hry (vymřely všechny vsi), živá ves restart odmítne; s `abandon` (hráč to potvrdil
 * v nabídce) se archivují i živé vsi. Když hráč ještě žádnou ves nemá (ani vymřelou – třeba
 * druhý souběžný nebo opakovaný restart už proběhl), vrátí jeho sídlo beze změny.
 */
export async function restartGame(
  deps: DynastyDeps & EnterGameDeps,
  input: RestartGameInput,
): Promise<RestartGameResult> {
  const status = await dynastyStatus(deps, input);
  if (!input.abandon && status.villages.length > 0 && !status.gameOver) {
    return { ok: false, reason: DYNASTY_ALIVE };
  }
  // bez abandon sem dojde jen hráč, pro kterého hra skončila (vsi vymřely nebo rod vymřel), nebo
  // hráč bez vsi
  if (status.villages.length > 0) {
    for (const settlement of status.settlements) await deps.settlements.archive(settlement.id);
    // rod skončil – `enterGame` níže založí nový (staré dohody zanikly vymřením)
    const house = await deps.houses.activeOf(input.playerId);
    if (house) await deps.houses.end(house.id, deps.now(), input.today);
  }
  const { settlement, landscape } = await enterGame(deps, input.playerId);
  return { ok: true, settlement, landscape };
}
