import { describe, expect, it } from 'vitest';
import { newNotices, villageNotices } from '../village-notices';
import type { VillageView } from '../village-view';

const view = (overrides: Partial<VillageView> = {}): VillageView => ({
  name: 'Libice',
  dayIndex: 1000,
  people: { children: 2, adults: 2, elders: 0 },
  households: [],
  storesKg: 800,
  applesKg: 0,
  meatKg: 0,
  hayKg: 0,
  diet: { energy: 1, diversity: 0.8, shares: { grain: 1, meat: 0, fruit: 0 } },
  livestock: {
    herds: { sheep: 3, goat: 1, pig: 2, cow: 1 },
    chickens: 2,
    oxen: 0,
    pastureHa: 50,
    grazingHa: 1.8,
    pigForestHa: 30,
    meatNeedKg: 187,
  },
  pens: [],
  woodLogs: 0,
  storesMonths: 17,
  satiation: 1,
  commonLaborPerDay: 1,
  fullHousehold: false,
  build: {
    zemnice: {
      laborManDays: 60,
      perHa: false,
      perSquare: false,
      upfront: [],
      blocked: null,
      affordable: true,
    },
    polozemnice: {
      laborManDays: 220,
      perHa: false,
      perSquare: false,
      upfront: [],
      blocked: null,
      affordable: true,
    },
    field: {
      laborManDays: 100,
      perHa: true,
      perSquare: false,
      upfront: [],
      blocked: null,
      affordable: true,
    },
    cemetery: {
      laborManDays: 10,
      perHa: false,
      perSquare: true,
      upfront: [],
      blocked: null,
      affordable: true,
    },
    orchard: {
      laborManDays: 80,
      perHa: true,
      perSquare: false,
      upfront: [],
      blocked: null,
      affordable: true,
    },
    idol: {
      laborManDays: 30,
      perHa: false,
      perSquare: false,
      upfront: [],
      blocked: null,
      affordable: true,
    },
    shrine: {
      laborManDays: 400,
      perHa: false,
      perSquare: false,
      upfront: [],
      blocked: null,
      affordable: true,
    },
    pen: {
      laborManDays: 40,
      perHa: false,
      perSquare: false,
      upfront: [{ resource: 'wood', amount: 6, missing: 0 }],
      blocked: null,
      affordable: true,
    },
  },
  constructions: [],
  fields: [],
  cemeteries: [],
  orchards: [],
  hungry: false,
  starving: false,
  constructionsStalled: false,
  happiness: { value: 50, target: 50, laborFactor: 1 },
  sacred: { oaks: [], groves: [], buildings: [] },
  extinct: null,
  gameOver: false,
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

describe('villageNotices – hlad a vymření', () => {
  it('lidé umírají hlady – upozornění před hladem', () => {
    expect(villageNotices(view({ hungry: true, starving: true, satiation: 0 }))).toEqual([
      { kind: 'starving', tone: 'warn', text: 'Lidé umírají hlady' },
      { kind: 'hungry', tone: 'warn', text: 'Ves hladoví' },
    ]);
  });

  it('vymřelá ves žádná upozornění nemá', () => {
    const extinct = { foundedYear: 512, extinctYear: 587, years: 74 };
    expect(villageNotices(view({ hungry: true, starving: true, extinct }))).toEqual([]);
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

describe('hřbitov je plný', () => {
  const cemetery = (built: boolean, freeGraves: number): VillageView['cemeteries'][number] => ({
    id: 1,
    squares: 1,
    built,
    progress: built ? 1 : 0.3,
    capacity: 56,
    graves: 56 - freeGraves,
    freeGraves,
    yearsLeft: null,
  });

  it('jen když žádný hotový hřbitov nemá volný hrob – bez hřbitova nic', () => {
    const kinds = (cemeteries: VillageView['cemeteries']): string[] =>
      villageNotices(view({ cemeteries })).map((n) => n.kind);
    expect(kinds([])).toEqual([]);
    expect(kinds([cemetery(true, 0)])).toEqual(['cemetery-full']);
    expect(kinds([cemetery(true, 0), cemetery(true, 3)])).toEqual([]);
    // rozestavěný hřbitov mrtvé nepřijme – hotové jsou plné
    expect(kinds([cemetery(true, 0), cemetery(false, 56)])).toEqual(['cemetery-full']);
    expect(kinds([cemetery(false, 56)])).toEqual([]);
    expect(villageNotices(view({ cemeteries: [cemetery(true, 0)] }))[0]?.text).toBe(
      'Hřbitov je plný',
    );
  });
});

describe('newNotices – posvátná místa', () => {
  it('přibude posvátný dub nebo háj – fakt jednou, při prvním načtení nic', () => {
    const before = view();
    const after = view({
      sacred: {
        oaks: [{ id: 7, happiness: 5 }],
        groves: [{ id: 9, oaks: 12, squares: 9, happiness: 13 }],
        buildings: [],
      },
    });
    expect(newNotices(null, after)).toEqual([]);
    expect(newNotices(before, after)).toEqual([
      { kind: 'sacred-oak', tone: 'info', text: 'Vesničané ušetřili posvátný dub' },
      { kind: 'sacred-grove', tone: 'info', text: 'Vesničané ušetřili dubový háj' },
    ]);
    expect(newNotices(after, after)).toEqual([]);
  });
});

describe('newNotices – porážka a spřežení (diet.md, oxen.md)', () => {
  const entry = (
    day: number,
    kind: VillageView['chronicle'][number]['kind'],
    text: string,
    kg?: number,
  ): VillageView['chronicle'][number] => ({
    day,
    kind,
    dateLabel: '',
    text,
    ...(kg === undefined ? {} : { kg }),
  });

  it('nové události kroniky od minulého pohledu – fakt jednou za druh, v pořadí, jak se staly', () => {
    const before = view({ dayIndex: 1000 });
    const after = view({
      dayIndex: 1010,
      chronicle: [
        entry(1009, 'ox-died', 'Přes zimu chybělo seno – vůl uhynul a spřežení se rozpadlo.'),
        entry(1008, 'ox-died', 'Přes zimu chybělo seno – tele ve výcviku uhynulo.'),
        entry(1005, 'slaughter', 'Podzimní porážka: 1 250 kg masa.', 1250),
        entry(1002, 'team-ready', 'Spřežení volů je vycvičené – orá rádlem.'),
        entry(1000, 'team-retired', 'Spřežení dosloužilo – voli zestárli a šli na maso.'),
      ],
    });
    expect(newNotices(before, after)).toEqual([
      { kind: 'team-ready', tone: 'info', text: 'Spřežení je vycvičené' },
      { kind: 'slaughter', tone: 'info', text: 'Podzimní porážka – 1 250 kg masa' },
      { kind: 'ox-died', tone: 'warn', text: 'Vůl uhynul – chybělo seno' },
    ]);
    // stejný pohled podruhé nic, první načtení nic
    expect(newNotices(after, after)).toEqual([]);
    expect(newNotices(null, after)).toEqual([]);
  });

  it('spřežení dosloužilo – fakt', () => {
    const after = view({
      dayIndex: 1003,
      chronicle: [entry(1001, 'team-retired', 'Spřežení dosloužilo.')],
    });
    expect(newNotices(view(), after)).toEqual([
      { kind: 'team-retired', tone: 'info', text: 'Spřežení dosloužilo' },
    ]);
  });
});
