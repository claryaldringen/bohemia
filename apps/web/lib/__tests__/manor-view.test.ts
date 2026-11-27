import { describe, expect, it } from 'vitest';
import {
  dayIndexOf,
  foundVillage,
  generateLandscape,
  nextMerchantVisit,
  type MerchantStop,
  legacyNeighbourName,
  type Person,
  type VillageState,
} from '@bohemia/game';
import { sceneExpeditions } from '../caravan-view';
import { manorFamily, manorView } from '../manor-view';
import { buildVillageView } from '../village-view';

// Dvorec vojvody a karavany ve scéně (trade.md) – panel obchodu se sousedy zmizel (markets.md).

const DAY = dayIndexOf({ year: 600, month: 5, day: 1 });
const YEAR = 365.25;

const person = (
  id: number,
  age: number,
  sex: Person['sex'],
  extra: Partial<Person> = {},
): Person => ({
  id,
  bornDay: DAY - Math.ceil((age + 0.5) * YEAR),
  dwellingId: 900,
  sex,
  ...extra,
});

/** Ves s hotovou stezkou na jih a přeplněnou polozemnicí (rodiče, dědic, mladší syn, dcera). */
function village(): VillageState {
  const s = foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  const site = s.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId !== null)!;
  s.constructions = s.constructions.filter((c) => c !== site);
  s.dwellings.push(
    {
      id: site.dwellingId!,
      type: 'zemnice',
      builtDay: DAY,
      condition: 1,
      position: site.position!,
    },
    {
      id: 900,
      type: 'polozemnice',
      builtDay: DAY,
      condition: 1,
      position: { x: 30, z: 0, rotation: 0 },
    },
  );
  s.manorId = site.dwellingId!;
  s.people.push(
    person(500, 50, 'male', { spouseId: 501 }),
    person(501, 41, 'female', { spouseId: 500 }),
    person(502, 24, 'male', { spouseId: 503, motherId: 501, fatherId: 500 }),
    person(503, 22, 'female', { spouseId: 502 }),
    person(504, 21, 'male', { spouseId: 505, motherId: 501, fatherId: 500 }),
    person(505, 20, 'female', { spouseId: 504 }),
    person(506, 1, 'male', { motherId: 505, fatherId: 504 }),
    person(507, 18, 'female', { motherId: 501, fatherId: 500 }),
    person(508, 12, 'male', { motherId: 501, fatherId: 500 }),
  );
  s.trails = [
    { id: 1, direction: 'S', pieces: [], lengthM: 500, startedDay: DAY - 100, builtDay: DAY - 1 },
  ];
  s.trade = {
    expeditions: [],
    nextId: 1,
  };
  return s;
}

describe('výprava pro karavanu ve scéně (trade.md – Ve scéně)', () => {
  it('kdo jde tam a zpátky, postup a dnešní tempo', () => {
    const s = village();
    s.lastDay = DAY;
    s.trade!.expeditions = [
      {
        id: 4,
        direction: 'S',
        trailId: 1,
        startedDay: DAY - 2,
        give: { meat: 100 },
        get: {},
        porters: 6,
        days: 5,
        cost: 30,
        done: 12,
        givePeople: {
          families: 0,
          men: 1,
          women: 0,
          people: 1,
          members: [{ sex: 'male', bornDay: DAY - Math.ceil(20.5 * YEAR), group: 'man' }],
        },
        getPeople: { families: [1], men: 0, women: 1 },
      },
    ];
    s.labor = {
      day: DAY,
      shares: [{ activity: 'trade', target: { kind: 'trail', id: 1 }, manDays: 3 }],
    };
    const [e] = sceneExpeditions(s);
    expect(e).toMatchObject({
      id: 4,
      trailId: 1,
      porters: 6,
      carriesOut: true,
      carriesBack: false,
      progress: 0.4,
      rate: 0.1,
      onMap: 0.8,
    });
    expect(e!.leaving).toEqual([{ sex: 'male', age: 20 }]);
    // rodina se třemi lidmi a svobodná žena – pohlaví a věk jako při příchodu (newcomerProfiles)
    expect(e!.coming).toHaveLength(4);
    expect(e!.coming.map((p) => p.sex).slice(0, 2)).toEqual(['male', 'female']);
    expect(e!.coming[3]!.sex).toBe('female');
    // výprava ze starší vsi jde k dřívějšímu sousedovi – jméno jako dřív (legacyNeighbourName)
    expect(e!.trip).toEqual({ kind: 'trade', to: legacyNeighbourName(s.seed, 'S') });
    // výprava dnes nepostoupila – stojí
    s.labor = { day: DAY, shares: [] };
    expect(sceneExpeditions(s)[0]!.rate).toBe(0);
  });
});

