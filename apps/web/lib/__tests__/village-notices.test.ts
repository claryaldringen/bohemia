import { describe, expect, it } from 'vitest';
import { newNotices, otherVillageNotices, villageNotices } from '../village-notices';
import type { VillageListItem } from '../village-list';
import type { VillageView } from '../village-view';

const workshop = (laborManDays: number): VillageView['build']['potter'] => ({
  laborManDays,
  perHa: false,
  perSquare: false,
  upfront: [],
  blocked: null,
  affordable: true,
});

const view = (overrides: Partial<VillageView> = {}): VillageView => ({
  id: 'v-1',
  settlementId: 's-1',
  name: 'Libice',
  villages: [],
  relocation: { zemnice: workshop(60), polozemnice: workshop(220) },
  dayIndex: 1000,
  people: { children: 2, adults: 2, elders: 0 },
  households: [],
  storesKg: 800,
  applesKg: 0,
  meatKg: 0,
  legumesKg: 0,
  cheeseKg: 0,
  milkLPerDay: 0,
  hayKg: 0,
  diet: {
    energy: 1,
    protein: 0.55,
    diversity: 0.8,
    shares: { grain: 1, meat: 0, dairy: 0, eggs: 0, fruit: 0 },
  },
  livestock: {
    herds: { sheep: 3, goat: 1, pig: 2, cow: 1 },
    chickens: 2,
    oxen: 0,
    pastureHa: 50,
    grazingHa: 1.8,
    pigForestHa: 30,
    meatNeedKg: 187,
    legumeNeedKg: 0,
    milkLPerDay: 0,
    milkLPerYear: 0,
  },
  pens: [],
  roads: [],
  woodLogs: 0,
  crafts: {
    present: false,
    stocks: { charcoalKg: 0, toolsKg: 0, potteryKg: 0 },
    needs: { toolsKg: 6, potteryKg: 20 },
    coverage: { tools: 0, pottery: 0 },
    workshops: [],
  },
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
    potter: workshop(286),
    smith: workshop(286),
    burner: workshop(78),
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
  lastMarriageDay: null,
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

  it('svatba mezi domy – krátký fakt, jen když od minulého pohledu přibude', () => {
    const before = view({ lastMarriageDay: 900 });
    expect(newNotices(view(), before)).toEqual([
      { kind: 'marriage', tone: 'info', text: 'Svatba' },
    ]);
    expect(newNotices(before, view({ lastMarriageDay: 900 }))).toEqual([]);
    expect(newNotices(before, view({ lastMarriageDay: 990 })).map((n) => n.kind)).toEqual([
      'marriage',
    ]);
    // trvalé upozornění to není
    expect(villageNotices(view({ lastMarriageDay: 990 }))).toEqual([]);
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
        oaks: [{ id: 7, happiness: 5, ageYears: 310, snag: false }],
        groves: [{ id: 9, oaks: 12, squares: 9, happiness: 13, ageYears: 240 }],
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

  it('posvátný dub uschl a posvátná souš padla – fakt', () => {
    const after = view({
      dayIndex: 1003,
      chronicle: [
        entry(1002, 'sacred-snag-fell', 'Posvátná souš padla.'),
        entry(1001, 'sacred-oak-died', 'Posvátný dub stářím uschl – zůstala posvátná souš.'),
      ],
    });
    expect(newNotices(view(), after)).toEqual([
      { kind: 'sacred-oak-died', tone: 'warn', text: 'Posvátný dub uschl' },
      { kind: 'sacred-snag-fell', tone: 'warn', text: 'Posvátná souš padla' },
    ]);
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

describe('villageNotices – řemesla (crafts.md)', () => {
  it('kovář bez uhlí a dílna bez stromů – krátký fakt', () => {
    const workshop = (activity: VillageView['crafts']['workshops'][number]['activity']) => ({
      dwellingId: 9,
      craft: 'smith' as const,
      activity,
      occupants: 2,
      laborPerDay: 0.9,
      outputPerDayKg: 0.09,
      kiln: null,
      toPlant: 0,
    });
    const crafts = (activities: VillageView['crafts']['workshops'][number]['activity'][]) => ({
      ...view().crafts,
      present: true,
      workshops: activities.map(workshop),
    });
    expect(villageNotices(view({ crafts: crafts(['producing', 'empty']) }))).toEqual([]);
    expect(villageNotices(view({ crafts: crafts(['no-charcoal', 'no-wood']) }))).toEqual([
      { kind: 'no-charcoal', tone: 'warn', text: 'Kovář nemá uhlí' },
      { kind: 'no-wood', tone: 'warn', text: 'Dílna nemá co kácet' },
    ]);
  });
});

describe('newNotices – obnova a konec sadu (orchard.md – Obnova sadu)', () => {
  const entry = (
    day: number,
    kind: 'orchard-renewal-started' | 'orchard-gone',
  ): VillageView['chronicle'][number] => ({ day, kind, dateLabel: '', text: '' });

  it('vesničané začali obnovovat starý sad – fakt jednou, při prvním načtení nic', () => {
    const before = view({ dayIndex: 1000 });
    const after = view({ dayIndex: 1003, chronicle: [entry(1001, 'orchard-renewal-started')] });
    expect(newNotices(null, after)).toEqual([]);
    expect(newNotices(before, after)).toEqual([
      { kind: 'orchard-renewal', tone: 'info', text: 'Vesničané obnovují starý sad' },
    ]);
    expect(newNotices(after, after)).toEqual([]);
    // trvalá upozornění se o sadu nezmiňují
    expect(villageNotices(after)).toEqual([]);
  });

  it('starý sad dosloužil – krátký řádek', () => {
    const after = view({
      dayIndex: 1400,
      chronicle: [entry(1366, 'orchard-gone'), entry(1001, 'orchard-renewal-started')],
    });
    expect(newNotices(view({ dayIndex: 1300 }), after)).toEqual([
      { kind: 'orchard-gone', tone: 'warn', text: 'Starý sad dosloužil' },
    ]);
  });
});

describe('newNotices – nepasené pole zarostlo lesem (fields.md – Zarůstání)', () => {
  it('krátký řádek jednou, i když zarostlo víc polí', () => {
    const entry = (day: number): VillageView['chronicle'][number] => ({
      day,
      kind: 'part-became-forest',
      dateLabel: '',
      text: '',
    });
    const after = view({ dayIndex: 1400, chronicle: [entry(1366), entry(1366)] });
    expect(newNotices(view({ dayIndex: 1300 }), after)).toEqual([
      { kind: 'part-forest', tone: 'warn', text: 'Nepasené pole zarostlo lesem' },
    ]);
  });
});

describe('upozornění z jiných vsí (migration.md)', () => {
  const item = (overrides: Partial<VillageListItem> = {}): VillageListItem => ({
    id: 'v-2',
    settlementId: 's-1',
    name: 'Budeč',
    people: 5,
    extinct: false,
    hungry: false,
    starving: false,
    ...overrides,
  });
  const self = item({ id: 'v-1', name: 'Libice' });

  it('hlad, vymírání hladem a vymření jiné vsi – jednou, se jménem vsi', () => {
    const before = view({ villages: [self, item()] });
    const hungry = view({ villages: [self, item({ hungry: true })] });
    expect(newNotices(before, hungry)).toEqual([
      { kind: 'other-hungry', tone: 'warn', text: 'Budeč: ves hladoví' },
    ]);
    expect(newNotices(hungry, hungry)).toEqual([]);
    const starving = view({ villages: [self, item({ hungry: true, starving: true })] });
    expect(otherVillageNotices(hungry, starving)).toEqual([
      { kind: 'other-starving', tone: 'warn', text: 'Budeč: lidé umírají hlady' },
    ]);
    const extinct = view({ villages: [self, item({ extinct: true, people: 0 })] });
    expect(otherVillageNotices(starving, extinct)).toEqual([
      { kind: 'other-extinct', tone: 'warn', text: 'Budeč: ves vymřela' },
    ]);
  });

  it('vlastní ves ani nově přibylá ves upozornění z jiné vsi nedají', () => {
    const before = view({ villages: [self] });
    const after = view({
      hungry: true,
      villages: [{ ...self, hungry: true }, item({ hungry: true })],
    });
    expect(otherVillageNotices(before, after)).toEqual([]);
  });

  it('po přepnutí na jinou ves žádná nová upozornění', () => {
    const libice = view({ villages: [self, item()] });
    const budec = view({ id: 'v-2', name: 'Budeč', hungry: true, villages: [self, item()] });
    expect(newNotices(libice, budec)).toEqual([]);
  });
});
