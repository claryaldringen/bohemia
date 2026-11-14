import type {
  AlarmOwner,
  CampaignIntent,
  CampaignMap,
  CampaignOutbox,
  CampaignState,
  IntentBody,
} from '../domain/war';
import {
  campaignFinished,
  INTENT_LEAD_TICKS,
  isCampaignParticipant,
  tickOfMs,
} from '../domain/war';
import type { WorldClock } from '../domain/calendar';
import type { GridCell } from '../domain/village/people/world-grid';
import type { HouseRepository } from './houses';
import type { SettlementRepository } from './settlements';
import type { VillageRepository } from './villages';

// Porty tažení (plán 2026-11-03 – Úloha 6.5): úložiště tažení s kontrolními body a záměry, zámek
// tažení a mapy políček světa.

/** Kontrolní bod tažení – stav do `state.tick` a nedoručené události (null = nic). */
export interface CampaignCheckpoint {
  state: CampaignState;
  outbox: CampaignOutbox | null;
  /**
   * Verze bodu – mění se s každým zápisem řádku bodu (uložení, smazání doručených událostí),
   * záměry ji nemění. Táž verze = týž bod (paměť workeru čte stav z JSON jen při změně).
   */
  version: string;
}

/** Výsledek uložení kontrolního bodu. */
export type CheckpointSave =
  /** Uloženo. */
  | 'saved'
  /** Mezitím přibyl záměr do spočtených taktů, nebo se bod posunul – nic se neuložilo. */
  | 'stale';

/** Port úložiště tažení. */
export interface CampaignRepository {
  /** Založí tažení s výchozím kontrolním bodem (vyslání – Ú6.6). */
  create(state: CampaignState, createdAt: Date): Promise<void>;
  /** Id tažení, která se počítají – aktivní, nebo s nedoručenými událostmi. */
  active(): Promise<string[]>;
  /**
   * Id běžících tažení, která hráč `playerId` vede nebo ve kterých jdou jeho muži (vazal ve
   * službě) – panel Vojsko (Ú6.14, Ú6.17), od nejstaršího.
   */
  activeOf(playerId: string): Promise<string[]>;
  /**
   * Id běžících tažení s cílem ve vsi `villageId` – scéna napadené vsi (war.md – Ve scéně), od
   * nejstaršího.
   */
  activeAgainst(villageId: string): Promise<string[]>;
  /**
   * Id běžících tažení, která se vsi `villageId` týkají varováním (war.md – Varování, poslové
   * a útěk do hradiště; plán 2026-11-09 – Úloha 3): ves je cílem, je ve varování
   * (`alarm.villages`), nebo je hradištěm skupiny uprchlíků (`alarm.flights[].hostVillageId`) –
   * pohled na varování a návrat z útěku. Kandidáti hradišť (`hosts`) ne. Od nejstaršího.
   */
  activeAlarming(villageId: string): Promise<string[]>;
  checkpoint(campaignId: string): Promise<CampaignCheckpoint | null>;
  /**
   * Jen verze kontrolního bodu (`CampaignCheckpoint.version`) bez jeho stavu – levný dotaz, ať
   * paměť workeru nečte stav v každém kole; tažení bez bodu null.
   */
  checkpointVersion(campaignId: string): Promise<string | null>;
  /** Záměry s taktem větším než `tick`, podle taktu a `seq`. */
  intentsAfter(campaignId: string, tick: number): Promise<CampaignIntent[]>;
  /**
   * Uloží stav spočtený z bodu `fromTick` – jen když bod pořád stojí na `fromTick` a záměrů
   * s taktem v (`fromTick`, `state.tick`] je pořád `seenIntents` (s tolika se počítalo; záměry se
   * nemažou, takže jiný počet = přibyl záměr do spočtených taktů); atomicky vůči `addIntent`.
   * `outbox` se uloží se stavem; skončené tažení přestane být aktivní.
   */
  saveCheckpoint(
    campaignId: string,
    input: {
      fromTick: number;
      seenIntents: number;
      state: CampaignState;
      outbox: CampaignOutbox | null;
    },
  ): Promise<CheckpointSave>;
  /** Smaže doručené události bodu `tick` (bod se mezitím neposunul). */
  clearOutbox(campaignId: string, tick: number): Promise<void>;
  /**
   * Zapíše záměr, jen když tažení běží a jeho takt je za kontrolním bodem; jinak null (takt
   * v minulosti). Pořadí `seq` přidělí úložiště.
   */
  addIntent(
    campaignId: string,
    intent: Omit<CampaignIntent, 'seq'>,
  ): Promise<CampaignIntent | null>;
}