describe('zásilka do vsi jiného hráče ve scéně (vassalage.md – Doprava a cílová ves)', () => {
  it('karavana jde po čáře ke kraji mapy ve směru první mapy cesty, bez stezky a jména souseda', () => {
    const s = village();
    s.lastDay = DAY;
    s.trade!.expeditions = [
      {
        id: 7,
        kind: 'shipment',
        destination: { cells: 3, firstStep: 'E' },
        direction: 'E',
        trailId: -1,
        startedDay: DAY - 1,
        give: { grain: 500, cows: 2 },
        get: {},
        porters: 20,
        days: 12,
        cost: 240,
        done: 60,
      },
    ];
    s.labor = { day: DAY, shares: [] };
    const [e] = sceneExpeditions(s);
    expect(e).toMatchObject({ id: 7, trailId: null, carriesOut: true, carriesBack: false });
    expect(e!.line).toHaveLength(2);
    // čára míří na východ: kraj mapy je napravo od vsi
    expect(e!.line![1]!.x).toBeGreaterThan(e!.line![0]!.x);
    expect(e!.trip).toBeUndefined();
    expect(e!.cattle).toEqual({ out: { cows: 2, oxen: 0 }, back: { cows: 0, oxen: 0 } });
  });
});

describe('výprava na trh ve scéně (markets.md – Rozhodnutí plánu 2, bod 2)', () => {
  /** Ves s výpravou na trh: vyrazí DAY, cesta 1 den, pobyt 3 dny, doma DAY + 8. */
  function withMarketTrip(day: number): ReturnType<typeof village> {
    const s = village();
    s.lastDay = day;
    s.trade!.expeditions = [
      {
        id: 9,
        kind: 'market',
        direction: 'E',
        trailId: -1,
        startedDay: DAY,
        give: { grain: 300 },
        get: {},
        porters: 12,
        days: 5,
        cost: 60,
        done: 0,
        destination: { cells: 2, firstStep: 'E' },
        market: {
          key: 'market:h:9',
          villageId: 'v-2',
          name: 'Lhota',
          wants: {},
          stayDays: 3,
          travelDays: 1,
          arriveDay: DAY + 1,
          returnDay: DAY + 5,
        },
      },
    ];
    s.labor = { day, shares: [] };
    return s;
  }

  it('bez stezky, čára ke kraji ve směru prvního kroku, jméno cílové vsi', () => {
    const [e] = sceneExpeditions(withMarketTrip(DAY));
    expect(e).toMatchObject({ id: 9, trailId: null, carriesOut: true, carriesBack: false });
    expect(e!.line![1]!.x).toBeGreaterThan(e!.line![0]!.x);
    expect(e!.trip).toEqual({ kind: 'trade', to: 'Lhota' });
  });

  it('výprava jen s mincemi nenese nic – mince nic neváží (plán 4)', () => {
    const s = withMarketTrip(DAY);
    s.trade!.expeditions[0]!.give = { coins: 20 };
    expect(sceneExpeditions(s)[0]).toMatchObject({ carriesOut: false, carriesBack: false });
    s.trade!.expeditions[0]!.give = { coins: 20, grain: 5 };
    expect(sceneExpeditions(s)[0]!.carriesOut).toBe(true);
  });

  it('ve dnech pobytu stojí – tempo 0 a stejný postup; jinak jde podle kalendáře', () => {
    const at = (day: number) => sceneExpeditions(withMarketTrip(day))[0]!;
    // cesta tam DAY, pobyt DAY + 1 … DAY + 3, cesta zpět DAY + 4, doma DAY + 5
    expect(at(DAY)).toMatchObject({ progress: 1, startDay: DAY });
    expect(at(DAY).rate).toBeGreaterThan(0);
    const first = at(DAY + 1);
    const middle = at(DAY + 2);
    expect(first.rate).toBe(0);
    expect(middle.rate).toBe(0);
    expect(middle.progress).toBe(first.progress);
    expect(at(DAY + 3).rate).toBe(0);
    const back = at(DAY + 4);
    expect(back.rate).toBeGreaterThan(0);
    expect(back.startDay).toBe(DAY + 4);
  });
});

