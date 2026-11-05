/** Podmínky vazalství (zatím žádné – rozšíří úloha 4.2: dávky, vojenská služba). */
export type VassalTerms = Record<string, never>;

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
  /** Porušení podmínek – zatím vždy 0 (rozšíří úloha 4.2). */
  breaches: number;
  version: number;
}

/** Hrana sítě vazalství: pán a vazal. */
export interface VassalEdge {
  lordHouseId: string;
  vassalHouseId: string;
}

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
  /** Živé hrany sítě do hloubky `depth` kroků (pán i vazal) od rodu. */
  edgesNear(houseId: string, depth: number): Promise<VassalEdge[]>;
}
