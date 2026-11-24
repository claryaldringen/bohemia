import { describe, expect, it } from 'vitest';
import { craftCoverage } from '../../crafts/crafts';
import { stewardOutlook } from '../../steward/steward-outlook';
import { peopleSpare } from '../../../vassalage/spare';
import type { MarketArrival, MarketPerson, MarketResult, Person } from '../../types';
import {
  peopleWanted,
  receiveStranded,
  restorePeople,
  settlePeople,
  takePeople,
} from '../market-people';
import { marketStance } from '../market-stance';
import {
  MARKET_NO_PEOPLE,
  applyMarketResult,
  departMarket,
  marketFreeAdults,
  marketPeopleOffer,
  planMarketTrip,
} from '../market-trip';
import { emigrantGroups } from '../people-trade';
import { addGood } from '../trade';
import {
  D,
  FAMILY_HOUSE,
  FAMILY_IDS,
  familyHome,
  marketVillage,
  sownPart,
  target,
} from './market-fixtures';

// Lidé na trhu (markets.md – Rozhodnutí plánu 3, bod 10; Martin 19. 10. 2026: „celé rodiny i jen
// dospělí“, „muži a ženy zvlášť“): odchod ze vsi, příchod do jiné vsi s novými id, návrat domů
// s původními id. Nikdo nevznikne ani nezmizí.

/** Id lidí vzestupně. */
const ids = (people: readonly Person[]): number[] => people.map((p) => p.id).sort((a, b) => a - b);

/** Lidé rodiny na prodej ve vsi. */
const family = (people: readonly Person[]): Person[] =>
  people.filter((p) => FAMILY_IDS.includes(p.id));

