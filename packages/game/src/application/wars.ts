// Války mezi rody (docs/design/war.md – Začátek války, Ochrana nového hráče, Konec války).
// Válka je mezi dvěma **rody** (seřazená dvojice), mezi dvojicí smí běžet jediná aktivní.

export type WarHow = 'declared' | 'ambush';
export type WarStatus = 'active' | 'peace' | 'quiet' | 'extinct';

export interface War {
  id: string;
  /** Dvojice rodů, seřazená podle id (jednoznačný klíč). */
  houses: [string, string];
  startedAt: Date;
  startedDay: number;
  how: WarHow;
  status: WarStatus;
  /** Herní den posledního střetu (u opovědi den opovědi) – podle něj válka utichne. */
  lastClashDay: number;
  endedAt: Date | null;
}

export type NewWar = Pick<War, 'startedAt' | 'startedDay' | 'how'> & {
  houses: readonly [string, string];
};

/** Seřazená dvojice rodů – klíč války. */
export function warPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Druhá strana války z pohledu rodu `houseId`. */
export function warOpponent(war: War, houseId: string): string {
  return war.houses[0] === houseId ? war.houses[1] : war.houses[0];
}

/** Operace nad válkami uvnitř transakce jednání (účinek přijetí požadavku). */
export interface WarTx {
  /** Aktivní válka mezi dvojicí (v libovolném pořadí), nebo null. */
  activeBetween(a: string, b: string): Promise<War | null>;
  /** Ukončí aktivní válku; false, pokud už aktivní není (souběh). */
  end(id: string, status: Exclude<WarStatus, 'active'>, at: Date): Promise<boolean>;
}

/** Port repozitáře válek. */
export interface WarRepository extends WarTx {
  /** Založí válku; dvojice už aktivní má → vrátí tu existující (`created: false`, i při souběhu). */
  start(input: NewWar): Promise<{ war: War; created: boolean }>;
  /** Aktivní války rodu. */
  activeOf(houseId: string): Promise<War[]>;
  /** Všechny aktivní války (úloha světa `quietWars`). */
  listActive(): Promise<War[]>;
  /** Zapíše střet v herní den `day` (jen dopředu). */
  touchClash(id: string, day: number): Promise<void>;
  /** Ukončí všechny aktivní války rodu jako `extinct` (rod vymřel). */
  extinctOf(houseId: string, at: Date): Promise<number>;
  /** Čas prvního vlastního útoku nebo opovědi rodu (ukončí ochranu nováčka), null – dosud žádný. */
  ownAttackAt(houseId: string): Promise<Date | null>;
  /** Zapíše, že rod dostal upozornění na konec ochrany; true jen poprvé. */
  claimProtectionNotice(houseId: string, at: Date): Promise<boolean>;
  /** Zapíše vlastní útok rodu; platí první (další se zahodí). */
  markAttack(houseId: string, at: Date): Promise<void>;
}
