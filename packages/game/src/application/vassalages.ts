import type { VassalTerms } from '../domain/vassalage/terms';
import type { VassalEdge } from '../domain/vassalage/tree';

export type { VassalTerms };

/**
 * Druh neplnění (vassalage.md – Neformální výpověď): méně než domluveno při odvodu (`levy`),
 * nesplacená půjčka (`repay`), nepřišel na svolání do války (`summons`), neposlechl pána
 * (`judgment` – rozsudek).
 */
export type BreachKind = 'levy' | 'repay' | 'summons' | 'judgment';

/** Jak vazalství vzniklo (vassalage.md). */
export type VassalageOrigin = 'invite' | 'negotiation' | 'escheat' | 'ennoble' | 'peace';

/** Vazalství mezi dvěma rody; živé, dokud `endedAt` je null. */
export interface Vassalage {
  id: string;
  lordHouseId: string;
  vassalHouseId: string;
  terms: VassalTerms;
  origin: VassalageOrigin;
  sinceAt: Date;
  /** Herní den vzniku. */
  sinceDay: number;
  endedAt: Date | null;
  /** Počet zapsaných neplnění (`addBreach`); dohodu neukončí, jen ji pán vidí u vazala. */
  breaches: number;
  version: number;
}

export type { VassalEdge };

export type NewVassalage = Pick<
  Vassalage,
  'lordHouseId' | 'vassalHouseId' | 'terms' | 'origin' | 'sinceAt' | 'sinceDay'
>;

/** Port repozitáře vazalství. */
export interface VassalageRepository {
  /** Živá vazalství rodu – jako pána i jako vazala. */
  activeOf(houseId: string): Promise<Vassalage[]>;
  /** Založí vazalství; mezi stejnými rody smí být živé jen jedno (druhé volání vrátí to první). */
  create(input: NewVassalage): Promise<Vassalage>;
  /** Ukončí živé vazalství; true jen při změně (z více souběžných volání uspěje jedno). */
  end(id: string, reason: string, at: Date): Promise<boolean>;
  /** Vazalství podle id (živé i ukončené), nebo null. */
  byId(id: string): Promise<Vassalage | null>;
  /**
   * Přepíše podmínky živé dohody a zvýší verzi; false, pokud se verze mezitím změnila nebo dohoda
   * skončila (do přijetí nových podmínek platí staré).
   */
  updateTerms(id: string, terms: VassalTerms, expectedVersion: number): Promise<boolean>;
  /**
   * Zapíše neplnění ve dni `day` a zvýší počet; false, pokud dohoda už neběží. Dohodu
   * neukončí (neformální výpověď není odchod).
   */
  addBreach(id: string, kind: BreachKind, day: number): Promise<boolean>;
  /** Živé hrany sítě do hloubky `depth` kroků (pán i vazal) od rodu. */
  edgesNear(houseId: string, depth: number): Promise<VassalEdge[]>;
}
