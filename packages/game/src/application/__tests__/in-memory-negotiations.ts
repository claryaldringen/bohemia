import type {
  NegotiationRecord,
  NegotiationRepository,
  NegotiationTx,
  OpenNegotiationInput,
  StoredNegotiationStatus,
  PeaceTribute,
} from '../negotiations';
import { peaceTributeOf } from '../negotiations';
import type { NoticeTx, VassalageTx } from '../negotiations';
import type { LoanTx } from '../loans';
import { InMemoryLoans } from './in-memory-loans';
import { InMemoryStewardships } from './in-memory-stewardships';
import type { StewardshipTx } from '../stewardships';
import { InMemoryWars } from './in-memory-wars';
import type { WarTx } from '../wars';
import type { NegotiationRound } from '../../domain/negotiation';
import type { PlacementTx } from '../newcomers';
import { InMemoryPlacement } from './in-memory-placement';

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
    };
  }
}