describe('nákup u sousedů vozem ve scéně (crafts.md – Nákup u sousedů, Vozy)', () => {
  it('karavana nákupu ukáže vozy vsi a s každým honáka a pomocníka', () => {
    const s = village();
    s.lastDay = DAY;
    s.trade!.expeditions = [];
    s.purchases = [
      {
        direction: 'N',
        startedDay: DAY - 2,
        group: 2,
        days: 12,
        tripDays: 6,
        done: 2,
        trailId: 3,
        edge: { x: 0, z: 960 },
        get: { toolsKg: 20 },
        pay: { grainKg: 1200 },
        carts: [4],
      },
    ];
    const [e] = sceneExpeditions(s);
    expect(e).toMatchObject({ trailId: 3, porters: 2, carts: [4], cartCrew: 2 });
    expect(e!.trip).toEqual({ kind: 'purchase', to: legacyNeighbourName(s.seed, 'N') });
    s.purchases[0]!.carts = undefined;
    expect(sceneExpeditions(s)[0]!.carts).toEqual([]);
  });
});

describe('rodina ve dvorci (lord.md – Co hráč vidí)', () => {
  it('obyvatelé dvorce od nejstaršího; cvičící muži mají dovednosti, ženy ne', () => {
    const s = village();
    const day = DAY;
    const arms = { bow: 64.4, combat: 51, riding: 0 };
    s.people.find((p) => p.id === 502)!.dwellingId = s.manorId!;
    s.people.find((p) => p.id === 500)!.dwellingId = s.manorId!;
    s.people.find((p) => p.id === 501)!.dwellingId = s.manorId!;
    s.people.find((p) => p.id === 503)!.dwellingId = s.manorId!;
    s.people.find((p) => p.id === 502)!.arms = arms;
    const family = manorFamily(s, day);
    const by = (id: number) => family.find((m) => m.id === id);
    expect(by(500)?.role).toBe('Vojvoda');
    expect(by(500)?.arms).toEqual({ bow: 0, combat: 0, riding: 0 });
    expect(by(502)?.arms).toEqual({ bow: 64, combat: 51, riding: 0 });
    expect(by(501)?.arms).toBeNull();
    expect(by(503)?.arms).toBeNull();
    expect(by(502)?.horse).toBe(false);
    const ages = family.map((m) => m.age);
    expect(ages).toEqual([...ages].sort((a, b) => b - a));
  });
});

