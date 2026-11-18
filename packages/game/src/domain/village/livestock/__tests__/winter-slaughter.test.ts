import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { meatEnergy, villageFoodNeed } from '../../core/diet';
import { winterHayKg } from '../hay';
import { WILDLIFE_LAND } from '../../rules/rules-wildlife';
import { freshWildlife } from '../../wildlife/wildlife';
import { HERDING, herdingDemand, youngsterHerders } from '../herding';
import { winterHayNeedKg } from '../husbandry';
import {
  LIVESTOCK,
  breedingFloor,
  cullingMeatKg,
  freshMeatPerDayKg,
  nextSummerDay,
  retiringHeads,
  slaughter,
  slaughterRemaining,
  slaughterSeasonDaysLeft,
  wantedWinterHerds,
  winterSlaughterDay,
  winterWait,
  winterWaitHayKg,
} from '../livestock';
import { advanceVillage } from '../../core/simulate';
import type { DietDay, HerdSpecies, VillageState } from '../../types';
import { woolSheep } from '../wool';
import { withBuiltFirstDwelling, withRoomyPens } from '../../__tests__/village-fixtures';

// Porážka v zimě (diet.md – Porážka v zimě; Martin 19. 10. 2026): 1. 11. ves rozhodne, co nechá
// přes zimu (nosnost, místo pro jarní mláďata podle výrostků příštího léta, bez starých kusů),
// kusy na maso porazí po dnech přes zimu podle čerstvé spotřeby a jen přebytek udí.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});

function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  s.meatKg = 0;
  s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
  // ohrady všech druhů – stáda neomezí místa na noc (oxen.md – Ohrady podle druhu)
  withRoomyPens(s);
  return s;
}

/** Děti v prvním domě, které budou mít v den `day` daný věk (let). */
function addChildren(s: VillageState, ages: readonly number[], day: number): void {
  const home = s.people[0]!.dwellingId;
  for (const age of ages) {
    s.people.push({
      id: s.nextId++,
      bornDay: day - Math.round(age * 365.25),
      dwellingId: home,
      sex: s.nextId % 2 === 0 ? 'male' : 'female',
    });
  }
}

/** Stádo, které ves nechala přes zimu – bez kusů čekajících na zimní porážku. */
function kept(s: VillageState): Record<HerdSpecies, number> {
  const h = s.livestock!.herds;
  const c = s.livestock!.culling;
  return herds({
    sheep: h.sheep - (c?.sheep ?? 0),
    goat: h.goat - (c?.goat ?? 0),
    pig: h.pig - (c?.pig ?? 0),
    cow: h.cow - (c?.cow ?? 0),
  });
}

/**
 * Podíl energie, který dnes zbyl na maso – pevný příděl medu, mléko a vejce se jí před ním (diet.md
 * – Strava po vrstvách a porážka celý rok).
 */
const afterDairyAndEggs = (diet: DietDay): number =>
  1 - diet.shares.dairy - diet.shares.eggs - (diet.shares.honey ?? 0);

const grown = (h: Record<HerdSpecies, number>): Record<HerdSpecies, number> =>
  herds({
    sheep: h.sheep * (1 + LIVESTOCK.growth.sheep),
    goat: h.goat * (1 + LIVESTOCK.growth.goat),
    pig: h.pig * (1 + LIVESTOCK.growth.pig),
    cow: h.cow * (1 + LIVESTOCK.growth.cow),
  });

