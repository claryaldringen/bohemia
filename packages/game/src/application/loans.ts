import type { LoanInstallment, MacroGoods } from '../domain/vassalage';

// Půjčky mezi rody (vassalage.md – Pomoc na žádost). Půjčka je samostatná dohoda – trvá i po
// vypovězení vazalství. Splátky chodí v ročních Odvodech (`annual-levies.ts`).

/** `active` – splácí se, `repaid` – splaceno, `cancelled` – zrušeno (nedoručeno, dlužník vymřel). */
export type LoanStatus = 'active' | 'repaid' | 'cancelled';

export interface Loan {
  id: string;
  /** Jednání, ze kterého půjčka vzešla (jedinečné – přijetí se nezdvojí). */
  negotiationId: string;
  creditorHouseId: string;
  debtorHouseId: string;
  /** Ves věřitele, ze které zboží odešlo a kam se splácí. */
  creditorVillageId: string;
  /** Kam zboží došlo (ves dlužníka). */
  debtorVillageId: string | null;
  /** Půjčené zboží. */
  principal: MacroGoods;
  schedule: LoanInstallment[];
  /** Zaplacená hodnota v kg obilí (`installmentValue`). */
  paidKg: number;
  /** Kolik splátek se nezaplatilo celých. */
  breaches: number;
  status: LoanStatus;
  sinceAt: Date;
  /** Herní den vzniku. */
  sinceDay: number;
  settledAt: Date | null;
}

export type NewLoan = Pick<
  Loan,
  | 'negotiationId'
  | 'creditorHouseId'
  | 'debtorHouseId'
  | 'creditorVillageId'
  | 'debtorVillageId'
  | 'principal'
  | 'schedule'
  | 'sinceAt'
  | 'sinceDay'
>;

/** Operace nad půjčkami uvnitř transakce jednání (účinek přijetí). */
export interface LoanTx {
  /** Založí půjčku; z jednání vznikne nejvýš jedna (druhé volání vrátí tu první). */
  create(input: NewLoan): Promise<Loan>;
  /** Zruší živou půjčku z jednání (zboží se nepodařilo poslat); true jen při změně. */
  cancelOfNegotiation(negotiationId: string, at: Date): Promise<boolean>;
}

/** Port repozitáře půjček. */
export interface LoanRepository extends LoanTx {
  /** Půjčka z jednání (živá i zrušená), nebo null. */
  ofNegotiation(negotiationId: string): Promise<Loan | null>;
  byId(id: string): Promise<Loan | null>;
  /** Všechny živé půjčky (roční Odvody). */
  allActive(): Promise<Loan[]>;
  /** Živé půjčky, kde je rod dlužníkem. */
  activeOfDebtor(houseId: string): Promise<Loan[]>;
  /**
   * Přičte zaplacenou hodnotu `valueKg`; při dosažení celého dluhu půjčku splatí. Vrací půjčku
   * po zápisu, nebo null, pokud už neběží.
   */
  pay(id: string, valueKg: number, at: Date): Promise<Loan | null>;
  /** Zapíše nezaplacenou splátku; false, pokud půjčka neběží. */
  addBreach(id: string): Promise<boolean>;
  /** Zruší živé půjčky dlužníka (vymřel bez pána); vrací jejich id. */
  cancelOfDebtor(houseId: string, at: Date): Promise<string[]>;
  /**
   * Pohledávky věřitele `fromHouseId` vůči dlužníkovi `debtorHouseId` přejdou na `toHouseId`
   * (odúmrť – pohledávky vymřelého jdou s vazaly); vrací id přenesených půjček.
   */
  moveCredits(fromHouseId: string, debtorHouseId: string, toHouseId: string): Promise<string[]>;
}
