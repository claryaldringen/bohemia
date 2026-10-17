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
  fullHousehold: false,
  build: {
    zemnice: { laborManDays: 60, perHa: false, upfront: [], affordable: true },
    polozemnice: { laborManDays: 220, perHa: false, upfront: [], affordable: true },
    field: { laborManDays: 40, perHa: true, upfront: [], affordable: true },
  },
  constructions: [],
  fields: [],
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

  it('hlad, stojící stavby a plná domácnost – problémy první, jen krátký fakt', () => {
    const notices = villageNotices(
      view({ hungry: true, satiation: 0.72, constructionsStalled: true, fullHousehold: true }),
    );
    expect(notices).toEqual([
      { kind: 'hungry', tone: 'warn', text: 'Ves hladoví' },
      { kind: 'stalled', tone: 'warn', text: 'Stavby stojí' },
      { kind: 'full-household', tone: 'info', text: 'Domácnost je plná' },
    ]);
  });
});

describe('newNotices', () => {
  it('ohlásí jen nově vzniklá upozornění, trvající podruhé ne', () => {
    const calm = view();
    const hungry = view({ hungry: true, satiation: 0.8 });
    expect(newNotices(calm, hungry).map((n) => n.kind)).toEqual(['hungry']);
    expect(newNotices(hungry, view({ hungry: true, satiation: 0.6 }))).toEqual([]);
    const both = view({ hungry: true, fullHousehold: true });
    expect(newNotices(hungry, both).map((n) => n.kind)).toEqual(['full-household']);
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
