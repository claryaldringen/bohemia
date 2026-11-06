import type { House, HouseRepository, PendingDeparture, PersonRef } from '../houses';

/** Repozitář rodů v paměti – `create` a `end` se chovají atomicky jako databáze (unikátní index). */
export class InMemoryHouses implements HouseRepository {
  readonly houses: House[] = [];
  private nextId = 1;

  async activeOf(playerId: string): Promise<House | null> {
    return this.houses.find((h) => h.playerId === playerId && this.alive(h)) ?? null;
  }

  async byId(id: string): Promise<House | null> {
    return this.houses.find((h) => h.id === id) ?? null;
  }

  async create(input: {
    playerId: string | null;
    kind: House['kind'];
    createdAt: Date;
  }): Promise<House> {
    await Promise.resolve();
    if (input.kind === 'player' && input.playerId !== null) {
      const existing = this.houses.find((h) => h.playerId === input.playerId && this.alive(h));
      if (existing) return existing;
    }
    const house: House = {
      id: `house-${this.nextId++}`,
      playerId: input.playerId,
      kind: input.kind,
      createdAt: input.createdAt,
      endedAt: null,
      endedDay: null,
      lord: null,
      senior: null,
      successionDay: null,
      pendingDeparture: null,
      lastEnnobleYear: null,
    };
    this.houses.push(house);
    return house;
  }

  async end(houseId: string, at: Date, day: number): Promise<boolean> {
    await Promise.resolve();
    const house = this.houses.find((h) => h.id === houseId);
    if (!house || !this.alive(house)) return false;
    house.endedAt = at;
    house.endedDay = day;
    return true;
  }

  async setLord(houseId: string, lord: PersonRef | null): Promise<void> {
    const house = this.houses.find((h) => h.id === houseId);
    if (house) house.lord = lord;
  }

  async setSenior(houseId: string, senior: PersonRef | null): Promise<void> {
    const house = this.houses.find((h) => h.id === houseId);
    if (house) house.senior = senior;
  }

  async commitSuccession(
    houseId: string,
    input: { deathDay: number; lord: PersonRef; pendingDeparture: PendingDeparture | null },
  ): Promise<boolean> {
    await Promise.resolve();
    const house = this.houses.find((h) => h.id === houseId);
    if (!house || (house.successionDay !== null && house.successionDay >= input.deathDay)) {
      return false;
    }
    house.successionDay = input.deathDay;
    house.lord = input.lord;
    house.pendingDeparture = input.pendingDeparture;
    return true;
  }

  async clearPendingDeparture(houseId: string, sonId: number): Promise<boolean> {
    await Promise.resolve();
    const house = this.houses.find((h) => h.id === houseId);
    if (house?.pendingDeparture?.sonId !== sonId) return false;
    house.pendingDeparture = null;
    return true;
  }

  async claimEnnoble(houseId: string, year: number): Promise<boolean> {
    await Promise.resolve();
    const house = this.houses.find((h) => h.id === houseId);
    if (!house || (house.lastEnnobleYear !== null && house.lastEnnobleYear >= year)) return false;
    house.lastEnnobleYear = year;
    return true;
  }

  private alive(house: House): boolean {
    return house.endedAt === null;
  }
}
