import { describe, expect, it } from 'vitest';
import type { PlayerNotice } from '@bohemia/game';
import {
  mergeNoticeLines,
  noticePanel,
  wantsPlayerNotices,
  playerNoticeLine,
} from '../player-notices';

const notice = (over: Partial<PlayerNotice> = {}): PlayerNotice => ({
  id: 5,
  playerId: 'p1',
  kind: 'invite-accepted',
  payload: { name: 'Ctibor' },
  gameDay: 10,
  createdAt: new Date('2026-11-05T10:00:00Z'),
  readAt: null,
  ...over,
});

describe('playerNoticeLine', () => {
  it('složí český text a záporné id (nesráží se s vesnickými)', () => {
    const line = playerNoticeLine(notice());
    expect(line).toMatchObject({ id: -5, kind: 'invite-accepted', tone: 'info' });
    expect(line.text).toBe('Ctibor přijal pozvánku – je tvým vazalem.');
    expect(line.text).not.toContain('—');
  });

  it('bez jména použije náhradní oslovení', () => {
    expect(playerNoticeLine(notice({ kind: 'invitee-played', payload: {} })).text).toBe(
      'Pozvaný se rozehrál.',
    );
  });

  it('každý druh míří na panel (zatím jen Rod a vazalové)', () => {
    expect(noticePanel('invite-accepted')).toBe('house');
    expect(noticePanel('invitee-played')).toBe('house');
  });
});

describe('mergeNoticeLines', () => {
  const village = { id: 1, kind: 'full-household', tone: 'info', text: 'Ves' } as const;

  it('slije v pořadí příchodu, bez duplicit, nejvýš max', () => {
    const a = playerNoticeLine(notice({ id: 1 }));
    const b = playerNoticeLine(notice({ id: 2 }));
    const merged = mergeNoticeLines([village], [a, b], 10);
    expect(merged.map((n) => n.id)).toEqual([1, -1, -2]);
    expect(mergeNoticeLines(merged, [a], 10)).toEqual(merged);
    expect(mergeNoticeLines(merged, [], 2).map((n) => n.id)).toEqual([-1, -2]);
  });
});

describe('wantsPlayerNotices', () => {
  it('chce upozornění jen s withNotices: true; playerId ze vstupu se nečte', () => {
    expect(wantsPlayerNotices({ villageId: 'v1', withNotices: true, playerId: 'cizi' })).toBe(true);
    expect(wantsPlayerNotices({ villageId: 'v1', withNotices: 'true' })).toBe(false);
    expect(wantsPlayerNotices({ villageId: 'v1', playerId: 'cizi' })).toBe(false);
    expect(wantsPlayerNotices(null)).toBe(false);
  });
});
