import type { MacroBundle } from '../domain/vassalage';
import type { TradePeople } from '../domain/village';

// Spory mezi vazaly téhož pána a rozsudek (vassalage.md – Mír a spory). Spor je žaloba jednoho
// vazala na druhého před společným pánem; pán po vyjádření (nebo po 1 skutečném dni) vynese
// rozsudek. Hra nic nevynucuje – splnění je dialog a nesplnění se zapíše jako neplnění.

/** Rozsudek pána. `compensation` – zboží, `return-people` – lidé, `peace` – mír, `dismiss` – zamítnutí. */
export type Verdict =
  | { kind: 'compensation'; bundle: MacroBundle }
  | { kind: 'return-people'; people: TradePeople }
  | { kind: 'peace' }
  | { kind: 'dismiss' };

export type DisputeStatus = 'filed' | 'judged';

export interface Dispute {
  id: string;
  /** Společný pán, který soudí. */
  lordHouseId: string;
  plaintiffHouseId: string;
  defendantHouseId: string;
  /** Žaloba (vzkaz pánovi). */
  message: string;
  /** Vyjádření obžalovaného, dokud nepřišlo, null. */
  statement: string | null;
  filedAt: Date;
  filedDay: number;
  status: DisputeStatus;
  verdict: Verdict | null;
  judgedDay: number | null;
  /** Herní den, do kterého platí rozsudek „mír“ (jinak null). */
  peaceUntilDay: number | null;
  /** Rody, kterým už byl zapsán porušený mír (každému jednou). */
  brokenBy: string[];
}

export interface NewDispute {
  lordHouseId: string;
  plaintiffHouseId: string;
  defendantHouseId: string;
  message: string;
  filedAt: Date;
  filedDay: number;
}

/** Port repozitáře sporů. */
export interface DisputeRepository {
  /**
   * Podá žalobu; mezi týmiž rody (v kterémkoli směru) smí běžet jediný nerozsouzený spor – druhé
   * (i souběžné) volání vrátí null.
   */
  file(input: NewDispute): Promise<Dispute | null>;
  byId(id: string): Promise<Dispute | null>;
  /** Zapíše vyjádření; podmíněně – jen když ještě není a spor není rozsouzen. */
  answer(id: string, statement: string): Promise<boolean>;
  /**
   * Zapíše rozsudek; podmíněně – jen když je spor nerozsouzený (ze souběžných volání uspěje
   * jedno). `peaceUntilDay` se uloží u rozsudku „mír“.
   */
  judge(id: string, verdict: Verdict, day: number, peaceUntilDay: number | null): Promise<boolean>;
  /** Spory rodu (jako pán, žalobce i obžalovaný), nejnovější první, nejvýš `limit`. */
  listOf(houseId: string, limit: number): Promise<Dispute[]>;
  /** Rozsouzený mír mezi rody `a` a `b`, který ve dni `day` ještě platí, nebo null. */
  peaceBetween(a: string, b: string, day: number): Promise<Dispute | null>;
  /** Zapíše porušení míru rodem `houseId`; true jen poprvé (podmíněně). */
  markBroken(id: string, houseId: string): Promise<boolean>;
}