describe('porážka 1. 11. – co ves nechá přes zimu', () => {
  const day = at(600, 11, 1);

  it('výrostky příštího léta odhadne z věku dnešních dětí', () => {
    const s = village(day);
    s.people = s.people.slice(0, 2);
    // dnes 13,5 let (příští léto už 14) a 6,5 let (příští léto 7)
    addChildren(s, [13.5, 13.5], day);
    addChildren(s, [6.5, 6.5, 6.5], day);
    expect(youngsterHerders(s, day)).toBeCloseTo(2 * 0.4, 9);
    expect(nextSummerDay(day)).toBe(at(601, 7, 1));
    expect(youngsterHerders(s, nextSummerDay(day))).toBeCloseTo(3 * 0.4, 9);
    // před jarními mláďaty je příští léto letos
    expect(nextSummerDay(at(601, 3, 10))).toBe(at(601, 7, 1));
  });

  it('stádo přes zimu nechá místo pro jarní mláďata – kolik uhlídají výrostci příštího léta', () => {
    const s = village(day);
    s.people = s.people.slice(0, 2);
    addChildren(s, [13.5, 13.5], day);
    addChildren(s, [6.5, 6.5, 6.5], day);
    s.livestock!.herds = herds({ pig: 120, sheep: 150, goat: 10, cow: 12 });
    s.livestock!.young = herds({ pig: 60, sheep: 50, goat: 4, cow: 3 });
    slaughter(s, day, { oxen: 0, hayKg: Infinity });
    const summer = nextSummerDay(day);
    const capacity = youngsterHerders(s, summer);
    // stádo přes zimu s jarními mláďaty uhlídají tři výrostci příštího léta – ne dva dnešní
    const demand = herdingDemand(grown(kept(s)), 0, summer);
    expect(demand).toBeLessThanOrEqual(capacity + 1e-9);
    expect(demand).toBeGreaterThan(youngsterHerders(s, day));
    // chovné minimum zůstává
    const floor = breedingFloor({ minSheep: woolSheep(s, day) });
    for (const species of ['pig', 'goat', 'cow'] as const) {
      expect(kept(s)[species]).toBeGreaterThanOrEqual(floor[species] - 1e-9);
    }
  });

  it('chovné minimum zůstává, i když výrostci nebudou žádní – nad ně pase dospělý', () => {
    const s = village(day);
    s.people = s.people.slice(0, 2);
    s.livestock!.herds = herds({ pig: 30, sheep: 30, goat: 6, cow: 8 });
    const input = { oxen: 0, hayKg: Infinity, minCows: 3, minSheep: 6 };
    slaughter(s, day, input);
    const floor = herds({ pig: 2, sheep: 6, goat: 2, cow: 3 });
    for (const species of ['pig', 'sheep', 'goat', 'cow'] as const) {
      expect(kept(s)[species]).toBeGreaterThanOrEqual(floor[species] - 1e-9);
    }
    // bez výrostků pase dospělý za jednoho výrostka (diet.md – Pasáci, Dospělý pasák; Martin
    // 2. 11. 2026) – krávy napřed, nad chovné jen kolik uhlídá
    const summer = nextSummerDay(day);
    expect(herdingDemand(grown(kept(s)), 0, summer)).toBeCloseTo(HERDING.adultShare, 9);
    expect(kept(s).cow).toBeGreaterThan(floor.cow);
    expect(kept(s).pig).toBeCloseTo(floor.pig, 9);
  });

  it('staré kusy jdou na maso – i když ves maso nestihne sníst', () => {
    const s = village(day);
    addChildren(s, [7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12], day);
    s.livestock!.herds = herds({ pig: 20, sheep: 40, cow: 6 });
    s.livestock!.young = herds({ pig: 10, sheep: 10, cow: 1 });
    s.meatKg = 10_000;
    const old = retiringHeads(s.livestock!.herds, s.livestock!.young);
    expect(old).toEqual(herds({ pig: 10 / 4, sheep: 30 / 8, cow: 5 / 10 }));
    const event = slaughter(s, day, { oxen: 0, hayKg: Infinity });
    // masa je dost na rok – nad staré kusy nic
    expect(kept(s).pig).toBeCloseTo(20 - old.pig, 9);
    expect(kept(s).sheep).toBeCloseTo(40 - old.sheep, 9);
    expect(kept(s).cow).toBeCloseTo(6 - old.cow, 9);
    expect(event).toMatchObject({
      kind: 'slaughter',
      kg: Math.round(
        old.pig * LIVESTOCK.meatKg.pig +
          old.sheep * LIVESTOCK.meatKg.sheep +
          old.cow * LIVESTOCK.meatKg.cow,
      ),
    });
  });
});