describe('lidé na trhu (markets.md – Rozhodnutí plánu 3, bod 10)', () => {
  it('takePeople: rodina odejde ze vsi do emigrants se směrem, záznamy s původními id a vazbami', () => {
    const s = familyHome();
    const before = structuredClone(family(s.people));
    const groups = takePeople(s, D, 'families', 1, 'E');
    expect(groups).toEqual([{ good: 'families', people: before }]);
    expect(family(s.people)).toEqual([]);
    expect(
      (s.emigrants ?? []).filter((e) => FAMILY_IDS.includes(e.id)).map((e) => [e.id, e.direction]),
    ).toEqual(FAMILY_IDS.map((id) => [id, 'E']));
    // syn 66 ve vsi zůstal se ženou
    expect(s.people.find((p) => p.id === 66)).toMatchObject({ spouseId: 67, motherId: 63 });
  });

  it('settlePeople: nová id od nextId, vazby rodiny přepsané, ven přerušené, origin, kronika', () => {
    const groups = takePeople(familyHome(), D, 'families', 1, 'E');
    const m = marketVillage();
    const next = m.nextId;
    const events = settlePeople(m, D, groups, {
      villageId: 'h',
      villageName: 'Vlkov',
      direction: 'W',
    });
    const came = m.people.filter((p) => p.id >= next);
    expect(ids(came)).toEqual([next, next + 1, next + 2, next + 3]);
    const [father, mother, son] = [next, next + 1, next + 2].map((id) =>
      came.find((p) => p.id === id)!,
    );
    expect(father).toMatchObject({ spouseId: next + 1, origin: 'W' });
    // matka otce (7) zůstala jinde – vazba ven je přerušená
    expect(father!.motherId).toBeUndefined();
    expect(mother).toMatchObject({ spouseId: next, origin: 'W' });
    expect(son).toMatchObject({ motherId: next + 1, fatherId: next, origin: 'W' });
    expect(new Set(came.map((p) => p.dwellingId)).size).toBe(1);
    expect(m.nextId).toBe(next + 4);
    expect(events).toEqual([
      {
        day: D,
        kind: 'newcomer',
        direction: 'W',
        group: 'family',
        people: 4,
        dwellingId: father!.dwellingId,
        villageName: 'Vlkov',
        villageId: 'h',
      },
    ]);
  });

  it('restorePeople: vlastní lidé zpět s původními id a vazbami, emigrants bez nich, nextId stejné', () => {
    const s = familyHome();
    const nextId = s.nextId;
    const groups = takePeople(s, D, 'families', 1, 'E');
    restorePeople(s, groups);
    const back = family(s.people);
    expect(ids(back)).toEqual(FAMILY_IDS);
    expect(back.find((p) => p.id === 62)).toMatchObject({ spouseId: 63, motherId: 7 });
    expect(back.find((p) => p.id === 64)).toMatchObject({ motherId: 63, fatherId: 62 });
    expect(new Set(back.map((p) => p.dwellingId)).size).toBe(1);
    expect((s.emigrants ?? []).filter((e) => FAMILY_IDS.includes(e.id))).toEqual([]);
    // živí nejsou ani v rodokmenu zemřelých a odešlých
    expect((s.ancestors ?? []).filter((a) => FAMILY_IDS.includes(a.id))).toEqual([]);
    expect(s.nextId).toBe(nextId);
    // podruhé nic – kdo je doma, se nezdvojí
    restorePeople(s, groups);
    expect(family(s.people)).toHaveLength(4);
  });

  it('receiveStranded: skupinu, kterou hostitel sám prodal (`own`), vrátí s původními id, muž z H se usadí', () => {
    // Lhota (M = familyHome) prodala rodinu výpravě z Vlkova (H na západě), Vlkov pak zanikl:
    // výsledek s neprodaným mužem H (`people`) a rodinou, kterou prodala sama M (`own` – `fromHost`),
    // jde zpět k M (markets.md – Rozhodnutí plánu 3, bod 13)
    const m = familyHome();
    const sold = takePeople(m, D, 'families', 1, 'W');
    const before = structuredClone(sold[0]!.people);
    const nextId = m.nextId;
    // muž z H má id 62 jako otec rodiny, ale jiný den narození – není to ten, koho M prodala
    const man: MarketPerson = {
      good: 'men',
      people: [{ id: 62, bornDay: D - 9_000, dwellingId: 3, sex: 'male', motherId: 4 }],
    };
    const from = { villageId: 'h', villageName: 'Vlkov', direction: 'W' as const };
    const own = sold.map((g) => ({ ...g, fromHost: true as const }));
    const events = receiveStranded(m, D + 2, { key: 'market:h:1', people: [man], own, from });
    // rodina zpět s původními id a vazbami, z `emigrants` pryč
    expect(ids(family(m.people))).toEqual(FAMILY_IDS);
    expect(family(m.people).map((p) => ({ ...p, dwellingId: 0 }))).toEqual(
      before.map((p) => ({ ...p, dwellingId: 0 })),
    );
    expect((m.emigrants ?? []).filter((e) => FAMILY_IDS.includes(e.id))).toEqual([]);
    // muž z H dostal nové id (jediné – rodina má svá), přišel ze západu
    expect(m.nextId).toBe(nextId + 1);
    expect(m.people.filter((p) => p.id === 62)).toHaveLength(1);
    const newcomer = m.people.find((p) => p.id === nextId)!;
    expect(newcomer).toMatchObject({ sex: 'male', bornDay: D - 9_000, origin: 'W' });
    expect(newcomer.motherId).toBeUndefined();
    // kronika: vrácená rodina (`returned`) i usazený muž
    expect(events).toEqual([
      {
        day: D + 2,
        kind: 'newcomer',
        direction: 'W',
        group: 'family',
        people: 4,
        dwellingId: family(m.people)[0]!.dwellingId,
        villageName: 'Vlkov',
        villageId: 'h',
        returned: true,
      },
      {
        day: D + 2,
        kind: 'newcomer',
        direction: 'W',
        group: 'man',
        people: 1,
        dwellingId: newcomer.dwellingId,
        villageName: 'Vlkov',
        villageId: 'h',
      },
    ]);
  });

  it('receiveStranded: cizí skupina se shodou emigranta a kolizním id se usadí – nikdo nezmizí, id se nezdvojí', () => {
    // sonda kontroly úlohy 10: M prodala rodinu 62–65 jinam; výprava z H (osadníci z M) veze otce 62
    // (týž člověk jako v `emigrants` M – id i den narození) a batole narozené v H s id 64, které
    // v M patří skutečnému dítěti rodiny. Skupinu neprodala M – usadí se jako noví lidé.
    const m = familyHome();
    const sold = takePeople(m, D, 'families', 1, 'W');
    const emigrants = structuredClone(m.emigrants);
    const ancestors = structuredClone(m.ancestors);
    const nextId = m.nextId;
    const father = sold[0]!.people.find((p) => p.id === 62)!;
    const group: MarketPerson = {
      good: 'families',
      people: [
        structuredClone(father),
        { id: 64, bornDay: D - 400, dwellingId: 1, sex: 'female', motherId: 99, fatherId: 62 },
      ],
    };
    const from = { villageId: 'h', villageName: 'Vlkov', direction: 'W' as const };
    receiveStranded(m, D + 2, { key: 'market:h:1', people: [group], from });
    // oba dostali nová id, emigranti a rodokmen M beze změny
    expect(m.nextId).toBe(nextId + 2);
    expect(ids(m.people.filter((p) => p.id >= nextId))).toEqual([nextId, nextId + 1]);
    expect(m.emigrants).toEqual(emigrants);
    expect(m.ancestors).toEqual(ancestors);
    // skutečná rodina se pak vrátí neprodaná – celá, s původními id
    const count = m.people.length;
    restorePeople(m, sold);
    expect(m.people).toHaveLength(count + 4);
    expect(ids(family(m.people))).toEqual(FAMILY_IDS);
    expect(new Set(m.people.map((p) => p.id)).size).toBe(m.people.length);
  });

  it('receiveStranded: vlastní skupina, jejíž id je obsazené (nemá nastat), se usadí s novými id', () => {
    const m = familyHome();
    const sold = takePeople(m, D, 'families', 1, 'W');
    restorePeople(m, sold);
    const count = m.people.length;
    const nextId = m.nextId;
    const from = { villageId: 'h', villageName: 'Vlkov', direction: 'W' as const };
    receiveStranded(m, D + 2, { key: 'market:h:1', people: [], own: sold, from });
    expect(m.people).toHaveLength(count + 4);
    expect(m.nextId).toBe(nextId + 4);
    expect(new Set(m.people.map((p) => p.id)).size).toBe(m.people.length);
  });

  it('receiveStranded: bez `from` (výsledek bez směru) se cizí usadí bez směru a kroniky, nikdo nezmizí', () => {
    const m = familyHome();
    const count = m.people.length;
    const man: MarketPerson = {
      good: 'men',
      people: [{ id: 5, bornDay: D - 9_000, dwellingId: 3, sex: 'male' }],
    };
    expect(
      receiveStranded(m, D + 2, { key: 'market:h:1', people: [man], from: undefined }),
    ).toEqual([]);
    expect(m.people).toHaveLength(count + 1);
    expect(m.people.at(-1)!.origin).toBeUndefined();
  });

  it('peopleWanted: půdy 12 ha, práce 8 ha, 10 dospělých → chybí 5 dospělých → 3 rodiny', () => {
    const s = familyHome();
    const outlook = { ...stewardOutlook(s, D, craftCoverage(s, D)), landHa: 12, laborHa: 8 };
    expect(peopleWanted(s, D, outlook)).toEqual({ families: 3, men: 0, women: 0 });
    // práce stačí na půdu – ves lidi neshání
    expect(peopleWanted(s, D, { ...outlook, laborHa: 12 })).toEqual({
      families: 0,
      men: 0,
      women: 0,
    });
  });

  it('hostitel nabízí lidi nad práci – jen tolik, kolik jde vybrat najednou', () => {
    const s = familyHome();
    // jeden osetý díl a orba lidmi (bez spřežení) – práce je mnohem víc než půdy
    s.fields = [{ id: 1 }];
    s.parts = [sownPart(100)];
    s.pens = (s.pens ?? []).filter((p) => p.team === undefined || p.team === null);
    // svobodný syn rodiny 19 let: smí odejít s rodinou, nebo sám jako muž – ne obojí
    s.people.push({
      id: 68,
      bornDay: D - Math.ceil(19.5 * 365.25),
      dwellingId: FAMILY_HOUSE,
      sex: 'male',
      motherId: 63,
      fatherId: 62,
    });
    const outlook = stewardOutlook(s, D, craftCoverage(s, D));
    expect(outlook.laborHa).toBeGreaterThan(outlook.landHa);
    expect(peopleSpare(s, D, outlook)).toEqual({ families: 1, men: 1, women: 0 });
    const stance = marketStance(s, D);
    expect(stance.offer.families).toBe(1);
    expect(stance.offer.men).toBeUndefined();
    expect(stance.wants.families).toBeUndefined();
  });

  it('addGood lidi neumí – smyčka, která na lidi zapomene, spadne', () => {
    expect(() => addGood(familyHome(), 'men', 1, D)).toThrow();
  });

  it('applyMarketResult s lidmi: neprodaná rodina zpět s původními id, koupený muž s novým id', () => {
    const sent = departMarket(
      familyHome(),
      D,
      { give: { families: 1 }, wants: { men: 1 }, stayDays: 1 },
      target,
    );
    if (!sent.ok) throw new Error(sent.reason);
    expect(family(sent.state.people)).toEqual([]);
    const body = sent.state.outbox![0]!.body as { kind: 'market-arrive'; arrival: MarketArrival };
    const arrival = body.arrival;
    expect(arrival.goods).toMatchObject({ families: 1 });
    expect(arrival.people!.flatMap((g) => g.people.map((p) => p.id))).toEqual(FAMILY_IDS);
    const home = structuredClone(sent.state);
    delete home.outbox;
    const nextId = home.nextId;
    // muž z Lhoty má id, které ve Vlkově už někdo má – dostane nové
    const man: MarketPerson = {
      good: 'men',
      people: [{ id: 60, bornDay: D - 9_000, dwellingId: 3, sex: 'male', motherId: 4 }],
    };
    const result: MarketResult = {
      key: sent.trip.key,
      sold: {},
      bought: { men: 1 },
      unsold: { families: 1 },
      horses: [],
      people: arrival.people!,
      newcomers: [man],
    };
    const events = applyMarketResult(home, D + 2, result);
    expect(ids(family(home.people))).toEqual(FAMILY_IDS);
    expect(home.people.filter((p) => p.id === 60)).toHaveLength(1);
    expect(home.people.find((p) => p.id === nextId)).toMatchObject({
      sex: 'male',
      origin: 'E',
      bornDay: D - 9_000,
    });
    expect(home.people.find((p) => p.id === nextId)!.motherId).toBeUndefined();
    expect(home.nextId).toBe(nextId + 1);
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: 'newcomer',
        group: 'man',
        people: 1,
        direction: 'E',
        villageName: 'Lhota',
        villageId: 'm',
      }),
    );
    expect(home.trade!.expeditions.filter((e) => e.kind === 'market')).toEqual([]);
  });

  it('nosičem není nikdo z prodávaných: jediní volní dospělí jsou rodina na prodej', () => {
    const s = familyHome();
    for (const p of s.people) {
      if (!FAMILY_IDS.includes(p.id)) p.away = { kind: 'labor', untilDay: D + 30 };
    }
    const order = { give: { families: 1 }, wants: {}, stayDays: 1 };
    expect(planMarketTrip(s, D, order, target)).toEqual({ ok: false, reason: MARKET_NO_PEOPLE });
    // další volný dospělý – nosič
    delete s.people.find((p) => p.id === 60)!.away;
    expect(planMarketTrip(s, D, order, target)).toMatchObject({ ok: true, porters: 1, carts: 0 });
  });
});

