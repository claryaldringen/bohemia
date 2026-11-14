import type { CampaignOutbox, JourneyIntent, JourneyState } from '../../domain/war';
import type { GridCell } from '../../domain/village/people/world-grid';
import type { CheckpointSave } from '../campaigns';
import type { JourneyCheckpoint, JourneyRepository } from '../journeys';

/** Verze bodu v paměti = obsah řádku (jako `InMemoryCampaigns`). */
function versionOf(row: { tick: number; state: string; outbox: string | null }): string {
  return JSON.stringify([row.tick, row.state, row.outbox]);
}

/** Id běžící výpravy hráče z domovské vsi, jinak null. */
function activeInRows(
  rows: ReadonlyMap<string, { status: 'active' | 'done'; state: string }>,
  playerId: string,
  villageId: string,
): string | null {
  for (const [id, r] of rows) {
    if (r.status !== 'active') continue;
    const s = JSON.parse(r.state) as JourneyState;
    if (s.playerId === playerId && s.home.villageId === villageId) return id;
  }
  return null;
}

/** Úložiště výjezdů v paměti – stav ukládá jako JSON (jako jsonb v DB). */
export class InMemoryJourneys implements JourneyRepository {
  readonly rows = new Map<
    string,
    { status: 'active' | 'done'; tick: number; state: string; outbox: string | null }
  >();
  readonly intents: (JourneyIntent & { journeyId: string })[] = [];
  /** Kolikrát se uložil kontrolní bod. */
  saves = 0;
  /** Další `create` selže touto chybou (test vrácení mužů). */
  failCreate: Error | null = null;
  private seq = 0;

  create(state: JourneyState): Promise<void> {
    if (this.failCreate) return Promise.reject(this.failCreate);
    // jedna běžící výprava na dvojici hráč × domovská ves (jako unikátní index v DB)
    if (activeInRows(this.rows, state.playerId, state.home.villageId) !== null) {
      return Promise.reject(new Error('journey_player_home_active_idx'));
    }
    this.rows.set(state.id, {
      status: 'active',
      tick: state.tick,
      state: JSON.stringify(state),
      outbox: null,
    });
    return Promise.resolve();
  }

  active(): Promise<string[]> {
    return Promise.resolve(
      [...this.rows]
        .filter(([, r]) => r.status === 'active' || r.outbox !== null)
        .map(([id]) => id),
    );
  }

  activeIn(playerId: string, villageId: string): Promise<string | null> {
    return Promise.resolve(activeInRows(this.rows, playerId, villageId));
  }

  activeOfPlayer(playerId: string): Promise<string[]> {
    // řádky jsou v pořadí založení (Map drží pořadí vložení)
    return Promise.resolve(
      [...this.rows]
        .filter(
          ([, r]) =>
            r.status === 'active' && (JSON.parse(r.state) as JourneyState).playerId === playerId,
        )
        .map(([id]) => id),
    );
  }

  onCell(cell: GridCell): Promise<string[]> {
    return Promise.resolve(
      [...this.rows]
        .filter(([, r]) => {
          if (r.status !== 'active') return false;
          const s = JSON.parse(r.state) as JourneyState;
          return s.groups.some((g) => g.cell.x === cell.x && g.cell.y === cell.y);
        })
        .map(([id]) => id),
    );
  }

  checkpoint(journeyId: string): Promise<JourneyCheckpoint | null> {
    const row = this.rows.get(journeyId);
    if (!row) return Promise.resolve(null);
    return Promise.resolve({
      state: JSON.parse(row.state) as JourneyState,
      outbox: row.outbox === null ? null : (JSON.parse(row.outbox) as CampaignOutbox),
      version: versionOf(row),
    });
  }

  intentsAfter(journeyId: string, tick: number): Promise<JourneyIntent[]> {
    return Promise.resolve(
      this.intents
        .filter((i) => i.journeyId === journeyId && i.tick > tick)
        .sort((a, b) => a.tick - b.tick || a.seq - b.seq)
        .map(({ tick: t, seq, byPlayer, body }) => ({ tick: t, seq, byPlayer, body })),
    );
  }

  saveCheckpoint(
    journeyId: string,
    input: {
      fromTick: number;
      seenIntents: number;
      state: JourneyState;
      outbox: CampaignOutbox | null;
    },
  ): Promise<CheckpointSave> {
    const row = this.rows.get(journeyId);
    const inRange = this.intents.filter(
      (i) => i.journeyId === journeyId && i.tick > input.fromTick && i.tick <= input.state.tick,
    );
    if (
      !row ||
      (row.status === 'done' && input.state.phase !== 'done') ||
      row.tick !== input.fromTick ||
      inRange.length !== input.seenIntents
    ) {
      return Promise.resolve('stale');
    }
    this.saves++;
    row.tick = input.state.tick;
    row.state = JSON.stringify(input.state);
    row.outbox = input.outbox ? JSON.stringify(input.outbox) : null;
    if (input.state.phase === 'done') row.status = 'done';
    return Promise.resolve('saved');
  }

  clearOutbox(journeyId: string, tick: number): Promise<void> {
    const row = this.rows.get(journeyId);
    if (row && row.tick === tick) row.outbox = null;
    return Promise.resolve();
  }

  end(journeyId: string): Promise<void> {
    const row = this.rows.get(journeyId);
    if (row) {
      row.status = 'done';
      row.state = JSON.stringify({ ...(JSON.parse(row.state) as JourneyState), phase: 'done' });
      row.outbox = null;
    }
    return Promise.resolve();
  }

  addIntent(journeyId: string, intent: Omit<JourneyIntent, 'seq'>): Promise<JourneyIntent | null> {
    const row = this.rows.get(journeyId);
    if (!row || row.status !== 'active' || intent.tick <= row.tick) return Promise.resolve(null);
    const stored = { ...structuredClone(intent), seq: ++this.seq };
    this.intents.push({ ...stored, journeyId });
    return Promise.resolve(stored);
  }
}
