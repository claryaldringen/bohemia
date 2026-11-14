import type { WorldClock } from '../domain/calendar';
import type { Landscape } from '../domain/landscape';
import {
  abandonForLineEnd,
  isGameOver,
  isLineExtinct,
  isVillageDormant,
  lineEndDay,
} from '../domain/village';
import type { IntentBody } from '../domain/war';
import { queueIntentPastPoint, type CampaignRepository } from './campaigns';
import {
  endExtinctNobles,
  endHouse,
  endNegotiationsOf,
  livingLords,
  type EndHouseDeps,
} from './escheat';
import type { HouseRepository } from './houses';
import type { JourneyRepository } from './journeys';
import type { NegotiationRepository } from './negotiations';
import type { NoticeRepository } from './notices';
import type { SuccessionCreditRepository } from './succession-credits';
import { enterGame, settlementLandscape, type EnterGameDeps } from './enter-game';
import { loadVillage } from './load-village';
import { updateVillage } from './update-village';
import type { LandscapeSource, Settlement, SettlementRepository } from './settlements';
import { surrenderRaidedVillages, type SurrenderedMap } from './surrender-village';
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
  houses?: Pick<
    HouseRepository,
    'activeOf' | 'setLord' | 'setSenior' | 'commitSuccession' | 'clearPendingDeparture'
  >;
  /** Upozornění mezi hráči a kredity – s rody dovolují nástupnictví hráče po smrti jeho muže. */
  notices?: NoticeRepository;
  successionCredits?: Pick<SuccessionCreditRepository, 'unused' | 'consumeOne'>;
  /** Jednání mezi rody – konec rodu ukončí jeho otevřená jednání (stav `ended`). */
  negotiations?: NegotiationRepository;
  /**
   * Konec rodu přes `endHouse` (vassalage.md – Vymření rodu – odúmrť): rod s pánem nechá vsi pánovi
   * (nezaniknou), vazalové a dluhy podle pravidel, konec NPC rodů ve vsích. Bez něj jako dřív – vsi
   * zaniknou a rod skončí až restartem.
   */
  ending?: Omit<
    EndHouseDeps,
    'settlements' | 'villages' | 'landscapes' | 'negotiations' | 'houses'
  > & {
    houses: EndHouseDeps['houses'] & Pick<HouseRepository, 'activeOf'>;
    negotiations: NegotiationRepository;
    now: () => Date;
  };
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
  const ending = endingOf(deps);
  if (ending) {
    // povýšený vesničan bez mužů – jeho NPC rod skončí a ves se vrátí pod rod hráče
    const changed = await endExtinctNobles(ending, {
      villages,
      settlements,
      day: today,
      now: ending.now(),
    });
    for (const record of changed) {
      const i = villages.findIndex((v) => v.id === record.id);
      if (i >= 0) villages[i] = record;
    }
  }
  const states = villages.map((v) => v.state);
  const endDay = isLineExtinct(states) ? lineEndDay(states) : undefined;
  // rod a jeho pány se ptá jen při konci hry (ne v každém dopočtu)
  const over = isGameOver(states);
  const playerId = settlements[0]?.ownerId;
  const house = over && ending && playerId ? await ending.houses.activeOf(playerId) : null;
  // rod s pánem: vsi nezaniknou – připadnou pánovi jako odúmrť (`endHouse`)
  const hasLord =
    house !== null &&
    ending !== null &&
    (
      await livingLords(
        ending,
        (await ending.vassalages.activeOf(house.id)).filter((v) => v.vassalHouseId === house.id),
      )
    ).length > 0;
  if (endDay !== undefined && !hasLord) {
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
  const gameOver = isGameOver(villages.map((v) => v.state));
  if (house && ending) {
    await endHouse(ending, { houseId: house.id, day: endDay ?? today, now: ending.now() });
  }
  return { settlements, villages, gameOver };
}