describe('marketPeopleOffer – nabídka lidí pro náhled výpravy (plán 3, Úloha 11)', () => {
  it('rodiny, muži a ženy se berou z týchž lidí a nosiči ubývají o prodávané dospělé', () => {
    const s = familyHome();
    const offer = marketPeopleOffer(s, D);
    const all = emigrantGroups(s, D, { families: Infinity, men: Infinity, women: Infinity });
    expect(offer.stock).toEqual({
      families: all.families.length,
      men: all.men.length,
      women: all.women.length,
    });
    expect(offer.stock.families).toBe(1);
    // rodina 62 + 63 má dva dospělé, děti se do nosičů nepočítají
    expect(offer.adults.families).toEqual([2]);
    expect(offer.adults.men).toEqual(all.men.map(() => 1));
    // server: volní dospělí vsi bez odcházející rodiny
    const plan = planMarketTrip(s, D, { give: { families: 1 }, wants: {}, stayDays: 1 }, target);
    expect(plan.ok).toBe(true);
    expect(marketFreeAdults(s, D) - 2).toBe(marketFreeAdults(takeWithout(s), D));
  });
});

/** Ves bez rodiny 62–65 (mělká kopie jako `withoutGroups`). */
function takeWithout(s: ReturnType<typeof familyHome>): ReturnType<typeof familyHome> {
  return { ...s, people: s.people.filter((p) => !FAMILY_IDS.includes(p.id)) };
}
