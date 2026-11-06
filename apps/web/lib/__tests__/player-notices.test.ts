import { describe, expect, it } from 'vitest';
import type { PlayerNotice } from '@bohemia/game';
import {
  accusativeOf,
  mergeNoticeLines,
  noticePanel,
  isVillageNone,
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

  it('nástupnictví hráče: jména zemřelého a nového muže, jinak náhradní text', () => {
    expect(
      playerNoticeLine(
        notice({ kind: 'player-succession', payload: { deadName: 'Bořivoj', newName: 'Ctibor' } }),
      ).text,
    ).toBe('Bořivoj zemřel. Hraješ za Ctibora.');
    expect(playerNoticeLine(notice({ kind: 'player-succession', payload: {} })).text).toBe(
      'Tvůj muž zemřel. Hraješ za dalšího muže rodu.',
    );
  });

  it('4. pád jmen rodu', () => {
    expect(['Ctibor', 'Vojta', 'Zdeněk', 'Dobeš', 'Hostivít'].map(accusativeOf)).toEqual([
      'Ctibora',
      'Vojtu',
      'Zdeňka',
      'Dobeše',
      'Hostivíta',
    ]);
  });

  it('opověď války a konec ochrany mají text a míří na panel války', () => {
    const declared = notice({ kind: 'war-declared', payload: { name: 'Bořivoj' } });
    expect(playerNoticeLine(declared).text).toBe('Bořivoj opověděl válku.');
    expect(noticePanel('war-declared')).toBe('war');
    const ending = notice({ kind: 'protection-ending', payload: {} });
    expect(playerNoticeLine(ending).text).toBe('Ochrana končí za 1 den.');
    const back = notice({ kind: 'campaign-returned', payload: { reason: 'supplies' } });
    expect(playerNoticeLine(back).text).toBe('Vojsko se vrátilo – došlo jídlo.');
    expect(noticePanel('campaign-returned')).toBe('war');
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

describe('isVillageNone', () => {
  it('pozná odpověď hráče bez vsi s upozorněními, ostatní výsledky ne', () => {
    expect(isVillageNone({ noVillage: true, playerNotices: [] })).toBe(true);
    expect(isVillageNone(null)).toBe(false);
    expect(isVillageNone({ unchanged: true })).toBe(false);
    expect(isVillageNone({ error: 'x' })).toBe(false);
  });
});