/** Závislosti `endHouse` z rodu, jsou-li (jinak null – konec rodu jako dřív). */
function endingOf(deps: DynastyDeps): (EndHouseDeps & NonNullable<DynastyDeps['ending']>) | null {
  if (!deps.ending) return null;
  return {
    ...deps.ending,
    settlements: deps.settlements,
    villages: deps.villages,
    ...(deps.landscapes ? { landscapes: deps.landscapes } : {}),
  };
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
  | {
      ok: true;
      settlement: Settlement;
      landscape: Landscape;
      /**
       * Vsi pod nájezdem, které se vzdaly vůdci nájezdu (`surrenderRaidedVillages`) – po uvolnění
       * zámku hráče je převezme nový držitel (`finishCeded`), jinak worker.
       */
      surrendered: SurrenderedMap[];
    }
  | { ok: false; reason: string };

export type RestartGameDeps = DynastyDeps &
  EnterGameDeps & {
    /** Výjezdy vojvody – běžící výjezd hráče restart ukončí (`JourneyRepository.end`). */
    journeys: Pick<JourneyRepository, 'activeOf' | 'end' | 'checkpoint'>;
    /**
     * Tažení – nájezd, který hráč vede, restart ukončí obratem domů (`turnBackLedCampaigns`); ves
     * pod nájezdem se vzdá jeho vůdci (`surrenderRaidedVillages`).
     */
    campaigns: Pick<CampaignRepository, 'activeOf' | 'activeAgainst' | 'checkpoint' | 'addIntent'>;
    /** Hodiny světa – takt záměru obratu. */
    world: WorldClock;
  };

/**
 * Domovská ves výjezdu přešla vzdáním (není v archivu) a dopočítává se dál: výjezd skončí doma,
 * ves dostane `away-ends` jednou (`ref` výjezdu) a členové jsou doma jako ostatní lidé vsi
 * (návrh Clauda; bez upozornění). U domova v archivu se nic neposílá – ves se už nedopočítá. Pošle
 * se před `end`, takže pád mezi nimi opakovaný restart dopíše (stejný `ref` událost nezdvojí).
 */
async function endJourneyAtHome(
  deps: Pick<RestartGameDeps, 'journeys' | 'villages'>,
  journeyId: string,
  today: number,
): Promise<void> {
  const point = await deps.journeys.checkpoint(journeyId);
  const homeId = point?.state.home.villageId;
  if (homeId === undefined) return;
  const [home] = await deps.villages.stampsOfVillages([homeId]);
  if (!home || (await deps.villages.archivedOf([homeId])).includes(homeId)) return;
  const day = today + 1;
  await deps.villages.inbox.post({
    villageId: homeId,
    day,
    ref: `journey:${journeyId}:restart`,
    body: { kind: 'away-ends', refId: journeyId, untilDay: day },
  });
}

/**
 * Začít znovu: všechna aktivní sídla hráče i se všemi vsemi jdou do archivu a vznikne nové sídelní sídlo
 * s novým seedem krajiny – pak hráč zakládá ves jako nový (první zemnice). Bez `abandon` jen po
 * konci hry (vymřely všechny vsi), živá ves restart odmítne; s `abandon` (hráč to potvrdil
 * v nabídce) se archivují i živé vsi. Když hráč ještě žádnou ves nemá (ani vymřelou – třeba
 * druhý souběžný nebo opakovaný restart už proběhl), vrátí jeho sídlo beze změny.
 *
 * Běžící výjezd vojvody restart ukončí (`JourneyRepository.end` – bez událostí do vsí a bez
 * znalosti): jeho domovská ves je v archivu a dál se nedopočítá, takže by na ni výjezd čekal
 * navždy, držel bariéru a nová hra by nesměla vyslat (návrh Clauda). Nájezd, který hráč vede,
 * skončí obratem vojska domů (`turnBackLedCampaigns` – war.md, Začít znovu během nájezdu); ves pod
 * nájezdem se před archivem vzdá a připadne vůdci nájezdu celá (`surrenderRaidedVillages`).
 * Volající drží zámek hráče.
 */
export async function restartGame(
  deps: RestartGameDeps,
  input: RestartGameInput,
): Promise<RestartGameResult> {
  const status = await dynastyStatus(deps, input);
  if (!input.abandon && status.villages.length > 0 && !status.gameOver) {
    return { ok: false, reason: DYNASTY_ALIVE };
  }
  // bez abandon sem dojde jen hráč, pro kterého hra skončila (vsi vymřely nebo rod vymřel), nebo
  // hráč bez vsi
  let surrendered: SurrenderedMap[] = [];
  if (status.villages.length > 0) {
    // ves pod nájezdem se vzdá a připadne vůdci nájezdu celá – před archivem (war.md)
    surrendered = await surrenderRaidedVillages(deps, {
      playerId: input.playerId,
      today: input.today,
      nowMs: deps.now().getTime(),
      settlements: status.settlements,
      villages: status.villages,
    });
    // jen sídla, která hráč ještě drží – vsi odúmrti už patří pánovi, vzdané vůdci nájezdu
    for (const settlement of await deps.settlements.listActive(input.playerId)) {
      await deps.settlements.archive(settlement.id);
    }
  }
  // i bez vsí – opakovaný restart po pádu mezi archivem a koncem výjezdu ho ukončí; nová hra
  // výjezd mít nemůže (bez vsi není koho vyslat)
  const journeyId = await deps.journeys.activeOf(input.playerId);
  if (journeyId) {
    await endJourneyAtHome(deps, journeyId, input.today);
    await deps.journeys.end(journeyId);
  }
  if (status.villages.length > 0) {
    // rod skončil – `enterGame` níže založí nový (staré dohody zanikly vymřením)
    const house = await deps.houses.activeOf(input.playerId);
    if (house) {
      const at = deps.now();
      const ending = endingOf(deps);
      if (ending) await endHouse(ending, { houseId: house.id, day: input.today, now: at });
      else if (await deps.houses.end(house.id, at, input.today)) {
        await endNegotiationsOf(deps.negotiations, house.id, at);
      }
    }
  }
  // i bez vsí jako výjezd – opakovaný restart po pádu před záměry je dopíše
  await turnBackLedCampaigns(deps, { playerId: input.playerId, nowMs: deps.now().getTime() });
  const { settlement, landscape } = await enterGame(deps, input.playerId);
  return { ok: true, settlement, landscape, surrendered };
}

/** Obrat domů ze Začít znovu – platí, ať tažení vede kdokoli (`IntentBody` `turn-back`). */
const RESTART_TURN_BACK: IntentBody = { kind: 'turn-back', restart: true };

/**
 * Začít znovu během nájezdu (war.md; Martin 14. 11. 2026: „pokud to udělá hráč – agresor, tak tím
 * jeho nájezd samozřejmě končí“): každé běžící tažení, které hráč vede, dostane jeho jménem obrat
 * domů (`turn-back` se značkou `restart`) na takt teď + `INTENT_LEAD_TICKS` – tažení dál počítá
 * worker jako po rozkazu „Domů“ a muži vazalů ve službě dojdou domů (návrh Clauda). Tažení, ve
 * kterém jde jako vazal ve službě, se nemění – vede ho jiný hráč. Odmítne-li úložiště takt (bod už
 * je za ním), zkusí první takt za bodem (`queueIntentPastPoint`); skončené tažení nechá být.
 * Opakovaný obrat (druhý restart) tažení nezmění – na zpáteční cestě není co obracet.
 */
export async function turnBackLedCampaigns(
  deps: {
    campaigns: Pick<CampaignRepository, 'activeOf' | 'checkpoint' | 'addIntent'>;
    world: WorldClock;
  },
  input: { playerId: string; nowMs: number },
): Promise<void> {
  for (const campaignId of await deps.campaigns.activeOf(input.playerId)) {
    const point = await deps.campaigns.checkpoint(campaignId);
    if (point?.state.playerId !== input.playerId) continue;
    await queueIntentPastPoint(deps, {
      campaignId,
      byPlayer: input.playerId,
      body: RESTART_TURN_BACK,
      nowMs: input.nowMs,
    });
  }
}
