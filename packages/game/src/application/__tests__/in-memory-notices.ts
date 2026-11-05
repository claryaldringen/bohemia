import type { NewPlayerNotice, NoticeRepository, PlayerNotice } from '../notices';

/** Repozitář upozornění v paměti; čas dodává `clock` (v testech pevný). */
export class InMemoryNotices implements NoticeRepository {
  readonly notices: PlayerNotice[] = [];
  private nextId = 1;

  constructor(private readonly clock: () => Date = () => new Date(0)) {}

  async post(notice: NewPlayerNotice): Promise<void> {
    await Promise.resolve();
    this.notices.push({ ...notice, id: this.nextId++, createdAt: this.clock(), readAt: null });
  }

  async after(playerId: string, afterId: number, limit: number): Promise<PlayerNotice[]> {
    await Promise.resolve();
    return this.notices
      .filter((n) => n.playerId === playerId && n.id > afterId)
      .sort((a, b) => a.id - b.id)
      .slice(0, limit);
  }

  async markRead(playerId: string, upToId: number): Promise<void> {
    await Promise.resolve();
    for (const n of this.notices) {
      if (n.playerId === playerId && n.id <= upToId && n.readAt === null) n.readAt = this.clock();
    }
  }
}
