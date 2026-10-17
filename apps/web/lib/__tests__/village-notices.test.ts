import { describe, expect, it } from 'vitest';
import { newNotices, villageNotices } from '../village-notices';
import type { VillageView } from '../village-view';

const view = (overrides: Partial<VillageView> = {}): VillageView => ({
  name: 'Libice',
  dayIndex: 1000,
  people: { children: 2, adults: 2, elders: 0 },
  households: [],
  storesKg: 800,
  storesMonths: 17,
  satiation: 1,
  commonLaborPerDay: 1,
  canBuildDwelling: { ok: false, reason: 'Zatím ne.' },
  costs: { zemnice: 60, polozemnice: 220, fieldPerHa: 40 },
  constructions: [],
  hungry: false,
  constructionsStalled: false,
  scene: { dwellings: [], fields: [] },
  chronicle: [],
  ...overrides,
});

describe('villageNotices', () => {
  it('klidná ves nemá žádná upozornění', () => {
    expect(villageNotices(view())).toEqual([]);
  });

  it('hlad, stojící stavby a plná domácnost – problémy první', () => {
    const notices = villageNotices(
      view({
        hungry: true,
        satiation: 0.72,
        constructionsStalled: true,
        canBuildDwelling: { ok: true, reason: null },
      }),
    );
    expect(notices.map((n) => n.kind)).toEqual(['hungry', 'stalled', 'can-build']);
    expect(notices[0]?.text).toMatch(/nasycení 72 %/);
    expect(notices[2]?.tone).toBe('good');
  });
});

describe('newNotices', () => {
  it('ohlásí jen nově vzniklá upozornění, trvající podruhé ne', () => {
    const calm = view();
    const hungry = view({ hungry: true, satiation: 0.8 });
    expect(newNotices(calm, hungry).map((n) => n.kind)).toEqual(['hungry']);
    expect(newNotices(hungry, view({ hungry: true, satiation: 0.6 }))).toEqual([]);
    const both = view({ hungry: true, canBuildDwelling: { ok: true, reason: null } });
    expect(newNotices(hungry, both).map((n) => n.kind)).toEqual(['can-build']);
  });

  it('po skončení a novém začátku stavu ohlásí znovu', () => {
    const calm = view();
    const stalled = view({ constructionsStalled: true });
    expect(newNotices(calm, stalled)).toHaveLength(1);
    expect(newNotices(stalled, calm)).toEqual([]);
    expect(newNotices(calm, stalled)).toHaveLength(1);
  });

  it('první pohled na ves nic neohlásí', () => {
    expect(newNotices(null, view({ hungry: true }))).toEqual([]);
  });
});
