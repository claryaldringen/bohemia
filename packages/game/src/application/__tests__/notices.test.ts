import { describe, expect, it } from 'vitest';
import { InMemoryNotices } from './in-memory-notices';

const base = { payload: {}, gameDay: 1 } as const;

describe('NoticeRepository (v paměti)', () => {
  it('after vrací jen upozornění daného hráče, rostoucí podle id, nejvýš limit', async () => {
    const repo = new InMemoryNotices();
    await repo.post({ ...base, playerId: 'a', kind: 'invite-accepted' });
    await repo.post({ ...base, playerId: 'b', kind: 'invite-accepted' });
    await repo.post({ ...base, playerId: 'a', kind: 'invitee-played' });
    await repo.post({ ...base, playerId: 'a', kind: 'invitee-played' });
    const all = await repo.after('a', 0, 10);
    expect(all.map((n) => n.playerId)).toEqual(['a', 'a', 'a']);
    expect(all.map((n) => n.id)).toEqual([...all.map((n) => n.id)].sort((x, y) => x - y));
    expect(await repo.after('a', 0, 2)).toHaveLength(2);
    const later = await repo.after('a', all[0]!.id, 10);
    expect(later.map((n) => n.id)).toEqual(all.slice(1).map((n) => n.id));
  });

  it('markRead označí jen upozornění hráče do upToId', async () => {
    const now = new Date('2026-11-05T10:00:00Z');
    const repo = new InMemoryNotices(() => now);
    await repo.post({ ...base, playerId: 'a', kind: 'invite-accepted' });
    await repo.post({ ...base, playerId: 'b', kind: 'invite-accepted' });
    await repo.post({ ...base, playerId: 'a', kind: 'invitee-played' });
    await repo.markRead('a', 2);
    expect(repo.notices.map((n) => n.readAt)).toEqual([now, null, null]);
  });

  it('takeUnread vrátí nepřečtená daného hráče od nejstaršího, nejvýš limit, a označí je', async () => {
    const repo = new InMemoryNotices();
    await repo.post({ ...base, playerId: 'p1', kind: 'invite-accepted' });
    await repo.post({ ...base, playerId: 'p2', kind: 'invite-accepted' });
    await repo.post({ ...base, playerId: 'p1', kind: 'invitee-played' });
    await repo.post({ ...base, playerId: 'p1', kind: 'invitee-played' });
    const first = await repo.takeUnread('p1', 2);
    expect(first.map((n) => n.id)).toEqual([1, 3]);
    expect(first.every((n) => n.playerId === 'p1' && n.readAt !== null)).toBe(true);
    expect((await repo.takeUnread('p1', 2)).map((n) => n.id)).toEqual([4]);
    expect(await repo.takeUnread('p1', 2)).toEqual([]);
    expect((await repo.takeUnread('p2', 2)).map((n) => n.id)).toEqual([2]);
  });
});
