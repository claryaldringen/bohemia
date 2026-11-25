import { describe, expect, it } from 'vitest';
import {
  lineNameNotice,
  newNotices,
  otherVillageNotices,
  villageNotices,
} from '../village-notices';
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
  steward: { on: false, built: [] },
  settlementId: 's-1',
  name: 'Libice',
  villages: [],
  rights: { allowed: [], reason: null },
  abandoned: null,
  journey: null,
  pendingDeparture: null,
  leave: { directions: [], cart: null, all: { foodKg: 0, animals: 0, carts: 0 } },
  manor: null,
  dayIndex: 1000,
  people: { children: 2, adults: 2, elders: 0 },
  households: [],
  storesKg: 800,
  applesKg: 0,
  wares: null,
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
    milkLPerDay: 0,
    milkLPerYear: 0,
  },
  pens: [],
  roads: [],
  woodLogs: 0,
  crafts: {
    present: false,
    stocks: { charcoalKg: 0, potteryKg: 0 },
    needs: { toolsKg: 6, potteryKg: 20, woodToolsKg: 8 },
    coverage: { tools: 0, pottery: 0 },
    workshops: [],
    carts: [],
    cartTargets: { 'two-wheel': 0, 'four-wheel': 0 },
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
    vypleteny: {
      laborManDays: 260,
      perHa: false,
      perSquare: false,
      upfront: [],
      blocked: null,
      affordable: true,
    },
    srub: {
      laborManDays: 300,
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
    carpenter: workshop(286),
    pen: {
      laborManDays: 40,
      perHa: false,
      perSquare: false,
      upfront: [{ resource: 'wood', amount: 6, missing: 0 }],
      blocked: null,
      affordable: true,
    },
    'threshing-floor': {
      laborManDays: 75,
      perHa: false,
      perSquare: false,
      upfront: [{ resource: 'wood', amount: 6, missing: 0 }],
      blocked: null,
      affordable: true,
    },
    quarry: {
      laborManDays: 20,
      perHa: false,
      perSquare: false,
      upfront: [],
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
  hunger: 'fed',
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

  it('hlad, stojící stavby a rodina čeká na dům – problémy první, jen krátký fakt', () => {
    const notices = villageNotices(
      view({
        hungry: true,
        hunger: 'hungry',
        satiation: 0.72,
        constructionsStalled: true,
        fullHousehold: true,
      }),
    );
    expect(notices).toEqual([
      { kind: 'hungry', tone: 'warn', text: 'Ves hladoví' },
      { kind: 'stalled', tone: 'warn', text: 'Stavby stojí' },
      { kind: 'full-household', tone: 'info', text: 'Rodina čeká na dům' },
    ]);
  });
});

describe('villageNotices – hlad a vymření', () => {
  it('stupně hladu – vždy jen nejvyšší: šetří jídlem mírně, hladoví, umírají hlady', () => {
    expect(villageNotices(view({ hungry: true, hunger: 'rationing' }))).toEqual([
      { kind: 'rationing', tone: 'info', text: 'Ves šetří jídlem' },
    ]);
    expect(villageNotices(view({ hungry: true, hunger: 'hungry' }))).toEqual([
      { kind: 'hungry', tone: 'warn', text: 'Ves hladoví' },
    ]);
    expect(
      villageNotices(view({ hungry: true, starving: true, hunger: 'starving', satiation: 0 })),
    ).toEqual([{ kind: 'starving', tone: 'warn', text: 'Lidé umírají hlady' }]);
    // šetření jen kvůli osivu (absence.md – Upozornění vsi do kroniky) – hlad zůstane hladem
    const seed = view({ hungry: true, hunger: 'rationing', seedRationing: true });
    expect(villageNotices(seed)).toEqual([
      { kind: 'rationing', tone: 'info', text: 'Ves šetří na osivo' },
    ]);
    expect(newNotices(view(), seed).map((n) => n.text)).toEqual(['Ves šetří na osivo']);
    expect(villageNotices(view({ hungry: true, hunger: 'hungry', seedRationing: true }))).toEqual([
      { kind: 'hungry', tone: 'warn', text: 'Ves hladoví' },
    ]);
  });

  it('stádo se nevejde do ohrad (oxen.md – Ohrady podle druhu): jeden druh jménem, víc „stáda“', () => {
    expect(villageNotices(view({ penShort: ['sheep'] }))).toEqual([
      { kind: 'pen-short', tone: 'warn', text: 'Ovce se nevejdou do ohrad' },
    ]);
    expect(villageNotices(view({ penShort: ['pig', 'cow'] }))[0]!.text).toBe(
      'Stáda se nevejdou do ohrad',
    );
    // ohlásí se, když nově vznikne
    expect(newNotices(view(), view({ penShort: ['goat'] })).map((n) => n.text)).toEqual([
      'Kozy se nevejdou do ohrad',
    ]);
  });

  it('voli se nevejdou do ohrady (oxen.md – Kolik volů ves chce)', () => {
    const oxen = {
      trained: 2,
      training: 0,
      places: 6,
      wanted: 8,
      overRoom: true,
      ploughPairs: 1,
      teams: 1,
      ards: 1,
      carts: { 'two-wheel': 1, 'four-wheel': 0 },
      cartTargets: { 'two-wheel': 6, 'four-wheel': 0 },
    };
    expect(villageNotices(view({ oxen }))).toEqual([
      { kind: 'oxen-short', tone: 'warn', text: 'Voli se nevejdou do ohrady' },
    ]);
    expect(villageNotices(view({ oxen: { ...oxen, overRoom: false } }))).toEqual([]);
    expect(newNotices(view(), view({ oxen })).map((n) => n.text)).toEqual([
      'Voli se nevejdou do ohrady',
    ]);
  });

  it('výmlat (production-chains.md – Humno): nouzový výmlat bez humna, humno nestačí', () => {
    expect(villageNotices(view({ threshing: { sheavesKg: 800, emergency: true } }))).toEqual([
      {
        kind: 'emergency-threshing',
        tone: 'info',
        text: 'Mlátí se na udusané zemi – postav humno',
      },
    ]);
    expect(villageNotices(view({ threshing: { sheavesKg: 80, floorShort: true } }))).toEqual([
      {
        kind: 'threshing-floor-short',
        tone: 'info',
        text: 'Humno nestačí – část se mlátí nouzově',
      },
    ]);
    // snopy samy upozornění nejsou
    expect(villageNotices(view({ threshing: { sheavesKg: 800 } }))).toEqual([]);
    // ohlásí se, když nově vznikne – při prvním výmlatu po žni
    expect(
      newNotices(view(), view({ threshing: { sheavesKg: 900, emergency: true } })).map(
        (n) => n.text,
      ),
    ).toEqual(['Mlátí se na udusané zemi – postav humno']);
  });

  it('vymřelá ves žádná upozornění nemá', () => {
    const extinct = { foundedYear: 512, extinctYear: 587, years: 74 };
    expect(
      villageNotices(view({ hungry: true, starving: true, hunger: 'starving', extinct })),
    ).toEqual([]);
  });
});

describe('newNotices', () => {
  it('ohlásí jen nově vzniklá upozornění, trvající podruhé ne', () => {
    const calm = view();
    const hungry = view({ hungry: true, hunger: 'hungry', satiation: 0.8 });
    expect(newNotices(calm, hungry).map((n) => n.kind)).toEqual(['hungry']);
    expect(newNotices(hungry, view({ hungry: true, hunger: 'hungry', satiation: 0.6 }))).toEqual(
      [],
    );
    const both = view({ hungry: true, hunger: 'hungry', fullHousehold: true });
    expect(newNotices(hungry, both).map((n) => n.kind)).toEqual(['full-household']);
  });

  it('hlad se ohlásí, jen když se zhorší – šetří jídlem → hladoví → umírají, zpět nic', () => {
    const rationing = view({ hungry: true, hunger: 'rationing' });
    const hungry = view({ hungry: true, hunger: 'hungry' });
    const starving = view({ hungry: true, starving: true, hunger: 'starving' });
    expect(newNotices(view(), rationing).map((n) => n.text)).toEqual(['Ves šetří jídlem']);
    expect(newNotices(rationing, hungry).map((n) => n.text)).toEqual(['Ves hladoví']);
    expect(newNotices(hungry, starving).map((n) => n.text)).toEqual(['Lidé umírají hlady']);
    expect(newNotices(view(), starving).map((n) => n.text)).toEqual(['Lidé umírají hlady']);
    expect(newNotices(starving, hungry)).toEqual([]);
    expect(newNotices(hungry, rationing)).toEqual([]);
    expect(newNotices(rationing, view())).toEqual([]);
  });

  it('nouzová porážka – krátký fakt, kolik kusů čeho', () => {
    const entry = (animals: Record<string, number>): VillageView['chronicle'][number] => ({
      day: 1001,
      kind: 'emergency-slaughter',
      kg: 600,
      animals,
      dateLabel: '',
      text: '',
    });
    expect(
      newNotices(view(), view({ dayIndex: 1001, chronicle: [entry({ pig: 11.6 })] })).map(
        (n) => n.text,
      ),
    ).toEqual(['Vesničané porazili 12 prasat navíc']);
    expect(
      newNotices(
        view(),
        view({ dayIndex: 1001, chronicle: [entry({ pig: 3, goat: 1, cow: 2.2 })] }),
      ).map((n) => n.text),
    ).toEqual(['Vesničané porazili 3 prasata, 1 kozu a 2 krávy navíc']);
  });

  it('po skončení a novém začátku stavu ohlásí znovu', () => {
    const calm = view();
    const stalled = view({ constructionsStalled: true });
    expect(newNotices(calm, stalled)).toHaveLength(1);
    expect(newNotices(stalled, calm)).toEqual([]);
    expect(newNotices(calm, stalled)).toHaveLength(1);
  });

  it('první pohled na ves nic neohlásí – kromě nouzového výmlatu bez humna', () => {
    expect(newNotices(null, view({ hungry: true }))).toEqual([]);
    // humno (production-chains.md – Humno): bez něj se mlátí nouzově – hráč se to dozví hned
    expect(
      newNotices(null, view({ threshing: { sheavesKg: 500, emergency: true } })).map((n) => n.kind),
    ).toEqual(['emergency-threshing']);
    // humno, které nestačí, až když nově vznikne
    expect(newNotices(null, view({ threshing: { sheavesKg: 500, floorShort: true } }))).toEqual([]);
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
  const cemetery = (built: boolean, freePlaces: number): VillageView['cemeteries'][number] => ({
    id: 1,
    squares: 1,
    built,
    progress: built ? 1 : 0.3,
    capacity: 56,
    graves: 56 - freePlaces,
    usedPlaces: 56 - freePlaces,
    freePlaces,
    yearsLeft: null,
    fenceCondition: 1,
    abandoned: false,
    repair: null,
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

  it('koně (horses.md – Co hráč vidí): bez obilí, nevejdou se, hříbata, vycvičení, dosloužili, uhynuli; kování se neohlašuje', () => {
    const horses = {
      count: 4,
      kinds: { riding: 2, mares: 2, foals: 0 },
      places: 8,
      wanted: { riding: 3, mares: 2, foals: 0 },
      overRoom: false,
      fed: true,
      grainKgPerDay: 3,
      ungrained: false,
      hayWinterKg: 2000,
      horses: [],
    };
    expect(villageNotices(view({ horses }))).toEqual([]);
    expect(villageNotices(view({ horses: { ...horses, overRoom: true } }))).toEqual([
      { kind: 'horses-short', tone: 'warn', text: 'Koně se nevejdou do ohrady' },
    ]);
    // bez obilí podle podmínky jádra (`horsesUngrained` – jen když nějaký kůň obilí jí)
    const ungrained = { ...horses, fed: false, ungrained: true };
    expect(villageNotices(view({ horses: ungrained }))).toEqual([
      { kind: 'horses-ungrained', tone: 'warn', text: 'Koně jsou bez obilí' },
    ]);
    // nově vzniklé se ohlásí jednou
    expect(newNotices(view({ horses }), view({ horses: ungrained })).map((n) => n.text)).toEqual([
      'Koně jsou bez obilí',
    ]);
    const entry = (
      day: number,
      kind: VillageView['chronicle'][number]['kind'],
      n?: number,
    ): VillageView['chronicle'][number] => ({
      day,
      kind,
      dateLabel: '',
      text: '',
      ...(n === undefined ? {} : { horses: n }),
    });
    expect(
      newNotices(
        view({ dayIndex: 3000 }),
        view({
          dayIndex: 3010,
          chronicle: [
            entry(3009, 'horse-starved', 2),
            entry(3008, 'horse-retired', 1),
            entry(3007, 'horse-trained'),
            entry(3006, 'horses-shod', 2),
            entry(3005, 'foal-born', 1),
          ],
        }),
      ).map((n) => n.text),
    ).toEqual([
      'Narodilo se hříbě',
      'Kůň je vycvičený',
      'Kůň dosloužil',
      'Koně uhynuli – chybělo seno',
    ]);
  });

  it('voli po kusech (oxen.md): vycvičení, dosloužilí a uhynulí podle počtu', () => {
    const before = view({ dayIndex: 2000 });
    const oxen = (
      day: number,
      kind: VillageView['chronicle'][number]['kind'],
      n: number,
    ): VillageView['chronicle'][number] => ({ day, kind, dateLabel: '', text: '', oxen: n });
    expect(
      newNotices(
        before,
        view({
          dayIndex: 2010,
          chronicle: [oxen(2009, 'ox-died', 2), oxen(2005, 'team-ready', 1)],
        }),
      ),
    ).toEqual([
      { kind: 'team-ready', tone: 'info', text: 'Vůl je vycvičený' },
      { kind: 'ox-died', tone: 'warn', text: 'Voli uhynuli – chybělo seno' },
    ]);
    expect(
      newNotices(
        before,
        view({
          dayIndex: 2010,
          chronicle: [oxen(2003, 'team-retired', 2), oxen(2001, 'team-ready', 3)],
        }),
      ).map((n) => n.text),
    ).toEqual(['Voli jsou vycvičení', 'Voli dosloužili']);
  });

  it('zkažené maso a zimní úhyn stáda – fakt (diet.md)', () => {
    const after = view({
      dayIndex: 1003,
      chronicle: [
        entry(1002, 'herd-starved', 'Přes zimu chybělo seno – uhynulo 12 kusů dobytka.'),
        entry(1001, 'meat-spoiled', 'Zbytek uzeného masa se zkazil: 1 120 kg.', 1120),
      ],
    });
    expect(newNotices(view({ dayIndex: 1000 }), after)).toEqual([
      { kind: 'meat-spoiled', tone: 'warn', text: 'Maso se zkazilo – 1 120 kg' },
      { kind: 'herd-starved', tone: 'warn', text: 'Dobytek hynul – chybělo seno' },
    ]);
  });

  it('porážka pro nedostatek sena – varování, kolik kusů čeho (oxen.md)', () => {
    const after = view({
      dayIndex: 1001,
      chronicle: [
        {
          day: 1001,
          kind: 'hay-slaughter',
          kg: 230,
          animals: { sheep: 3 },
          dateLabel: '',
          text: '',
        },
      ],
    });
    expect(newNotices(view(), after)).toEqual([
      { kind: 'hay-slaughter', tone: 'warn', text: 'Chybí seno – porazili 3 ovce' },
    ]);
  });

  it('nevěsta a ženich z okolí a dcera vdaná pryč – fakt (kinship.md)', () => {
    const after = view({
      dayIndex: 1003,
      chronicle: [
        entry(1002, 'married-away', 'Dcera se vdala do sousední vsi.'),
        entry(1002, 'groom-from-outside', 'K vdově se přiženil muž ze sousední vsi.'),
        entry(1001, 'bride-from-outside', 'Muž si přivedl nevěstu ze sousední vsi.'),
      ],
    });
    expect(newNotices(view({ dayIndex: 1000 }), after)).toEqual([
      { kind: 'bride-from-outside', tone: 'info', text: 'Nevěsta z okolí' },
      { kind: 'groom-from-outside', tone: 'info', text: 'Ženich z okolí' },
      { kind: 'married-away', tone: 'info', text: 'Dcera se vdala pryč' },
    ]);
  });

  it('nevěsta, ženich a vdaná dcera se jménem vsi, vrácená rodina vlastním upozorněním (plán 3)', () => {
    const e = (
      day: number,
      kind: VillageView['chronicle'][number]['kind'],
      fields: Partial<VillageView['chronicle'][number]> = {},
    ): VillageView['chronicle'][number] => ({ day, kind, dateLabel: '', text: '', ...fields });
    const after = view({
      dayIndex: 1010,
      chronicle: [
        e(1005, 'newcomer', {
          group: 'family',
          direction: 'N',
          villageName: 'Lhota',
          returned: true,
        }),
        e(1004, 'newcomer', { group: 'man', direction: 'N', villageName: 'Lhota' }),
        e(1003, 'married-away', { villageName: 'Lhota', groom: true }),
        e(1002, 'groom-from-outside', { villageName: 'Lhota' }),
        e(1001, 'bride-from-outside', { villageName: 'Lhota' }),
      ],
    });
    expect(newNotices(view({ dayIndex: 1000 }), after)).toEqual([
      { kind: 'bride-from-outside', tone: 'info', text: 'Nevěsta z Lhoty' },
      { kind: 'groom-from-outside', tone: 'info', text: 'Ženich z Lhoty' },
      { kind: 'married-away', tone: 'info', text: 'Syn se přiženil do Lhoty' },
      { kind: 'newcomer-man', tone: 'info', text: 'Přišel muž z Lhoty' },
      { kind: 'newcomer-back-family', tone: 'info', text: 'Vrátila se prodaná rodina' },
    ]);
    // cizí správce: jméno vsi je prázdné
    const masked = view({
      dayIndex: 1010,
      chronicle: [e(1001, 'bride-from-outside', { villageName: '' })],
    });
    expect(newNotices(view({ dayIndex: 1000 }), masked)).toEqual([
      { kind: 'bride-from-outside', tone: 'info', text: 'Nevěsta ze sousední vsi' },
    ]);
  });

  it('lidé od souseda – fakt, odkud přišli (trade.md – Výměna lidí)', () => {
    const newcomer = (
      day: number,
      group: 'family' | 'man' | 'woman',
    ): VillageView['chronicle'][number] => ({
      day,
      kind: 'newcomer',
      group,
      direction: 'N',
      dateLabel: '',
      text: '',
    });
    const after = view({
      dayIndex: 1003,
      chronicle: [newcomer(1002, 'woman'), newcomer(1001, 'man'), newcomer(1001, 'family')],
    });
    expect(newNotices(view({ dayIndex: 1000 }), after)).toEqual([
      { kind: 'newcomer-family', tone: 'info', text: 'Přišla rodina ze severu' },
      { kind: 'newcomer-man', tone: 'info', text: 'Přišel muž ze severu' },
      { kind: 'newcomer-woman', tone: 'info', text: 'Přišla žena ze severu' },
    ]);
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

  it('opuštěná stavba spadla – fakt podle stavby (abandonment.md), sedm model jedním řádkem', () => {
    const fell = (
      day: number,
      structure: NonNullable<VillageView['chronicle'][number]['structure']>,
    ): VillageView['chronicle'][number] => ({
      ...entry(day, 'structure-fell', ''),
      structure,
    });
    const after = view({
      dayIndex: 1010,
      chronicle: [
        fell(1009, 'pen'),
        fell(1008, 'cemetery-fence'),
        fell(1007, 'shrine'),
        ...Array.from({ length: 7 }, () => fell(1005, 'idol')),
      ],
    });
    expect(newNotices(view({ dayIndex: 1000 }), after)).toEqual([
      { kind: 'idol-fell', tone: 'warn', text: 'Modla padla' },
      { kind: 'shrine-fell', tone: 'warn', text: 'Svatyně se rozpadla' },
      { kind: 'cemetery-fence-fell', tone: 'warn', text: 'Plot hřbitova se rozpadl' },
      { kind: 'pen-fell', tone: 'warn', text: 'Ohrada se rozpadla' },
    ]);
  });

  it('vesničané opravili stavbu – fakt podle stavby (abandonment.md – Oprava)', () => {
    const repaired = (
      day: number,
      structure: NonNullable<VillageView['chronicle'][number]['structure']>,
    ): VillageView['chronicle'][number] => ({
      ...entry(day, 'structure-repaired', ''),
      structure,
    });
    const after = view({
      dayIndex: 1010,
      chronicle: [
        repaired(1009, 'pen'),
        repaired(1008, 'shrine'),
        repaired(1007, 'idol'),
        repaired(1006, 'cemetery-fence'),
      ],
    });
    expect(newNotices(view({ dayIndex: 1000 }), after)).toEqual([
      { kind: 'cemetery-fence-repaired', tone: 'info', text: 'Plot hřbitova opraven' },
      { kind: 'idol-repaired', tone: 'info', text: 'Modla opravena' },
      { kind: 'shrine-repaired', tone: 'info', text: 'Svatyně opravena' },
      { kind: 'pen-repaired', tone: 'info', text: 'Ohrada opravena' },
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
      kilns: [],
      toPlant: 0,
      skill: { share: 1, years: 5, apprentices: [] },
      carpenter: null,
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
    // kovář bez rudy a bez místa, kde ji kopat (crafts.md – Uhlí a ruda kováře); kope-li, nic
    expect(villageNotices(view({ crafts: crafts(['digging']) }))).toEqual([]);
    expect(villageNotices(view({ crafts: crafts(['no-ore']) }))).toEqual([
      { kind: 'no-ore', tone: 'warn', text: 'Kovář nemá rudu' },
    ]);
    // hrnčíř bez hlíny a bez místa, kde ji kopat (crafts.md – Hlína hrnčíře)
    expect(villageNotices(view({ crafts: crafts(['no-clay']) }))).toEqual([
      { kind: 'no-clay', tone: 'warn', text: 'Hrnčíř nemá hlínu' },
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
    abandoned: false,
    travelling: false,
    hunger: 'fed',
    ...overrides,
  });
  const self = item({ id: 'v-1', name: 'Libice' });

  it('hlad, vymírání hladem a vymření jiné vsi – jednou, se jménem vsi', () => {
    const before = view({ villages: [self, item()] });
    const rationing = view({ villages: [self, item({ hunger: 'rationing' })] });
    expect(newNotices(before, rationing)).toEqual([
      { kind: 'other-rationing', tone: 'info', text: 'Budeč: ves šetří jídlem' },
    ]);
    const hungry = view({ villages: [self, item({ hunger: 'hungry' })] });
    expect(newNotices(rationing, hungry)).toEqual([
      { kind: 'other-hungry', tone: 'warn', text: 'Budeč: ves hladoví' },
    ]);
    expect(newNotices(hungry, hungry)).toEqual([]);
    // zlepšení se neohlašuje
    expect(newNotices(hungry, rationing)).toEqual([]);
    const starving = view({ villages: [self, item({ hunger: 'starving' })] });
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
      hunger: 'hungry',
      villages: [{ ...self, hunger: 'hungry' }, item({ hunger: 'hungry' })],
    });
    expect(otherVillageNotices(before, after)).toEqual([]);
  });

  it('po přepnutí na jinou ves žádná nová upozornění', () => {
    const libice = view({ villages: [self, item()] });
    const budec = view({
      id: 'v-2',
      name: 'Budeč',
      hungry: true,
      hunger: 'hungry',
      villages: [self, item()],
    });
    expect(newNotices(libice, budec)).toEqual([]);
    // nouzový výmlat se ohlásí i po přepnutí (production-chains.md – Humno)
    const waiting = { ...budec, threshing: { sheavesKg: 400, emergency: true as const } };
    expect(newNotices(libice, waiting)).toEqual([
      {
        kind: 'emergency-threshing',
        tone: 'info',
        text: 'Mlátí se na udusané zemi – postav humno',
      },
    ]);
  });

  it('nouzový výmlat jiné vsi – jednou, se jménem vsi', () => {
    const before = view({ villages: [self, item()] });
    const needed = view({ villages: [self, item({ threshing: { emergency: true } })] });
    expect(newNotices(before, needed)).toEqual([
      {
        kind: 'other-emergency-threshing',
        tone: 'info',
        text: 'Budeč: mlátí se na udusané zemi – postav humno',
      },
    ]);
    expect(newNotices(needed, needed)).toEqual([]);
    expect(otherVillageNotices(needed, before)).toEqual([]);
  });
});

describe('počasí a pohromy (disasters.md – Co hráč vidí)', () => {
  const item = (overrides: Partial<VillageListItem> = {}): VillageListItem => ({
    id: 'v-2',
    settlementId: 's-1',
    name: 'Budeč',
    people: 6,
    extinct: false,
    abandoned: false,
    travelling: false,
    hunger: 'fed',
    ...overrides,
  });
  const drought = {
    kind: 'drought',
    tone: 'warn',
    text: 'Sucho – nejvíc trpí pole bez stromů',
  } as const;

  it('sucho se ohlásí jednou, když se ukáže', () => {
    const before = view();
    const dry = view({ weather: { year: 503, summer: 'drought' } });
    expect(newNotices(before, dry)).toEqual([drought]);
    expect(newNotices(dry, dry)).toEqual([]);
  });

  it('požár z kroniky – v jeho den Hoří!, den po něm Vyhořel dům', () => {
    const fire = {
      day: 1001,
      kind: 'fire' as const,
      dwellings: 1,
      dateLabel: '',
      text: 'Požár – vyhořel jeden dům.',
    };
    const burning = view({ dayIndex: 1001, chronicle: [fire] });
    expect(newNotices(view(), burning)).toEqual([{ kind: 'fire', tone: 'warn', text: 'Hoří!' }]);
    expect(newNotices(burning, view({ dayIndex: 1002, chronicle: [fire] }))).toEqual([
      { kind: 'fire-out', tone: 'warn', text: 'Vyhořel dům' },
    ]);
  });

  it('z jiné vsi se jménem – sucho a poslední pohroma, jen když nově přibudou', () => {
    const self = item({ id: 'v-1', name: 'Libice' });
    const before = view({ villages: [self, item()] });
    const after = view({
      villages: [
        self,
        item({
          disasters: {
            weather: [drought],
            last: {
              day: 1000,
              notice: { kind: 'hail', tone: 'warn', text: 'Kroupy potloukly obilí' },
            },
          },
        }),
      ],
    });
    expect(otherVillageNotices(before, after)).toEqual([
      { ...drought, text: 'Budeč: Sucho – nejvíc trpí pole bez stromů' },
      { kind: 'hail', tone: 'warn', text: 'Budeč: Kroupy potloukly obilí' },
    ]);
    expect(otherVillageNotices(after, after)).toEqual([]);
  });
});

describe('tesař a vozy (wagons.md)', () => {
  it('tesař bez klád – vlastní řádek, ostatní dílny dál „Dílna nemá co kácet“', () => {
    const workshop = (craft: 'carpenter' | 'potter') => ({
      dwellingId: craft === 'carpenter' ? 9 : 8,
      craft,
      activity: 'no-wood' as const,
      occupants: 2,
      laborPerDay: 0.9,
      outputPerDayKg: 1,
      kilns: [],
      toPlant: 0,
      skill: { share: 1, years: 5, apprentices: [] },
      carpenter: null,
    });
    const crafts = (crafts: ('carpenter' | 'potter')[]) => ({
      ...view().crafts,
      present: true,
      workshops: crafts.map(workshop),
    });
    expect(villageNotices(view({ crafts: crafts(['carpenter']) }))).toEqual([
      { kind: 'carpenter-no-wood', tone: 'warn', text: 'Tesař nemá klády' },
    ]);
    expect(villageNotices(view({ crafts: crafts(['potter', 'carpenter']) }))).toEqual([
      { kind: 'no-wood', tone: 'warn', text: 'Dílna nemá co kácet' },
      { kind: 'carpenter-no-wood', tone: 'warn', text: 'Tesař nemá klády' },
    ]);
  });

  it('tesař vyrobil vůz a vůz dosloužil – krátký fakt z kroniky', () => {
    const entry = (
      day: number,
      kind: 'cart-made' | 'cart-worn-out',
    ): VillageView['chronicle'][number] => ({ day, kind, dateLabel: '', text: '' });
    const after = view({
      dayIndex: 1003,
      chronicle: [entry(1002, 'cart-made'), entry(1001, 'cart-worn-out')],
    });
    expect(newNotices(view({ dayIndex: 1000 }), after)).toEqual([
      { kind: 'cart-worn-out', tone: 'warn', text: 'Vůz dosloužil' },
      { kind: 'cart-made', tone: 'info', text: 'Tesař vyrobil vůz' },
    ]);
  });
});

describe('kování vozů (wagons.md – Kování vozů)', () => {
  it('tesař šel pro kování k vozu do vsi souseda a syn ho přinesl – krátký fakt z kroniky', () => {
    const after = view({
      dayIndex: 1010,
      chronicle: [
        { day: 1009, kind: 'iron-brought', son: true, dateLabel: '', text: '' },
        {
          day: 1002,
          kind: 'iron-trip',
          place: 'Lhota',
          son: false,
          direction: 'N',
          porters: 6,
          dateLabel: '',
          text: '',
        },
      ],
    });
    expect(newNotices(view({ dayIndex: 1000 }), after)).toEqual([
      {
        kind: 'iron-trip',
        tone: 'info',
        text: 'Tesař šel se 6 nosiči pro kování k vozu do vsi Lhota (sever)',
      },
      { kind: 'iron-brought', tone: 'info', text: 'Syn tesaře přinesl kování' },
    ]);
  });
});

describe('výprava na trh (markets.md – Pravidla 3)', () => {
  it('návrat z trhu – krátký fakt z kroniky', () => {
    const after = view({
      dayIndex: 1003,
      chronicle: [
        {
          day: 1002,
          kind: 'market-returned',
          dateLabel: '',
          text: '',
        },
      ],
    });
    expect(newNotices(view({ dayIndex: 1000 }), after)).toEqual([
      { kind: 'market-returned', tone: 'info', text: 'Výprava se vrátila z trhu' },
    ]);
  });
});

describe('nákup u sousedů (crafts.md)', () => {
  it('vesničané koupili výrobky u souseda – krátký fakt z kroniky', () => {
    const after = view({
      dayIndex: 1003,
      chronicle: [
        {
          day: 1002,
          kind: 'crafts-bought',
          direction: 'N',
          products: ['toolsKg', 'potteryKg'],
          dateLabel: '',
          text: '',
        },
      ],
    });
    expect(newNotices(view({ dayIndex: 1000 }), after)).toEqual([
      {
        kind: 'crafts-bought',
        tone: 'info',
        text: 'Vesničané koupili nástroje a keramiku u souseda (sever)',
      },
    ]);
  });

  it('koupený vůz napřed (crafts.md – Nákup u sousedů, Vozy)', () => {
    const after = view({
      dayIndex: 1003,
      chronicle: [
        {
          day: 1002,
          kind: 'crafts-bought',
          direction: 'N',
          products: ['woodToolsKg'],
          cart: 'four-wheel',
          dateLabel: '',
          text: '',
        },
      ],
    });
    expect(newNotices(view({ dayIndex: 1000 }), after)).toEqual([
      {
        kind: 'crafts-bought',
        tone: 'info',
        text: 'Vesničané koupili čtyřkolák a dřevěné nářadí u souseda (sever)',
      },
    ]);
  });
});

describe('lineNameNotice – muži rodu bez jména (lord.md – Kde se jméno zadává)', () => {
  const dynasty = (
    unnamed: { id: number; age: number; lord: boolean }[],
  ): VillageView['dynasty'] => ({
    lordId: 1,
    unnamed,
    taken: [],
    waitingHome: [],
    sons: [],
  });

  it('bez čekajících (i bez rodu) nic', () => {
    expect(lineNameNotice(null)).toBeNull();
    expect(lineNameNotice(view())).toBeNull();
    expect(lineNameNotice(view({ dynasty: dynasty([]) }))).toBeNull();
  });

  it('syn vojvody čeká – počet všech, panel na prvního ve frontě', () => {
    const sons = dynasty([
      { id: 7, age: 2, lord: false },
      { id: 9, age: 0, lord: false },
    ]);
    expect(lineNameNotice(view({ dynasty: sons }))).toEqual({
      kind: 'line-name',
      tone: 'warn',
      text: 'Syn vojvody čeká na jméno',
      count: 2,
      personId: 7,
    });
    const lord = dynasty([{ id: 1, age: 30, lord: true }]);
    expect(lineNameNotice(view({ dynasty: lord }))).toMatchObject({
      text: 'Vojvoda čeká na jméno',
      count: 1,
      personId: 1,
    });
  });

  it('„Rodina čeká na dům“ jmenuje ženaté syny, kteří čekají v dvorci', () => {
    const waiting = view({
      fullHousehold: true,
      dynasty: { ...dynasty([])!, waitingHome: ['Bořivoj', 'Ctibor'] },
    });
    expect(villageNotices(waiting).find((n) => n.kind === 'full-household')?.text).toBe(
      'Rodina čeká na dům – Bořivoj, Ctibor',
    );
  });
});

describe('divoká zvěř (wildlife.md – Co hráč vidí)', () => {
  const wildlife = (over: Partial<NonNullable<VillageView['wildlife']>> = {}) => ({
    species: [],
    damageShare: 0,
    wolvesTroubling: false,
    ...over,
  });

  it('prasata ničí úrodu od 5 %, vlci strhávají dobytek', () => {
    expect(villageNotices(view({ wildlife: wildlife({ damageShare: 0.05 }) }))).toEqual([]);
    expect(
      villageNotices(
        view({
          wildlife: wildlife({ damageShare: 0.06, wolvesTroubling: true }),
        }),
      ).map((n) => n.text),
    ).toEqual(['Divoká prasata ničí úrodu', 'Vlci strhávají dobytek']);
  });

  it('ohlásí se jednou, když nově vzniknou', () => {
    expect(
      newNotices(view(), view({ wildlife: wildlife({ wolvesTroubling: true }) })).map(
        (n) => n.text,
      ),
    ).toEqual(['Vlci strhávají dobytek']);
    const same = view({ wildlife: wildlife({ wolvesTroubling: true }) });
    expect(newNotices(same, same)).toEqual([]);
  });
});
