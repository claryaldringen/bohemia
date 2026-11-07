import type {
  CampaignIntent,
  CampaignMap,
  CampaignOutbox,
  CampaignState,
  IntentBody,
} from '../domain/war';
import { INTENT_LEAD_TICKS, tickOfMs } from '../domain/war';
import type { WorldClock } from '../domain/calendar';
import type { GridCell } from '../domain/village/world-grid';

// Porty tažení (plán 2026-11-03 – Úloha 6.5): úložiště tažení s kontrolními body a záměry, zámek
// tažení a mapy políček světa.

/** Kontrolní bod tažení – stav do `state.tick` a nedoručené události (null = nic). */
export interface CampaignCheckpoint {
  state: CampaignState;
  outbox: CampaignOutbox | null;
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
  checkpoint(campaignId: string): Promise<CampaignCheckpoint | null>;
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
