/** Odkaz na osobu ve vsi: ves a číslo osoby v jejím stavu. */
export interface PersonRef {
  villageId: string;
  personId: number;
}

/**
 * Rod – záznam hráčova (`player`) nebo NPC (`npc`) rodu. Hráč má nejvýš jeden živý rod;
 * začít znovu = rod skončí (`endedAt`, `endedDay`) a vznikne nový. `lord` = hlava rodu.
 */
export interface House {
  id: string;
  playerId: string | null;
  kind: 'player' | 'npc';
  createdAt: Date;
  endedAt: Date | null;
  endedDay: number | null;
  lord: PersonRef | null;
  /** Naposledy zapsaný senior rodu (seniorate.md – Seniorát); null před prvním zápisem. */
  senior: PersonRef | null;
}

/** Port repozitáře rodů. */
export interface HouseRepository {
  /** Živý rod hráče, nebo null. */
  activeOf(playerId: string): Promise<House | null>;
  byId(id: string): Promise<House | null>;
  /**
   * Založí rod. Hráč, který už živý rod má, dostane ten existující (souběžná volání dají
   * jediný rod).
   */
  create(input: { playerId: string | null; kind: House['kind']; createdAt: Date }): Promise<House>;
  /** Ukončí rod; true jen když rod byl živý (z více souběžných volání uspěje jedno). */
  end(houseId: string, at: Date, day: number): Promise<boolean>;
  /** Zapíše, nebo (null) vymaže hlavu rodu. */
  setLord(houseId: string, lord: PersonRef | null): Promise<void>;
  /** Zapíše, nebo (null) vymaže naposledy hlášeného seniora rodu. */
  setSenior(houseId: string, senior: PersonRef | null): Promise<void>;
}
