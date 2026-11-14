import type {
  NegotiationRecord,
  NegotiationRepository,
  NegotiationTx,
  OpenNegotiationInput,
  StoredNegotiationStatus,
  PeaceTribute,
} from '../negotiations';
import { peaceTributeOf } from '../negotiations';
import type { DueOutbox, NoticeTx, OutboxClaim, OutboxPolicy, VassalageTx } from '../negotiations';
import type { LoanTx } from '../loans';
import { InMemoryLoans } from './in-memory-loans';
import { InMemoryStewardships } from './in-memory-stewardships';
import type { StewardshipTx } from '../stewardships';
import { InMemoryWars } from './in-memory-wars';
import type { WarTx } from '../wars';
import type { NegotiationRound } from '../../domain/negotiation';
import type { PlacementTx } from '../newcomers';
import { InMemoryPlacement } from './in-memory-placement';
import type { Accepted } from '../acceptance-outbox';

/** Schránka účinků v paměti – jako řádek `negotiation_outbox`. */
interface InMemoryOutbox {
  effects: string;
  at: Date;
  /** Nejdřív kdy ji smí převzít další proces (ms podle hodin repozitáře): konec nájmu nebo odkladu. */
  nextAt: number;
  claim: string | null;
  attempts: number;
  lastError: string | null;
}

/**
 * Repozitář jednání v paměti. Transakce běží sériově (jedna po druhé, jako zámek řádku), verze
 * řádku se hlídá jako v databázi. Vazalství a upozornění dodá test (sdílené in-memory porty).
 */
export class InMemoryNegotiations implements NegotiationRepository {
  readonly records: NegotiationRecord[] = [];
  private readonly blocked = new Set<string>();
  private readonly rejects = new Map<string, Date>();
  private nextId = 1;
  private tail: Promise<unknown> = Promise.resolve();
  /** Schránky účinků přijetí – obsah jako JSON (jako v databázi), nájem, odklad a pokusy. */
  private readonly outboxes = new Map<string, InMemoryOutbox>();
  /**
   * Schránky, které právě někdo provádí – jejich nájem se obnovuje (jako v databázi), takže je
   * nikdo jiný nevezme ani po posunu hodin.
   */
  private readonly running = new Set<string>();
  private nextClaim = 1;
  /** Posun hodin schránek proti `clock` (`elapse`). */
  private elapsedMs = 0;
  /** Test: příští smazání schránky selže (pád po účincích, před smazáním). */
  failNextOutboxDelete = false;

  constructor(
    private readonly vassalages: VassalageTx,
    private readonly notices: NoticeTx,
    private readonly clock: () => Date = () => new Date(0),
    private readonly loans: LoanTx = new InMemoryLoans(),
    private readonly stewardships: StewardshipTx = new InMemoryStewardships(),
    private readonly wars: WarTx = new InMemoryWars(),
  ) {}

  /** Umístění nováčka – test ho nastaví nad svými in-memory rody a sídly. */
  placement: PlacementTx = new InMemoryPlacement();

  async newcomerRequestsOf(houseId: string): Promise<NegotiationRecord[]> {
    await Promise.resolve();
    return this.records
      .filter((r) => r.newcomer && r.initiatorHouseId === houseId)
      .map((r) => ({ ...r, rounds: [...r.rounds] }));
  }

  async peaceTributes(): Promise<PeaceTribute[]> {
    return this.records.map(peaceTributeOf).filter((t): t is PeaceTribute => t !== null);
  }

  async allOpen(): Promise<NegotiationRecord[]> {
    await Promise.resolve();
    return this.records
      .filter((r) => r.status === 'open')
      .map((r) => ({ ...r, rounds: [...r.rounds] }));
  }

  /** Test: posune hodiny schránek (nájem, odklad) o `ms` – krok workeru po lhůtě. */
  elapse(ms: number): void {
    this.elapsedMs += ms;
  }

  /** Hodiny schránek (ms) – jako hodiny databáze. */
  private outboxNow(): number {
    return this.clock().getTime() + this.elapsedMs;
  }

  /** Test: id všech schránek v úložišti (i odložených a vyčerpaných). */
  outboxIds(): string[] {
    return [...this.outboxes.keys()];
  }

  /** Test: stav schránky (pokusy, poslední chyba, odklad). */
  outbox(negotiationId: string): Readonly<InMemoryOutbox> | undefined {
    return this.outboxes.get(negotiationId);
  }

  async pendingOutboxes(limit: number, maxAttempts: number): Promise<DueOutbox[]> {
    await Promise.resolve();
    const now = this.outboxNow();
    return [...this.outboxes.entries()]
      .filter(([id, o]) => !this.running.has(id) && o.nextAt <= now && o.attempts < maxAttempts)
      .sort(([, a], [, b]) => a.attempts - b.attempts || a.nextAt - b.nextAt)
      .slice(0, limit)
      .map(([negotiationId, o]) => ({ negotiationId, attempts: o.attempts }));
  }

