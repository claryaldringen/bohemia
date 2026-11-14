import { describe, expect, it, vi } from 'vitest';
import type { PlayerNotice } from '@bohemia/game';
import {
  accusativeOf,
  alarmNoticeVillage,
  mergeNoticeLines,
  noticeOpener,
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
    const faith = notice({ kind: 'christianity-known', payload: { year: 700 } });
    expect(playerNoticeLine(faith).text).toBe('Rod se dozvěděl o novém Bohu.');
    expect(noticePanel('christianity-known')).toBeNull();
    const ending = notice({ kind: 'protection-ending', payload: {} });
    expect(playerNoticeLine(ending).text).toBe('Ochrana končí za 1 den.');
    const back = notice({ kind: 'campaign-returned', payload: { reason: 'supplies' } });
    expect(playerNoticeLine(back).text).toBe('Vojsko se vrátilo – došlo jídlo.');
    // vojvoda napadené vsi se vzdal (war.md – Hráč ve vsi a mimo ni)
    const yielded = notice({ kind: 'campaign-returned', payload: { reason: 'yielded' } });
    expect(playerNoticeLine(yielded).text).toBe('Vojsko se vrátilo i se zajatým vojvodou.');
    expect(noticePanel('campaign-returned')).toBe('war');
    const apart = notice({ kind: 'campaign-disbanded', payload: { campaignId: 'c1' } });
    expect(playerNoticeLine(apart).text).toBe('Výprava se rozpadla.');
    expect(noticePanel('campaign-disbanded')).toBe('war');
  });

  it('ves se vzdala (Začít znovu obránce) – jméno vsi, panel války', () => {
    const payload = { villageId: 'v1', name: 'Lhota', campaignId: 'c1' };
    const yielded = notice({ kind: 'village-surrendered', payload });
    expect(playerNoticeLine(yielded).text).toBe('Lhota se vzdala a připadla ti.');
    const nameless = notice({ kind: 'village-surrendered', payload: {} });
    expect(playerNoticeLine(nameless).text).toBe('Ves se vzdala a připadla ti.');
    expect(noticePanel('village-surrendered')).toBe('war');
  });

  it('návrat vojvody z výjezdu – jméno vojvody, panel zatím žádný', () => {
    const back = notice({
      kind: 'journey-returned',
      payload: { journeyId: 'j1', leader: 'Bořivoj' },
    });
    expect(playerNoticeLine(back).text).toBe('Bořivoj se vrátil.');
    expect(playerNoticeLine(notice({ kind: 'journey-returned', payload: {} })).text).toBe(
      'Vojvoda se vrátil.',
    );
    expect(noticePanel('journey-returned')).toBeNull();
  });

  it('x, panel války', () => {
    const alert = notice({ kind: 'foreign-army', payload: { villageId: 'v-1', name: 'Kněžice' } });
    expect(playerNoticeLine(alert).text).toBe('Cizí vojsko u vsi Kněžice!');
    expect(noticePanel('foreign-army')).toBe('war');
  });

  it('varování a útěk do hradiště – texty a panel války (war.md, plán 2026-11-09 – Ú1)', () => {
    const text = (kind: PlayerNotice['kind'], payload: Record<string, unknown>): string =>
      playerNoticeLine(notice({ kind, payload })).text;
    expect(text('army-warned', { name: 'Kněžice' })).toBe(
      'Vesničan spatřil cizí vojsko u vsi Kněžice!',
    );
    expect(text('army-warned', {})).toBe('Vesničan spatřil cizí vojsko!');
    expect(text('refuge-arrived', { name: 'Kněžice', hostName: 'Lhota' })).toBe(
      'Uprchlíci ze vsi Kněžice došli do vsi Lhota.',
    );
    expect(text('refuge-arrived', { name: 'Kněžice' })).toBe(
      'Uprchlíci ze vsi Kněžice došli do hradiště.',
    );
    expect(text('refuge-caught', { name: 'Kněžice' })).toBe(
      'Uprchlíci ze vsi Kněžice byli dostiženi.',
    );
    expect(text('messenger-caught', {})).toBe('Posel byl chycen.');
    for (const kind of [
      'army-warned',
      'refuge-arrived',
      'refuge-caught',
      'messenger-caught',
    ] as const) {
      expect(noticePanel(kind)).toBe('war');
      // klik otevře panel dvorce vsi (Úloha 12 – data pro Úlohu 13)
      expect(alarmNoticeVillage(notice({ kind, payload: { villageId: 'v1' } }))).toBe('v1');
    }
    expect(alarmNoticeVillage(notice({ kind: 'foreign-army', payload: { villageId: 'v1' } }))).toBe(
      null,
    );
  });

  it('klik na varování otevře panel dvorce vsi, jiné upozornění svůj panel (Úloha 13)', () => {
    const village = vi.fn();
    const panel = vi.fn();
    noticeOpener(notice({ kind: 'army-warned', payload: { villageId: 'v7' } }), {
      village,
      panel,
    })?.();
    expect(village).toHaveBeenCalledWith('v7');
    expect(panel).not.toHaveBeenCalled();
    noticeOpener(notice({ kind: 'war-declared', payload: {} }), { village, panel })?.();
    expect(panel).toHaveBeenCalledWith('war');
    expect(village).toHaveBeenCalledTimes(1);
    // varování bez vsi v datech – panel války jako dřív
    noticeOpener(notice({ kind: 'refuge-caught', payload: {} }), { village, panel })?.();
    expect(panel).toHaveBeenLastCalledWith('war');
    expect(noticeOpener(notice({ kind: 'player-succession' }), { village, panel })).toBeUndefined();
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
