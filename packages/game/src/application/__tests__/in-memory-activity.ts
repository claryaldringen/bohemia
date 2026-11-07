import type { ActivityRepository } from '../activity';

/** Aktivní dny v paměti. */
export class InMemoryActivity implements ActivityRepository {
  private readonly days = new Set<string>();

  async record(playerId: string, pragueDate: string): Promise<void> {
    this.days.add(`${playerId}|${pragueDate}`);
  }

  async distinctDays(playerId: string): Promise<number> {
    return [...this.days].filter((d) => d.startsWith(`${playerId}|`)).length;
  }
}