/** Zámek tažení – tažení počítá najednou jen jeden proces (worker nikdy nečeká). */
export interface CampaignLock {
  tryRun<T>(
    campaignId: string,
    run: () => Promise<T>,
  ): Promise<{ ran: true; value: T } | { ran: false }>;
}

/** Mapy políček světa pro tažení – krajina (se vsí z uloženého seedu) a vsi na ní. */
export interface CampaignCells {
  mapOf(cell: GridCell): Promise<CampaignMap>;
}

/** Ves s políčkem světa, na kterém stojí. */
export interface VillageCell {
  villageId: string;
  cell: GridCell;
}

/**
 * Kdo za ves při varování rozhoduje a kam se utíká (war.md – Varování, poslové a útěk do hradiště;
 * plán 2026-11-09 – Úloha 6, Otevřené 1, 5, 6). Tažení se ptá synchronně (`CampaignWorld.alarmOf`,
 * `refugeHostsOf`, `domainOf`) – smyčka tažení odpovědi načte, když na ně takt čeká
 * (`computeCampaign`). Rod vsi = živý rod hráče, kterému ves patří (držitel sídla); vsi bez políčka
 * světa, archivované a spící (vymřelé, opuštěné) se nepočítají.
 */
export interface AlarmOwnerPort {
  /**
   * Kdo za ves rozhoduje: držitel vsi (`playerId`) a jeho rod (`houseId`; hráč bez živého rodu
   * null), `npc` – ves spravuje NPC rod (povýšený vesničan – rozhoduje pravidlo správce). Neznámá ves
   * null.
   */
  ownerOf(villageId: string): Promise<AlarmOwner | null>;
  /**
   * Kandidáti hradišť (Otevřené 1): vsi vlastního rodu kromě `villageId` a vsi přímých pánů rodu
   * (jeden stupeň vazalství), od nejbližší (shoda – menší id). Tažení si vybere ty v dosahu.
   */
  refugeHostsOf(villageId: string): Promise<VillageCell[]>;
  /**
   * Doména hradiště (Otevřené 5): vsi rodu `villageId` (i ona) a jeho přímých vazalů – vazal vazala
   * ne; od nejbližší (shoda – menší id).
   */
  domainOf(villageId: string): Promise<VillageCell[]>;
}

/**
 * Záměr hráče do tažení na takt teď + 2 (rozhodnutí 12) – nezávisí na tom, kdy ho worker
 * uvidí. Úložiště odmítne takt, který už je za kontrolním bodem (null). Ověření, smí-li hráč
 * záměr dát (vlastní muž, dohled, mlha války), dělá `commandCampaign` (Ú6.14).
 */
export async function queueCampaignIntent(
  deps: { campaigns: Pick<CampaignRepository, 'addIntent'>; world: WorldClock },
  input: { campaignId: string; playerId: string; body: IntentBody; nowMs: number },
): Promise<CampaignIntent | null> {
  return deps.campaigns.addIntent(input.campaignId, {
    tick: tickOfMs(input.nowMs, deps.world) + INTENT_LEAD_TICKS,
    byPlayer: input.playerId,
    body: input.body,
  });
}

/** Kolikrát zkusit takt záměru, když ho úložiště odmítne (bod už je za ním). */
const TURN_BACK_ATTEMPTS = 3;

