import type { Negotiation, NegotiationRound } from '../domain/negotiation';
import type { NoticeRepository } from './notices';
import type { VassalageRepository } from './vassalages';

/** Stav jednání v úložišti: doménové stavy a `ended` (rod vymřel, vazalství už nelze uzavřít). */
export type StoredNegotiationStatus = Negotiation['status'] | 'ended';

/** Jednání načtené z úložiště, včetně kol a verze řádku. */
export interface NegotiationRecord extends Omit<Negotiation, 'status'> {
  status: StoredNegotiationStatus;
  /** Roste při každé změně stavu; `setStatus` uspěje jen při shodě. */
  version: number;
  createdAt: Date;
}

/** Založení jednání s prvním kolem; `recipientHouseId` je druhá strana. */
export interface OpenNegotiationInput {
  initiatorHouseId: string;
  recipientHouseId: string;
  round: NegotiationRound;
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
}

/** Port repozitáře jednání: vše běží v transakci, účinky přijetí ve stejné. */
export interface NegotiationRepository {
  transaction<T>(fn: (tx: NegotiationTx) => Promise<T>): Promise<T>;
}