describe('zimní porážka po dnech', () => {
  const day = at(600, 11, 1);

  it('kusy na maso počkají, kolik ves přes zimu sní čerstvého – přebytek se hned udí', () => {
    const s = village(day);
    s.people = s.people.slice(0, 2);
    // velké stádo prasat, přes rok ho nikdo nepásl – na zimu zbyde chovný pár
    s.livestock!.herds = herds({ pig: 60 });
    const event = slaughter(s, day, { oxen: 0, hayKg: Infinity, herding: 0 });
    const freshKg = freshMeatPerDayKg(s, day) * 151;
    const totalKg = 58 * LIVESTOCK.meatKg.pig;
    expect(freshKg).toBeLessThan(totalKg);
    // čerstvé maso přes zimu čeká živé, zbytek je uzený
    expect(cullingMeatKg(s)).toBeCloseTo(freshKg, 6);
    expect(s.meatKg).toBeCloseTo(totalKg - freshKg, 6);
    expect(event).toMatchObject({ kind: 'slaughter', kg: totalKg, fresh: Math.round(freshKg) });
  });

  it('porážka jde po dnech přes celou zimu – denně díl čekajících kusů, maso se jí čerstvé', () => {
    const s = village(day - 1);
    s.people = s.people.slice(0, 2);
    s.livestock!.herds = herds({ pig: 8 });
    // bez medvěda (bere prasata absolutně, 2 za sezónu – wildlife.md): test hlídá jen porážku
    s.wildlife = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 8);
    s.wildlife.bear = { present: false, backDay: null };
    // bez ryb (od 18. 11. 2026 se loví vždy a čerstvé maso z vody by měnilo, kolik se jí z porážky)
    s.wildlife.fishKg = 0;
    const nov = advanceVillage(s, day, null);
    const waiting = cullingMeatKg(nov);
    expect(waiting).toBeGreaterThan(0);
    // čekající kusy dají míň, než ves za zimu sní – žádný přebytek do uzení
    expect(nov.meatKg ?? 0).toBeCloseTo(0, 6);
    // první den porážky se jí čerstvé maso – díl na dnešek (maso čekajících ÷ dny zimy)
    const firstKg = waiting / (slaughterSeasonDaysLeft(day) - 1);
    const need = villageFoodNeed(nov, day);
    // (čekající kusy ubývají i ztrátami stáda – na 4 desetinná místa)
    expect(nov.diet!.shares.freshMeat).toBeCloseTo(meatEnergy(firstKg) / need, 4);
    expect(nov.diet!.shares.freshMeat).toBeLessThan(afterDairyAndEggs(nov.diet!));
    expect(nov.diet!.energy).toBeCloseTo(1, 6);
    const next = advanceVillage(nov, day + 1, null);
    const perDay = waiting / slaughterSeasonDaysLeft(day + 1);
    expect(waiting - cullingMeatKg(next)).toBeCloseTo(perDay, 1);
    expect(perDay).toBeCloseTo(firstKg, 1);
    expect(next.meatKg ?? 0).toBeCloseTo(nov.meatKg ?? 0, 0);
    // práce porážky – přes zimu po dnech, každý den za dnešní maso (i tady ztráty stáda)
    expect(
      next.livestock!.slaughterWork!.required - nov.livestock!.slaughterWork!.required,
    ).toBeCloseTo(perDay / LIVESTOCK.slaughterKgPerManDay, 4);
    // maso je každý den celou zimu (Martin 18. 11. 2026: „kníže … chce mít maso na stole nejlépe
    // každý den“) – v prosinci i v březnu čekají kusy a jí se čerstvé
    const december = advanceVillage(next, at(600, 12, 1), null);
    expect(cullingMeatKg(december)).toBeGreaterThan(0);
    expect(december.diet!.shares.freshMeat).toBeGreaterThan(0);
    const march = advanceVillage(december, at(601, 3, 20), null);
    expect(cullingMeatKg(march)).toBeGreaterThan(0);
    expect(march.diet!.shares.freshMeat).toBeGreaterThan(0);
    const later = advanceVillage(march, at(601, 4, 2), null);
    expect(later.livestock!.culling).toBeUndefined();
  });

  it('zimní tempo – denně zbývající maso čekajících kusů děleno zbývajícími dny zimy', () => {
    const december = at(600, 12, 1);
    const s = village(december);
    s.livestock!.herds = herds({ pig: 20, sheep: 10 });
    s.livestock!.culling = herds({ pig: 9, sheep: 10 });
    expect(cullingMeatKg(s)).toBeCloseTo(600, 9);
    winterSlaughterDay(s, december);
    expect(s.freshMeatKg).toBeCloseTo(600 / slaughterSeasonDaysLeft(december), 6);
    // napřed ovce (žerou seno), prasata v lese naposled
    expect(s.livestock!.culling!.pig).toBeCloseTo(9, 9);
    expect(s.livestock!.herds.sheep).toBeCloseTo(10 - s.freshMeatKg! / LIVESTOCK.meatKg.sheep, 9);
    // zítra stejný díl – zbytek se rozloží na zbývající dny
    delete s.freshMeatKg;
    winterSlaughterDay(s, december + 1);
    expect(s.freshMeatKg).toBeCloseTo(600 / slaughterSeasonDaysLeft(december), 6);
  });

  it('do konce zimy se zbytek porazí a udí; od jara do podzimu jen kus pro rod vojvody', () => {
    const s = village(at(601, 3, 30));
    s.livestock!.herds = herds({ pig: 30, sheep: 20 });
    s.livestock!.culling = herds({ pig: 10, sheep: 5 });
    // dnes zbývá jen den porážky – zbytek do uzení
    winterSlaughterDay(s, at(601, 3, 31));
    expect(s.livestock!.culling).toBeUndefined();
    const smoked = s.meatKg!;
    expect(smoked).toBeGreaterThan(0);
    expect(s.livestock!.herds).toEqual(herds({ pig: 20, sheep: 15 }));
    // jaro až podzim – stádo roste mláďaty a ubývá ztrátami; poráží se jen kus pro rod vojvody,
    // když mu nestačí maso v zásobě (diet.md – Strava po vrstvách a porážka celý rok), bez kroniky
    s.lastDay = at(601, 3, 31);
    delete s.freshMeatKg;
    // bez tůní – ryby by rodu maso daly a letní porážka by nebyla potřeba
    s.wildlife = freshWildlife({ ...WILDLIFE_LAND.defaultLand, waterHa: 0, pools: 0 }, 0);
    const july = advanceVillage(s, at(601, 7, 31), null);
    const autumn = advanceVillage(july, at(601, 10, 31), null);
    const kinds = new Set(autumn.chronicle.filter((e) => e.day > s.lastDay).map((e) => e.kind));
    expect(kinds.has('slaughter')).toBe(false);
    expect(kinds.has('emergency-slaughter')).toBe(false);
    // uzené ze zimy do léta došlo – rod dostal maso z letní porážky, chovné stádo i mláďata zůstala
    const summer = autumn.livestock!.summerSlaughtered ?? {};
    expect((summer.pig ?? 0) + (summer.sheep ?? 0)).toBeGreaterThanOrEqual(1);
    expect(july.livestock!.herds.pig).toBeGreaterThan(20);
    expect(july.livestock!.young.sheep).toBeGreaterThan(0);
    expect(autumn.livestock!.herds.sheep).toBeGreaterThan(2);
    // práce porážky i v létě – za den hotová
    expect(slaughterRemaining(autumn)).toBeCloseTo(0, 6);
  });
});

