import type { CampaignOutbox, JourneyIntent, JourneyState } from '../domain/war';
import type { GridCell } from '../domain/village/people/world-grid';
import type { CheckpointSave } from './campaigns';

// Port úložiště výjezdů vojvody (lord-control.md; plán 2026-11-13 – Úloha 2): stejná sémantika
// kontrolního bodu a záměrů jako u tažení (`CampaignRepository`), jen stav je `JourneyState`.

/** Kontrolní bod výjezdu – stav do `state.tick` a nedoručené události (tvar jako u tažení). */
export interface JourneyCheckpoint {
  state: JourneyState;
  outbox: CampaignOutbox | null;
  /** Verze bodu – mění se s každým zápisem řádku bodu, záměry ji nemění. */
  version: string;
}

/** Port úložiště výjezdů. */
export interface JourneyRepository {
  /** Založí výjezd s výchozím kontrolním bodem (vyslání). */
  create(state: JourneyState, createdAt: Date): Promise<void>;
  /** Id výjezdů, které se počítají – běžící, nebo s nedoručenými událostmi. */
  active(): Promise<string[]>;
  /** Id běžící výpravy hráče z domovské vsi `villageId`; z jedné vsi má hráč nejvýš jednu. */
  activeIn(playerId: string, villageId: string): Promise<string | null>;
  /** Id všech běžících výprav hráče (z různých vsí), podle založení a id. */
  activeOfPlayer(playerId: string): Promise<string[]>;
  /** Id běžících výjezdů, jejichž hlouček stojí na políčku světa `cell`. */
  onCell(cell: GridCell): Promise<string[]>;
  checkpoint(journeyId: string): Promise<JourneyCheckpoint | null>;
  /** Záměry s taktem větším než `tick`, podle taktu a `seq`. */
  intentsAfter(journeyId: string, tick: number): Promise<JourneyIntent[]>;
  /**
   * Uloží stav spočtený z bodu `fromTick` – podmínky a návrat jako `CampaignRepository`; skončený
   * výjezd (`end`) se do běžící fáze už nevrátí (`stale`).
   */
  saveCheckpoint(
    journeyId: string,
    input: {
      fromTick: number;
      seenIntents: number;
      state: JourneyState;
      outbox: CampaignOutbox | null;
    },
  ): Promise<CheckpointSave>;
  /** Smaže doručené události bodu `tick` (bod se mezitím neposunul). */
  clearOutbox(journeyId: string, tick: number): Promise<void>;
  /**
   * Ukončí výjezd bez událostí do vsí a bez znalosti (Začít znovu – `restartGame`): bod dostane
   * `phase: 'done'` a prázdnou schránku, výjezd stav `done` – worker ho dál nepočítá a bariéra
   * nedrží. Souběžný worker ho do běžící fáze nevrátí (`saveCheckpoint` → `stale`).
   */
  end(journeyId: string): Promise<void>;
  /** Zapíše záměr, jen když výjezd běží a jeho takt je za kontrolním bodem; jinak null. */
  addIntent(journeyId: string, intent: Omit<JourneyIntent, 'seq'>): Promise<JourneyIntent | null>;
}