  async withOutbox<T>(
    negotiationId: string,
    fn: (effects: Accepted) => Promise<T>,
    policy: OutboxPolicy,
    claim?: OutboxClaim,
  ): Promise<{ value: T } | null> {
    // převzetí je atomické – mezi kontrolou a zápisem nájmu se nečeká
    const outbox = this.outboxes.get(negotiationId);
    if (!outbox || this.running.has(negotiationId)) return null;
    const own = claim !== undefined && outbox.claim === claim;
    if (!own && outbox.nextAt > this.outboxNow()) return null;
    const token = `najem-${this.nextClaim++}`;
    outbox.claim = token;
    this.running.add(negotiationId);
    try {
      const value = await fn(JSON.parse(outbox.effects) as Accepted);
      if (this.failNextOutboxDelete) {
        this.failNextOutboxDelete = false;
        throw new Error('pád před smazáním schránky');
      }
      this.outboxes.delete(negotiationId);
      return { value };
    } catch (error) {
      if (outbox.claim === token) {
        outbox.attempts++;
        outbox.lastError = error instanceof Error ? error.message : String(error);
        outbox.claim = null;
        outbox.nextAt = this.outboxNow() + policy.retryMs(outbox.attempts);
      }
      throw error;
    } finally {
      this.running.delete(negotiationId);
    }
  }

  transaction<T>(fn: (tx: NegotiationTx) => Promise<T>): Promise<T> {
    const turn = this.tail.then(() => fn(this.tx()));
    this.tail = turn.catch(() => undefined);
    return turn;
  }

  private tx(): NegotiationTx {
    const find = (id: string): NegotiationRecord | undefined =>
      this.records.find((r) => r.id === id);
    const openBetween = (a: string, b: string): NegotiationRecord | undefined =>
      this.records.find(
        (r) =>
          r.status === 'open' &&
          ((r.initiatorHouseId === a && r.recipientHouseId === b) ||
            (r.initiatorHouseId === b && r.recipientHouseId === a)),
      );
    const copy = (r: NegotiationRecord): NegotiationRecord => ({ ...r, rounds: [...r.rounds] });
    return {
      open: async (input: OpenNegotiationInput) => {
        if (openBetween(input.initiatorHouseId, input.recipientHouseId)) return null;
        const record: NegotiationRecord = {
          id: `negotiation-${this.nextId++}`,
          initiatorHouseId: input.initiatorHouseId,
          recipientHouseId: input.recipientHouseId,
          status: 'open',
          rounds: [input.round],
          resolvedAt: null,
          version: 1,
          createdAt: this.clock(),
          newcomer: input.newcomer === true,
        };
        this.records.push(record);
        return copy(record);
      },
      getForUpdate: async (id: string) => {
        const record = find(id);
        return record ? copy(record) : null;
      },
      openBetween: async (a: string, b: string) => {
        const record = openBetween(a, b);
        return record ? copy(record) : null;
      },
      openOf: async (houseId: string) =>
        this.records
          .filter(
            (r) =>
              r.status === 'open' &&
              (r.initiatorHouseId === houseId || r.recipientHouseId === houseId),
          )
          .map(copy),
      addRound: async (id: string, round: NegotiationRound) => {
        find(id)?.rounds.push(round);
      },
      setStatus: async (
        id: string,
        status: StoredNegotiationStatus,
        expectedVersion: number,
        at: Date,
      ) => {
        const record = find(id);
        if (!record || record.version !== expectedVersion) return false;
        record.status = status;
        record.version += 1;
        record.resolvedAt = status === 'open' ? null : at;
        return true;
      },
      blocks: async (blocker: string, blockedHouse: string) =>
        this.blocked.has(`${blocker}>${blockedHouse}`),
      setBlock: async (blocker: string, blockedHouse: string, on: boolean) => {
        if (on) this.blocked.add(`${blocker}>${blockedHouse}`);
        else this.blocked.delete(`${blocker}>${blockedHouse}`);
      },
      lastReject: async (proposer: string, rejecter: string) =>
        this.rejects.get(`${proposer}>${rejecter}`) ?? null,
      recordReject: async (proposer: string, rejecter: string, at: Date) => {
        this.rejects.set(`${proposer}>${rejecter}`, at);
      },
      vassalages: this.vassalages,
      notices: this.notices,
      loans: this.loans,
      stewardships: this.stewardships,
      wars: this.wars,
      placement: this.placement,
      putOutbox: async (negotiationId: string, effects: Accepted, at: Date, leaseMs: number) => {
        const claim = `najem-${this.nextClaim++}`;
        this.outboxes.set(negotiationId, {
          effects: JSON.stringify(effects),
          at,
          nextAt: this.outboxNow() + leaseMs,
          claim,
          attempts: 0,
          lastError: null,
        });
        return claim;
      },
    };
  }
}
