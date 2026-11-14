import {
  NOTICES_KEPT_PER_PLAYER,
  type NewPlayerNotice,
  type NoticeRepository,
  type PlayerNotice,
} from '../notices';

/** Repozitář upozornění v paměti; čas dodává `clock` (v testech pevný). */
export class InMemoryNotices implements NoticeRepository {
  readonly notices: PlayerNotice[] = [];
  private nextId = 1;
  /** Klíče `ref` zapsaných upozornění (id → hráč|ref); zmizí s ořezanou historií jako řádek v DB. */
  private readonly keys = new Map<number, string>();

  constructor(private readonly clock: () => Date = () => new Date(0)) {}

  async post(notice: NewPlayerNotice): Promise<void> {
    await Promise.resolve();
    const { ref, ...rest } = notice;
    const key = ref === undefined ? null : `${notice.playerId}|${ref}`;
    if (key !== null && [...this.keys.values()].includes(key)) return;
    const id = this.nextId++;
    if (key !== null) this.keys.set(id, key);
    this.notices.push({ ...rest, id, createdAt: this.clock(), readAt: null });
    const mine = this.notices
      .filter((n) => n.playerId === notice.playerId)
      .sort((a, b) => b.id - a.id);
    for (const old of mine.slice(NOTICES_KEPT_PER_PLAYER)) {
      this.notices.splice(this.notices.indexOf(old), 1);
      this.keys.delete(old.id);
    }
  }

  async page(playerId: string, beforeId: number | null, limit: number): Promise<PlayerNotice[]> {
    await Promise.resolve();
    return this.notices
      .filter((n) => n.playerId === playerId && (beforeId === null || n.id < beforeId))
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map((n) => ({ ...n }));
  }

  async after(playerId: string, afterId: number, limit: number): Promise<PlayerNotice[]> {
    await Promise.resolve();
    return this.notices
      .filter((n) => n.playerId === playerId && n.id > afterId)
      .sort((a, b) => a.id - b.id)
      .slice(0, limit);
  }

  async takeUnread(playerId: string, limit: number): Promise<PlayerNotice[]> {
    await Promise.resolve();
    const taken = this.notices
      .filter((n) => n.playerId === playerId && n.readAt === null)
      .sort((a, b) => a.id - b.id)
      .slice(0, limit);
    for (const n of taken) n.readAt = this.clock();
    return taken.map((n) => ({ ...n }));
  }

  async markRead(playerId: string, upToId: number): Promise<void> {
    await Promise.resolve();
    for (const n of this.notices) {
      if (n.playerId === playerId && n.id <= upToId && n.readAt === null) n.readAt = this.clock();
    }
  }
}