describe('kupci a zbroj v pohledu na dvorec (markets.md – Rozhodnutí plánu 4, body 8 a 15)', () => {
  const STOP: MerchantStop = { key: '0,0,E', seed: 987654321, index: 0, length: 1 };

  it('ves se zastávkou: den příštího příjezdu, zbroj s cenou dne a objednávkou, den posledního příjezdu', () => {
    const s = village();
    s.merchantStops = [STOP];
    s.armsOrder = { swords: 2 };
    const manor = manorView(s, DAY)!;
    const next = nextMerchantVisit([STOP], DAY)!;
    expect(manor.market.merchantsDay).toBe(next.day);
    expect(manor.market.merchantsDay).toBeGreaterThanOrEqual(DAY);
    expect(manor.market.arms).toEqual([
      { good: 'swords', price: 20, ordered: 2 },
      { good: 'mailShirts', price: 80, ordered: 0 },
      { good: 'helmets', price: 40, ordered: 0 },
    ]);
    expect(manor.market.merchantsArrived).toBeNull();
    // hladina trhu a poslední příjezd kupců
    s.market = {
      prices: {},
      visitors: [],
      nextOrder: 1,
      arrivals: [
        { name: '', day: DAY - 9, goods: [], merchants: true },
        { name: 'Lhota', day: DAY - 2, goods: [] },
        { name: '', day: DAY - 5, goods: [], merchants: true },
      ],
      level: 1.5,
    };
    const leveled = manorView(s, DAY)!.market;
    expect(leveled.arms[0]!.price).toBe(30);
    expect(leveled.merchantsArrived).toBe(DAY - 5);
  });

  it('kupci přijedou dnes: den příjezdu je dnešek, ne zítřek', () => {
    const s = village();
    s.merchantStops = [STOP];
    const visit = nextMerchantVisit([STOP], DAY)!;
    // den příjezdu zastávky je pevný; ve vsi s tímto dnem jako „dnes“ ho pohled nesmí posunout
    expect(manorView(s, visit.day)!.market.merchantsDay).toBe(visit.day);
  });

  it('ves bez stezky: žádná zbroj ani den', () => {
    const s = village();
    s.armsOrder = { swords: 2 };
    const { market } = manorView(s, DAY)!;
    expect(market.arms).toEqual([]);
    expect(market.merchantsDay).toBeNull();
    expect(market.merchantsArrived).toBeNull();
  });

  it('seed zastávky ani zastávky klientovi nejdou – ani v pohledu dvorce, ani v celém pohledu na ves', () => {
    const s = village();
    s.merchantStops = [STOP];
    expect(JSON.stringify(manorView(s, DAY))).not.toMatch(/987654321|merchantStops/);
    const real = generateLandscape(5);
    const found = foundVillage({
      seed: 3,
      day: DAY,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
    });
    found.merchantStops = [STOP];
    const view = buildVillageView(
      { id: 'v', settlementId: 's', name: 'Libice', state: found, version: 1 },
      real,
      DAY,
    );
    expect(JSON.stringify(view)).not.toMatch(/987654321|merchantStops/);
  });
});

describe('otroci ve dvorci (markets.md – Pravidla 7)', () => {
  it('ves se 3 otroky (1 pokřtěný) nese počty, bez otroků pole chybí', () => {
    const s = village();
    expect(manorView(s, DAY)!.slaves).toBeUndefined();
    s.people.push(
      person(600, 30, 'male', { slave: true }),
      person(601, 30, 'female', { slave: true }),
      person(602, 30, 'male', { slave: true, faith: 'christian' }),
    );
    expect(manorView(s, DAY)!.slaves).toEqual({ all: 3, baptized: 1 });
  });
});

describe('prodej otroků v pohledu dvorce (markets.md – Rozhodnutí plánu 5, bod 8)', () => {
  it('ves se 2 prodejními otroky a nabídkou 1 bez trhu: počty a cena dne', () => {
    const s = village();
    s.people.push(
      person(600, 25, 'male', { slave: true }),
      person(601, 22, 'female', { slave: true }),
    );
    s.slavesForSale = 1;
    const { market } = manorView(s, DAY)!;
    expect(market.slaveSale).toEqual({ stock: 2, forSale: 1, price: 4 });
    expect(market.slaveSale!.stock).toBe(market.stock.slaves);
  });

  it('nabídka nad zásobou zůstane vidět; ves bez otroků a nabídky nemá nic', () => {
    const s = village();
    expect(manorView(s, DAY)!.market.slaveSale).toBeNull();
    s.slavesForSale = 3;
    expect(manorView(s, DAY)!.market.slaveSale).toEqual({ stock: 0, forSale: 3, price: 4 });
  });
});
