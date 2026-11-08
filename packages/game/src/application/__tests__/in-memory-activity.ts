import type { ActivityRepository } from '../activity';

/** Aktivní dny v paměti. */
export class InMemoryActivity implements ActivityRepository {
  private readonly days = new Set<string>();

  async record(playerId: string, pragueDate: string): Promise<void> {
    this.days.add(`${playerId}|${pragueDate}`);
  }

  /** Poslední aktivní den hráče (`YYYY-MM-DD`), null – žádný (pro frontu workeru v paměti). */
  latest(playerId: string): string | null {
    const days = [...this.days]
      .filter((d) => d.startsWith(`${playerId}|`))
      .map((d) => d.slice(playerId.length + 1))
      .sort();
    return days.at(-1) ?? null;
  }

  async distinctDays(playerId: string): Promise<number> {
    return [...this.days].filter((d) => d.startsWith(`${playerId}|`)).length;
  }
}
