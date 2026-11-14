import type { Negotiation, NegotiationRound } from '../domain/negotiation';
import type { NoticeRepository } from './notices';
import type { LoanTx } from './loans';
import type { StewardshipTx } from './stewardships';
import type { VassalageRepository } from './vassalages';
import type { WarTx } from './wars';
import type { PlacementTx } from './newcomers';
import type { MacroBundle } from '../domain/vassalage';
import type { Accepted } from './acceptance-outbox';

/**
 * Stav jednání v úložišti: doménové stavy, `ended` (rod vymřel, vazalství už nelze uzavřít)
 * a `expired` (návrh bez odpovědi vypršel – absence.md, `expireNegotiations`).
 */
export type StoredNegotiationStatus = Negotiation['status'] | 'ended' | 'expired';

/** Jednání načtené z úložiště, včetně kol a verze řádku. */
export interface NegotiationRecord extends Omit<Negotiation, 'status'> {
  status: StoredNegotiationStatus;
  /** Roste při každé změně stavu; `setStatus` uspěje jen při shodě. */
  version: number;
  createdAt: Date;
  /** Žádost odříznutého nováčka o pána (newcomers.md) – pán jen přijme / odmítne. */
  newcomer: boolean;
}

/** Založení jednání s prvním kolem; `recipientHouseId` je druhá strana. */
export interface OpenNegotiationInput {
  initiatorHouseId: string;
  recipientHouseId: string;
  round: NegotiationRound;
  /** Žádost nováčka o pána (newcomers.md – Nabídka pánů); bez něj běžné jednání. */
  newcomer?: boolean;
}

/** Vazalství uvnitř transakce jednání (podmnožina portu, běží nad toutéž transakcí). */
export type VassalageTx = Pick<
  VassalageRepository,
  'activeOf' | 'create' | 'end' | 'edgesNear' | 'updateTerms'
>;
/** Upozornění uvnitř transakce jednání. */
export type NoticeTx = Pick<NoticeRepository, 'post'>;

/**
 * Operace nad jednáním v jedné databázové transakci. Mezihráčské záznamy se mění bez zámku hráče
 * (technické rozhodnutí 5 plánu) – souběh řeší zámek řádku (`getForUpdate`) a podmíněné
 * `setStatus`.
 */
export interface NegotiationTx {
  /** Založí otevřené jednání; `null`, pokud mezi rody už jedno otevřené je (v libovolném směru). */
  open(input: OpenNegotiationInput): Promise<NegotiationRecord | null>;
  /** Načte jednání a zamkne jeho řádek do konce transakce; null = neexistuje. */
  getForUpdate(id: string): Promise<NegotiationRecord | null>;
  /** Otevřené jednání mezi dvojicí rodů (v libovolném směru), bez zámku; null = žádné. */
  openBetween(a: string, b: string): Promise<NegotiationRecord | null>;
  /** Všechna otevřená jednání rodu (v libovolném směru), bez zámku; konec rodu je ukončí. */
  openOf(houseId: string): Promise<NegotiationRecord[]>;
  /** Připojí kolo (pořadí `seq` doplní úložiště). */
  addRound(id: string, round: NegotiationRound): Promise<void>;
  /** Změní stav a zvýší verzi; false, pokud se verze mezitím změnila. `closedAt` při uzavření. */
  setStatus(
    id: string,
    status: StoredNegotiationStatus,
    expectedVersion: number,
    at: Date,
  ): Promise<boolean>;
  /** Zablokoval rod `blocker` rod `blocked`? */
  blocks(blocker: string, blocked: string): Promise<boolean>;
  /** Zapne / vypne blokování. */
  setBlock(blocker: string, blocked: string, on: boolean, at: Date): Promise<void>;
  /** Kdy `rejecter` naposledy odmítl návrh od `proposer` (null = nikdy); `canOpen.rejectedByTargetAt`. */
  lastReject(proposer: string, rejecter: string): Promise<Date | null>;
  /** Zapíše odmítnutí (přepíše čas předchozího). */
  recordReject(proposer: string, rejecter: string, at: Date): Promise<void>;
  vassalages: VassalageTx;
  notices: NoticeTx;
  loans: LoanTx;
  stewardships: StewardshipTx;
  wars: WarTx;
  /** Umístění odříznutého nováčka na mapu světa (`placeNewcomer`). */
  placement: PlacementTx;
  /**
   * Zapíše schránku účinků přijetí (`acceptance-outbox.ts`) v téže transakci jako přijetí;
   * jedna na jednání.
   */
  putOutbox(negotiationId: string, effects: Accepted, at: Date): Promise<void>;
}

/** Tribut z přijatého míru (war.md – Konec války): opakovaná platba bez vazalství, chodí 1. 11. */
export interface PeaceTribute {
  negotiationId: string;
  payerHouseId: string;
  recipientHouseId: string;
  goods: MacroBundle;
  /** Kdy se mír přijal – první Odvody jsou až 1. 11. po tomto dni. */
  acceptedAt: Date;
}

/** Port repozitáře jednání: vše běží v transakci, účinky přijetí ve stejné. */
export interface NegotiationRepository {
  /** Přijatá mírová jednání s tributem (poslední kolo); výchozí zdroj ročních Odvodů tributu. */
  peaceTributes(): Promise<PeaceTribute[]>;
  /** Všechny žádosti nováčka `houseId` o pána (jednání `newcomer`, v libovolném stavu). */
  newcomerRequestsOf(houseId: string): Promise<NegotiationRecord[]>;
  /** Všechna otevřená jednání (s koly), nejstarší první – úloha světa `expireNegotiations`. */
  allOpen(): Promise<NegotiationRecord[]>;
  transaction<T>(fn: (tx: NegotiationTx) => Promise<T>): Promise<T>;
  /** Jednání s nevyřízenou schránkou účinků zapsanou před `before`, nejstarší první, nejvýš `limit`. */
  pendingOutboxes(before: Date, limit: number): Promise<string[]>;
  /**
   * Provede schránku účinků jednání: zamkne ji (jiný proces ji mezitím přeskočí – web a worker ji
   * nikdy neprovádějí současně), pustí `fn` s jejím obsahem a po jeho návratu ji smaže. Výjimka
   * z `fn` ji nechá nevyřízenou. Null – schránka není (už vyřízená), nebo ji právě drží jiný proces.
   */
  withOutbox<T>(
    negotiationId: string,
    fn: (effects: Accepted) => Promise<T>,
  ): Promise<{ value: T } | null>;
}

/** Tribut z posledního kola přijatého jednání (null – kolo mírový tribut nenese). */
export function peaceTributeOf(record: NegotiationRecord): PeaceTribute | null {
  if (record.status !== 'accepted' || record.resolvedAt === null) return null;
  const items = record.rounds[record.rounds.length - 1]?.items ?? [];
  const line = items.find((i) => i.kind === 'peace');
  if (!line || line.kind !== 'peace' || !line.tribute) return null;
  const { goods, payer } = line.tribute;
  return {
    negotiationId: record.id,
    payerHouseId: payer,
    recipientHouseId:
      payer === record.initiatorHouseId ? record.recipientHouseId : record.initiatorHouseId,
    goods,
    acceptedAt: record.resolvedAt,
  };
}