describe('seno a čekající kusy', () => {
  it('seč 1. 6. počítá se senem pro kusy, které čekají na zimní porážku', () => {
    const day = at(601, 6, 1);
    const s = village(day);
    s.people = s.people.slice(0, 2);
    s.livestock!.herds = herds({ cow: 20, sheep: 60 });
    s.livestock!.young = herds({ cow: 4, sheep: 20 });
    const need = winterHayNeedKg(s, day);
    const keep = wantedWinterHerds(s, day, { oxen: 0, minCows: 2, minSheep: woolSheep(s, day) });
    const waitHay = winterWaitHayKg(s, day, keep, 0);
    expect(waitHay).toBeGreaterThan(0);
    expect(need).toBeCloseTo(winterHayKg(keep, 2 * 0) + waitHay, 6);
  });

  it('když seno nestačí, kusy, které neuživí, se porazí hned a udí', () => {
    const day = at(600, 11, 1);
    const s = village(day);
    const keep = herds({ cow: 2, sheep: 4 });
    const killed = herds({ cow: 1, sheep: 4 });
    const plenty = winterWait(s, day, keep, killed, Infinity, 0);
    expect(plenty.cow + plenty.sheep).toBeGreaterThan(0);
    // seno jen na stádo přes zimu – čekat nemůže nikdo
    const none = winterWait(s, day, keep, killed, winterHayKg(keep, 0) / 0.98, 0);
    expect(none.cow).toBeCloseTo(0, 6);
    expect(none.sheep).toBeLessThan(plenty.sheep);
    // napřed ubere krávy (porážejí se poslední, nejdéle žerou); seno na ovce, které čekají celou
    // zimu (porážka rozložená na zimu – bez krav i ovce čekají déle), ne na krávu
    const some = winterWait(s, day, keep, killed, winterHayKg(keep, 0) * 1.25, 0);
    expect(some.cow).toBeLessThan(plenty.cow);
    expect(some.sheep).toBeCloseTo(plenty.sheep, 6);
  });
});

describe('čerstvé maso ve stravě', () => {
  it('čerstvé maso se jí napřed, uzené počká – bez stropu do plné potřeby', () => {
    const day = at(600, 12, 1);
    const s = village(day - 1);
    s.people = s.people.slice(0, 2);
    s.meatKg = 300;
    s.livestock!.herds = herds({ pig: 10 });
    s.livestock!.culling = herds({ pig: 4 });
    const next = advanceVillage(s, day, null);
    // dnes jen čerstvé – do plné potřeby po vejcích a mléce (dřív strop masa 40 %)
    expect(next.diet!.shares.freshMeat).toBeCloseTo(afterDairyAndEggs(next.diet!), 6);
    expect(next.diet!.shares.meat).toBeCloseTo(afterDairyAndEggs(next.diet!), 6);
    expect(next.diet!.energy).toBeCloseTo(1, 6);
    // uzené čeká (jen uzení ubere)
    expect(next.meatKg!).toBeGreaterThan(299);
    const need = villageFoodNeed(next, day);
    expect(need).toBeGreaterThan(0);
  });
});