/**
 * Záměr bez hráče u tažení (Začít znovu – war.md) na takt teď + `INTENT_LEAD_TICKS`: odmítne-li
 * úložiště takt (bod se mezitím posunul za něj), zkusí první takt za bodem, nejvýš
 * `TURN_BACK_ATTEMPTS`×; skončené nebo zmizelé tažení nechá být. Vrací zapsaný záměr, jinak null.
 */
export async function queueIntentPastPoint(
  deps: { campaigns: Pick<CampaignRepository, 'checkpoint' | 'addIntent'>; world: WorldClock },
  input: { campaignId: string; byPlayer: string; body: IntentBody; nowMs: number },
): Promise<CampaignIntent | null> {
  let tick = tickOfMs(input.nowMs, deps.world) + INTENT_LEAD_TICKS;
  for (let attempt = 0; attempt < TURN_BACK_ATTEMPTS; attempt++) {
    const intent = { tick, byPlayer: input.byPlayer, body: input.body };
    const added = await deps.campaigns.addIntent(input.campaignId, intent);
    if (added) return added;
    // takt v minulosti – bod se mezitím posunul; skončené (nebo zmizelé) tažení nechá být
    const point = await deps.campaigns.checkpoint(input.campaignId);
    if (!point || campaignFinished(point.state)) return null;
    tick = Math.max(tick, point.state.tick) + 1;
  }
  return null;
}

/**
 * Staré vojsko (war.md – Začít znovu během nájezdu): tažení vede rod `houseId` (`CampaignState`)
 * a ten už není živým rodem hráče `living` – hráč dal Začít znovu, nová hra tažení nevede (panel
 * Vojsko, upozornění vůdci). Bod bez rodu (starší než Úloha 11) patří živému rodu hráče.
 */
export function ledByEndedHouse(
  houseId: string | undefined,
  living: { id: string } | null,
): boolean {
  return houseId !== undefined && houseId !== living?.id;
}

/** Porty kontroly `mayHandleCampaign`; bez nich se příslušná část nekontroluje. */
export interface HandleCampaignDeps {
  /** Živý rod hráče – vůdce. */
  houses?: Pick<HouseRepository, 'activeOf'>;
  /** Sídla, která hráč drží (bez čekajícího převodu) – vazal ve službě. */
  settlements?: Partial<Pick<SettlementRepository, 'listActive'>>;
  /** Sídla vsí mužů vazala. */
  villages?: Partial<Pick<VillageRepository, 'stampsOfVillages'>>;
}

/**
 * Smí hráč tažení vidět a dávat mu rozkazy? Jen když v něm stojí za živým rodem hráče (war.md –
 * Začít znovu během nájezdu; návrat starého vojska nová hra nezdědí). Vůdce: rod tažení
 * (`houseId`; bod bez rodu patří živému rodu) je živým rodem hráče. Vazal ve službě: aspoň jeden
 * jeho muž žije ve vsi, kterou hráč drží (sídlo v `listActive` – ne v archivu, ne vzdané ani
 * postoupené, ani čekající na převod). Jedna kontrola pro všechny vstupy hráče do tažení (pohled,
 * pokyny, panel, scéna).
 */
export async function mayHandleCampaign(
  deps: HandleCampaignDeps,
  state: CampaignState,
  playerId: string,
): Promise<boolean> {
  if (!isCampaignParticipant(state, playerId)) return false;
  if (state.playerId === playerId) {
    if (!deps.houses || state.houseId === undefined) return true;
    return !ledByEndedHouse(state.houseId, await deps.houses.activeOf(playerId));
  }
  if (!deps.villages?.stampsOfVillages || !deps.settlements?.listActive) return true;
  const own = [
    ...new Set(state.members.filter((m) => m.playerId === playerId).map((m) => m.ref.villageId)),
  ];
  const held = new Set((await deps.settlements.listActive(playerId)).map((s) => s.id));
  const stamps = await deps.villages.stampsOfVillages(own);
  return stamps.some((v) => held.has(v.settlementId));
}
