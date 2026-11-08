import { describe, expect, it } from 'vitest';
import { dayIndexOf, type PlayerNotice } from '@bohemia/game';
import {
  NOTICE_PAGE_SIZE,
  appendOlderNotices,
  mergeNewestNotices,
  newestNoticeId,
  noticePage,
  parseNoticeAsk,
} from '../notice-page';

function notice(id: number): PlayerNotice {
  return {
    id,
    playerId: 'p1',
    kind: 'invitee-played',
    payload: { name: `Rod ${id}` },
    gameDay: dayIndexOf({ year: 507, month: 3, day: 12 }),
    createdAt: new Date(0),
    readAt: null,
  };
}

/** Řádky repozitáře: nejnovější první, id od `from` dolů. */
const rows = (from: number, count: number): PlayerNotice[] =>
  Array.from({ length: count }, (_, i) => notice(from - i));

describe('parseNoticeAsk', () => {
  it('bez before = od nejnovějšího, neplatné vstupy zamítne', () => {
    expect(parseNoticeAsk({})).toEqual({ before: null });
    expect(parseNoticeAsk({ before: 12 })).toEqual({ before: 12 });
    expect(parseNoticeAsk({ before: -1 })).toBeNull();
    expect(parseNoticeAsk({ before: '5' })).toBeNull();
    expect(parseNoticeAsk(null)).toBeNull();
  });
});

describe('noticePage', () => {
  it('ukáže text a herní datum, bez dalších řádků nemá starší', () => {
    const page = noticePage(rows(3, 3));
    expect(page.items.map((n) => n.id)).toEqual([3, 2, 1]);
    expect(page.items[0]).toMatchObject({
      text: 'Rod 3 se rozehrál.',
      dateLabel: '12. března 507',
    });
    expect(page.olderThan).toBeNull();
  });

  it('řádek navíc jen říká, že starší jsou; stránka ho neukáže', () => {
    const page = noticePage(rows(100, NOTICE_PAGE_SIZE + 1));
    expect(page.items).toHaveLength(NOTICE_PAGE_SIZE);
    expect(page.olderThan).toBe(100 - NOTICE_PAGE_SIZE + 1);
    expect(noticePage(rows(100, NOTICE_PAGE_SIZE)).olderThan).toBeNull();
  });
});

describe('spojování stránek', () => {
  it('starší stránka se připojí bez duplicit', () => {
    const first = noticePage(rows(100, NOTICE_PAGE_SIZE + 1));
    const older = noticePage(rows(first.olderThan! - 1, 5));
    const all = appendOlderNotices(first, older);
    expect(all.items).toHaveLength(NOTICE_PAGE_SIZE + 5);
    expect(all.olderThan).toBeNull();
    expect(appendOlderNotices(all, older).items).toHaveLength(NOTICE_PAGE_SIZE + 5);
  });

  it('nová první stránka nahradí tytéž a načtené starší nechá', () => {
    const shown = appendOlderNotices(
      noticePage(rows(100, NOTICE_PAGE_SIZE + 1)),
      noticePage(rows(69, 5)),
    );
    const fresh = noticePage(rows(102, 10));
    const merged = mergeNewestNotices(shown, fresh);
    expect(merged.items.map((n) => n.id).slice(0, 3)).toEqual([102, 101, 100]);
    expect(new Set(merged.items.map((n) => n.id)).size).toBe(merged.items.length);
    expect(merged.items.at(-1)!.id).toBe(65);
    expect(newestNoticeId(merged)).toBe(102);
    expect(newestNoticeId(null)).toBeNull();
  });
});
