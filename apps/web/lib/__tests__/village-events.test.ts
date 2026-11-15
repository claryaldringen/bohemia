import { describe, expect, it } from 'vitest';
import type { VillageView } from '../village-view';
import { villageEventIsNews } from '../village-events';

// Událost `village` s verzí, kterou prohlížeč už má, se zahodí (server-events.md – Klient; plán
// 2026-11-15 – Rozhodnutí 5) – vlastní akce tak nevyvolá druhý dotaz.

const view = (versions?: Record<string, number>): VillageView =>
  ({ id: 'v1', ...(versions ? { versions } : {}) }) as unknown as VillageView;

describe('villageEventIsNews', () => {
  it('verze, kterou pohled zná, není novinka; novější ano', () => {
    expect(villageEventIsNews(view({ v1: 7 }), { villageId: 'v1', version: 7 })).toBe(false);
    expect(villageEventIsNews(view({ v1: 7 }), { villageId: 'v1', version: 6 })).toBe(false);
    expect(villageEventIsNews(view({ v1: 7 }), { villageId: 'v1', version: 8 })).toBe(true);
  });

  it('jiná ves hráče: podle její verze; ves, kterou pohled nezná, je novinka', () => {
    const shown = view({ v1: 7, v2: 3 });
    expect(villageEventIsNews(shown, { villageId: 'v2', version: 3 })).toBe(false);
    expect(villageEventIsNews(shown, { villageId: 'v2', version: 4 })).toBe(true);
    expect(villageEventIsNews(shown, { villageId: 'v3', version: 1 })).toBe(true);
  });

  it('změna sídla (`villageId` null) je vždy novinka', () => {
    expect(villageEventIsNews(view({ v1: 7 }), { villageId: null, version: null })).toBe(true);
    expect(villageEventIsNews(view({ v1: 7 }), { villageId: 'v1', version: null })).toBe(true);
  });

  it('pohled bez verzí (spravovaná ves) i bez pohledu je novinka', () => {
    expect(villageEventIsNews(view(), { villageId: 'v1', version: 7 })).toBe(true);
    expect(villageEventIsNews(null, { villageId: 'v1', version: 7 })).toBe(true);
  });
});
