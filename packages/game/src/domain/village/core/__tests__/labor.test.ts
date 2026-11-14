import { describe, expect, it } from 'vitest';
import {
  adultDailyMin,
  afterConstructions,
  allocateDay,
  householdElders,
  householdWaterLabor,
  menCommon,
  waterFetchingLabor,
} from '../labor';
import { NO_CRAFTS, dailyMinPerHousehold } from '../productivity';
import { LABOR_PER_DAY, WATER_FETCHING, WEEDING_WOMEN } from '../../rules';
import type { Person } from '../../types';

const base = {
  capacity: 2.6,
  householdElders: [0],
  tasks: [],
  potteryCoverage: NO_CRAFTS.pottery,
};
const DAILY_MIN = dailyMinPerHousehold(NO_CRAFTS.pottery);

function sum(r: ReturnType<typeof allocateDay>): number {
  return (
    r.dailyMin + r.horseCare + r.away + Object.values(r.tasks).reduce((a, b) => a + b, 0) + r.common
  );
}

describe('allocateDay', () => {
  it('bez úloh: minimum, zbytek společná práce (domácí výroba jde bokem)', () => {
    const r = allocateDay(base);
    expect(r.dailyMin).toBeCloseTo(DAILY_MIN);
    expect(r.eldersDailyMin).toBe(0);
    expect(r.common).toBeCloseTo(2.6 - DAILY_MIN);
    expect(sum(r)).toBeCloseTo(2.6);
    expect(r.tasks.dig).toBe(0);
  });
  it('denní minimum podle pokrytí nádobami: bez hrnčíře 0,5, s plným pokrytím 0,45', () => {
    expect(allocateDay(base).dailyMin).toBeCloseTo(0.5, 9);
    expect(
      allocateDay({ ...base, householdElders: [0, 0], potteryCoverage: 1 }).dailyMin,
    ).toBeCloseTo(0.9, 9);
  });
  it('kování je všechno nebo nic – částečná práce se neodečte', () => {
    expect(allocateDay({ ...base, shoeing: 0.5 }).shoeing).toBeCloseTo(0.5, 9);
    // kapacita 2,6 − minimum 0,5 = 2,1 – víc kování se nevejde, práce zůstane ostatním
    const r = allocateDay({ ...base, shoeing: 5 });
    expect(r.shoeing).toBe(0);
    expect(r.common).toBeCloseTo(2.6 - DAILY_MIN, 9);
  });
  it('úlohy v daném pořadí', () => {
    const r = allocateDay({
      ...base,
      tasks: [
        { name: 'sow', remaining: 1 },
        { name: 'dig', remaining: 5 },
      ],
    });
    expect(r.tasks.sow).toBeCloseTo(1);
    expect(r.tasks.dig).toBeCloseTo(2.6 - DAILY_MIN - 1);
    expect(r.common).toBe(0);
    expect(sum(r)).toBeCloseTo(2.6);
  });
  it('stejná úloha dvou plodin: práce po úlohách vstupu v jejich pořadí', () => {
    const r = allocateDay({
      ...base,
      tasks: [
        { name: 'dig', remaining: 1.5 },
        { name: 'orchard-harvest', remaining: 0.2 },
        { name: 'dig', remaining: 5 },
      ],
    });
    expect(r.taskAmounts.map((a) => Number(a.toFixed(6)))).toEqual([1.5, 0.2, 0.4]);
    expect(r.tasks.dig).toBeCloseTo(1.9);
    expect(sum(r)).toBeCloseTo(2.6);
  });
  it('práce v sadu jde mezi polní úlohy v daném pořadí', () => {
    const r = allocateDay({
      ...base,
      tasks: [
        { name: 'orchard-harvest', remaining: 1.5 },
        { name: 'dig', remaining: 5 },
      ],
    });
    expect(r.tasks['orchard-harvest']).toBeCloseTo(1.5);
    expect(r.tasks.dig).toBeCloseTo(0.6);
    expect(r.tasks['orchard-care']).toBe(0);
    expect(sum(r)).toBeCloseTo(2.6);
  });
  it('lidé na výpravách: po denním minimu, před úlohami dne (trade.md – Doprava)', () => {
    const r = allocateDay({ ...base, away: 1.5, tasks: [{ name: 'dig', remaining: 5 }] });
    expect(r.dailyMin).toBeCloseTo(DAILY_MIN);
    expect(r.away).toBeCloseTo(1.5);
    expect(r.tasks.dig).toBeCloseTo(2.6 - DAILY_MIN - 1.5);
    expect(sum(r)).toBeCloseTo(2.6);
    // bez práce navíc dostane výprava jen to, co zbude po denním minimu
    const short = allocateDay({ ...base, capacity: 1, away: 3 });
    expect(short.dailyMin).toBeCloseTo(DAILY_MIN);
    expect(short.away).toBeCloseTo(1 - DAILY_MIN);
    expect(short.common).toBe(0);
    expect(allocateDay(base).away).toBe(0);
  });
  it('péče o koně: hned za denním minimem, před výpravami (horses.md – Péče)', () => {
    // 5 koní = 0,5 člověkodne z práce vsi
    const r = allocateDay({
      ...base,
      horseCare: 0.5,
      away: 1.5,
      tasks: [{ name: 'dig', remaining: 5 }],
    });
    expect(r.dailyMin).toBeCloseTo(DAILY_MIN);
    expect(r.horseCare).toBeCloseTo(0.5);
    expect(r.away).toBeCloseTo(1.5);
    expect(r.tasks.dig).toBeCloseTo(2.6 - DAILY_MIN - 0.5 - 1.5);
    expect(sum(r)).toBeCloseTo(2.6);
    // málo práce: péče před výpravou, výprava dostane zbytek
    const short = allocateDay({ ...base, capacity: DAILY_MIN + 0.3, horseCare: 0.5, away: 1 });
    expect(short.horseCare).toBeCloseTo(0.3);
    expect(short.away).toBe(0);
    expect(allocateDay(base).horseCare).toBe(0);
  });
  it('malá kapacita: vše ostatní nula, nic záporné', () => {
    const r = allocateDay({ ...base, capacity: 0.3, tasks: [{ name: 'dig', remaining: 3 }] });
    expect(r.dailyMin).toBeCloseTo(0.3);
    expect(r.tasks.dig).toBe(0);
    expect(r.common).toBe(0);
  });
  it('produktivita násobí práci vsi, minimum zůstává', () => {
    const r = allocateDay({ ...base, productivity: 0.8 });
    expect(r.dailyMin).toBeCloseTo(DAILY_MIN);
    expect(r.common).toBeCloseTo(2.6 * 0.8 - DAILY_MIN);
  });
});

describe('lehká práce žen řemeslníků (crafts.md – Kdo dělá řemeslo)', () => {
  const heavy = [
    { name: 'plough' as const, remaining: 5 },
    { name: 'reclaim' as const, remaining: 5 },
  ];
  it('nepokryje orbu, kácení ani stavby: bez kapacity zůstanou těžké úlohy i společná práce prázdné', () => {
    const r = allocateDay({ ...base, capacity: 0, light: 3, tasks: heavy });
    expect(r.tasks.plough).toBe(0);
    expect(r.tasks.reclaim).toBe(0);
    expect(r.common).toBe(0);
  });
  it('pokryje setí, okopávání, žně a výmlat; co nevyužije, propadne', () => {
    const r = allocateDay({
      ...base,
      capacity: 0,
      light: 4,
      tasks: [
        { name: 'sow', remaining: 1 },
        { name: 'weed', remaining: 1 },
        { name: 'harvest', remaining: 1 },
        { name: 'thresh', remaining: 0.5 },
      ],
    });
    expect(r.tasks.sow).toBeCloseTo(1);
    expect(r.tasks.weed).toBeCloseTo(1);
    expect(r.tasks.harvest).toBeCloseTo(1);
    expect(r.tasks.thresh).toBeCloseTo(0.5);
    expect(r.common).toBe(0);
  });
  it('lehká úloha bere napřed z lehké práce, zbytek z obecné kapacity', () => {
    const r = allocateDay({
      ...base,
      capacity: 2,
      light: 0.5,
      tasks: [{ name: 'sow', remaining: 1 }],
    });
    expect(r.tasks.sow).toBeCloseTo(1);
    expect(r.common).toBeCloseTo(2 - DAILY_MIN - 0.5);
  });
});

describe('denní minimum a starší (population.md – Práce)', () => {
  it('starší kryje denní minimum své domácnosti – z práce vsi nic nebo méně', () => {
    // jeden starší (0,5) pokryje minimum bez hrnčíře (0,5) celé
    const one = allocateDay({ ...base, householdElders: [1] });
    expect(one.dailyMin).toBeCloseTo(0, 9);
    expect(one.eldersDailyMin).toBeCloseTo(DAILY_MIN, 9);
    expect(one.common).toBeCloseTo(2.6, 9);
    // se štěstím pod 1 starší minimum nepokryje celé – dospělí dají zbytek
    const tired = allocateDay({ ...base, householdElders: [1], productivity: 0.8 });
    expect(tired.dailyMin).toBeCloseTo(DAILY_MIN - LABOR_PER_DAY.elder * 0.8, 9);
    expect(tired.dailyMin).toBeLessThan(DAILY_MIN);
  });
  it('co starším nad minimum zbude, do práce vsi nejde', () => {
    const two = allocateDay({ ...base, householdElders: [2] });
    expect(two.dailyMin).toBe(0);
    expect(two.eldersDailyMin).toBeCloseTo(DAILY_MIN, 9);
    // dva starší dají práci vsi stejně jako jeden – přebytek propadne
    expect(two.common).toBeCloseTo(allocateDay({ ...base, householdElders: [1] }).common, 9);
    expect(adultDailyMin(DAILY_MIN, 3)).toBe(0);
  });
  it('domácnost bez staršího beze změny, po domácnostech zvlášť', () => {
    const r = allocateDay({ ...base, capacity: 5, householdElders: [0, 2, 0] });
    expect(r.dailyMin).toBeCloseTo(2 * DAILY_MIN, 9);
    expect(r.common).toBeCloseTo(5 - 2 * DAILY_MIN, 9);
    expect(adultDailyMin(DAILY_MIN, 0)).toBe(DAILY_MIN);
  });
  it('householdElders: starší po domácnostech, dílny vynechá', () => {
    const DAY = 365.25 * 100;
    const person = (id: number, dwellingId: number, age: number): Person =>
      ({ id, dwellingId, bornDay: DAY - age * 365.25 - 10 }) as Person;
    const people = [person(1, 7, 30), person(2, 7, 50), person(3, 8, 60), person(4, 8, 70)];
    people.push(person(5, 9, 10), person(6, 7, 46));
    expect(householdElders(people, DAY)).toEqual([2, 2, 0]);
    expect(householdElders(people, DAY, new Set([8]))).toEqual([2, 0]);
  });
});

// Martin, 19. 10. 2026: „Ale vesničané tam přece musí chodit nějak pro vodu a musí jim to zabírat
// čas.“ – chůze pro vodu nad 100 m je přirážka denního minima domácnosti (population.md – Práce)
describe('chůze pro vodu v denním minimu (population.md – Práce)', () => {
  it('do 100 m nulová, dál roste se vzdáleností i s lidmi domácnosti', () => {
    expect(waterFetchingLabor(6, 0)).toBe(0);
    expect(waterFetchingLabor(6, WATER_FETCHING.includedM)).toBe(0);
    const near = waterFetchingLabor(6, 300);
    const far = waterFetchingLabor(6, 600);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
    // cesty × 2 × (chůze − 100 m) ÷ rychlost ÷ délka dne: 6 lidí × 0,4 = 2,4 cesty, 500 m navíc
    const day = WATER_FETCHING.dayHours * 3600;
    expect(far).toBeCloseTo(
      (6 * WATER_FETCHING.tripsPerPerson * 2 * 500) / WATER_FETCHING.speedMps / day,
      12,
    );
    expect(waterFetchingLabor(3, 600)).toBeCloseTo(far / 2, 12);
  });
  it('bez změřené chůze (bez krajiny) nulová', () => {
    expect(waterFetchingLabor(6, undefined)).toBe(0);
    expect(waterFetchingLabor(0, 600)).toBe(0);
  });
  it('přirážka jde do denního minima před úlohami a kryjí ji napřed starší', () => {
    const water = waterFetchingLabor(6, 600);
    const r = allocateDay({
      ...base,
      householdWater: [water],
      tasks: [{ name: 'dig', remaining: 5 }],
    });
    expect(r.dailyMin).toBeCloseTo(DAILY_MIN + water, 12);
    expect(r.tasks.dig).toBeCloseTo(2.6 - DAILY_MIN - water, 12);
    // starší kryje 0,5 čd – na dospělé zbude jen přirážka nad jeho práci
    const elder = allocateDay({ ...base, householdElders: [1], householdWater: [water] });
    expect(elder.dailyMin).toBeCloseTo(Math.max(0, DAILY_MIN + water - LABOR_PER_DAY.elder), 12);
    expect(elder.eldersDailyMin).toBeCloseTo(DAILY_MIN + water - elder.dailyMin, 12);
    const two = allocateDay({ ...base, householdElders: [2], householdWater: [water] });
    expect(two.dailyMin).toBe(0);
    expect(two.eldersDailyMin).toBeCloseTo(DAILY_MIN + water, 12);
    // bez přirážky beze změny
    expect(allocateDay({ ...base, householdWater: [0] })).toEqual(allocateDay(base));
  });
  it('householdWaterLabor: po domácnostech ve stejném pořadí jako householdElders', () => {
    const DAY = 365.25 * 100;
    const person = (id: number, dwellingId: number, age: number): Person =>
      ({ id, dwellingId, bornDay: DAY - age * 365.25 - 10 }) as Person;
    const people = [person(1, 7, 30), person(2, 8, 50), person(3, 7, 6), person(4, 9, 40)];
    // obydlí 9 nemá chůzi změřenou, 10 (prázdné) se nepočítá
    const dwellings = [
      { id: 7, waterWalkM: 400 },
      { id: 8, waterWalkM: 80 },
      { id: 9 },
      { id: 10, waterWalkM: 900 },
    ];
    expect(householdWaterLabor(people, dwellings)).toEqual([waterFetchingLabor(2, 400), 0, 0]);
    expect(householdWaterLabor(people, dwellings, new Set([8]))).toEqual([
      waterFetchingLabor(2, 400),
      0,
    ]);
  });
});

describe('afterConstructions (population.md – Práce)', () => {
  it('opravy jen z práce, kterou stavby nespotřebovaly; zbytek vrátí', () => {
    expect(afterConstructions(2, 0.5)).toEqual({ repairs: 0.5, left: 1.5 });
    expect(afterConstructions(0.2, 0.5)).toEqual({ repairs: 0.2, left: 0 });
    expect(afterConstructions(0, 0.5)).toEqual({ repairs: 0, left: 0 });
    expect(afterConstructions(-1, 0.5)).toEqual({ repairs: 0, left: 0 });
  });
});

describe('pletí – děti, ženy, muži (fields.md – Pletí jednou a rychle)', () => {
  // po denním minimu zbude 6 člověkodní; ženy mají po svém dílu minima 3
  const WOMEN_MIN = WEEDING_WOMEN.dailyMinShare * DAILY_MIN;
  const day = { ...base, capacity: DAILY_MIN + 6, womenLabor: 3 + WOMEN_MIN };
  const { paceShare, spareDays } = WEEDING_WOMEN;

  it('pleje napřed dětmi, pak ženami vsi; muži až po ostatních úlohách dne (seč)', () => {
    const r = allocateDay({
      ...day,
      weedChildren: 1,
      tasks: [
        { name: 'weed', remaining: 5 },
        { name: 'mow', remaining: 4 },
      ],
    });
    expect(r.weedChildren).toBeCloseTo(1, 9);
    expect(r.weedWomen).toBeCloseTo(3, 9);
    expect(r.tasks.weed).toBeCloseTo(4, 9);
    expect(r.tasks.mow).toBeCloseTo(3, 9);
    expect(r.common).toBeCloseTo(0, 9);
  });

  it('co děti a ženy nestihnou, doplejí muži, když jim ostatní úlohy něco nechají', () => {
    const r = allocateDay({ ...day, weedChildren: 1, tasks: [{ name: 'weed', remaining: 5 }] });
    expect(r.tasks.weed).toBeCloseTo(5, 9);
    expect(r.weedWomen).toBeCloseTo(3, 9);
    expect(r.common).toBeCloseTo(2, 9);
  });

  it('ženy plejí napřed, i když je pletí v pořadí úloh až za kopáním', () => {
    const r = allocateDay({
      ...day,
      tasks: [
        { name: 'dig', remaining: 6 },
        { name: 'weed', remaining: 2 },
      ],
    });
    expect(r.tasks.weed).toBeCloseTo(2, 9);
    expect(r.weedWomen).toBeCloseTo(2, 9);
    expect(r.tasks.dig).toBeCloseTo(4, 9);
    expect(r.taskAmounts).toEqual([expect.closeTo(4, 9), expect.closeTo(2, 9)]);
  });

  it('muži plejí, co ženy a děti dnešním tempem s rezervou nestihnou před posledními dny okna', () => {
    const tasks = [{ name: 'weed' as const, remaining: 9 }];
    // ženy a děti dají 4 za den, s rezervou 4 × paceShare; zbytek 5 stihnou za 2 dny před
    // rezervními dny – muži neplejí
    const early = allocateDay({ ...day, weedChildren: 1, weedDaysLeft: spareDays + 3, tasks });
    expect(early.tasks.weed).toBeCloseTo(4, 9);
    expect(early.common).toBeCloseTo(3, 9);
    // před rezervními dny už jen zítřek: muži dnes plejí, co zítřek s rezervou nepokryje
    const late = allocateDay({ ...day, weedChildren: 1, weedDaysLeft: spareDays + 2, tasks });
    expect(late.tasks.weed).toBeCloseTo(4 + (5 - 4 * paceShare), 9);
    // v rezervních dnech doplejí muži, co mohou
    const last = allocateDay({ ...day, weedChildren: 1, weedDaysLeft: spareDays + 1, tasks });
    expect(last.tasks.weed).toBeCloseTo(7, 9);
    expect(last.common).toBeCloseTo(0, 9);
  });

  it('výprava a nutná seč – muži plejí s rezervou a pletí se do konce okna dodělá', () => {
    // 20 dní okna: ženy 3,5 čd/den, seč 3 čd/den před pletím mužů, výprava uprostřed (dny 6–8)
    // a na konci okna (posledních 5 dní) vezme všechnu práci po minimu
    const window = 20;
    let remaining = 60;
    for (let d = 0; d < window; d++) {
      const r = allocateDay({
        ...day,
        capacity: DAILY_MIN + 10,
        womenLabor: 3.5 + WOMEN_MIN,
        away: (d >= 5 && d < 8) || d >= window - 5 ? 10 : 0,
        weedDaysLeft: window - d,
        tasks: [
          { name: 'mow', remaining: 3 },
          { name: 'weed', remaining },
        ],
      });
      remaining -= r.tasks.weed;
    }
    expect(remaining).toBeCloseTo(0, 9);
  });

  it('ženy nesou většinu denního minima – plejí jen prací nad svůj díl minima', () => {
    // dvě domácnosti, ženy mají polovinu práce vsi: 6 po minimu, ženám ale po jejich dílu minima
    // (WEEDING_WOMEN.dailyMinShare) zbude méně než polovina z 6
    const capacity = 2 * DAILY_MIN + 6;
    const r = allocateDay({
      ...base,
      capacity,
      householdElders: [0, 0],
      womenLabor: capacity / 2,
      tasks: [{ name: 'weed', remaining: 10 }],
    });
    const womenFree = capacity / 2 - WEEDING_WOMEN.dailyMinShare * 2 * DAILY_MIN;
    expect(womenFree).toBeLessThan(3);
    expect(r.weedWomen).toBeCloseTo(womenFree, 9);
    // ženy, jejichž práce celá padne na minimum, neplejí
    const busy = allocateDay({
      ...base,
      capacity,
      householdElders: [0, 0],
      womenLabor: DAILY_MIN,
      tasks: [{ name: 'weed', remaining: 10 }],
    });
    expect(busy.weedWomen ?? 0).toBe(0);
  });

  it('bez podílu žen pleje jen to, co zbude po ostatních úlohách', () => {
    const r = allocateDay({
      ...day,
      womenLabor: undefined,
      tasks: [
        { name: 'weed', remaining: 2 },
        { name: 'mow', remaining: 5 },
      ],
    });
    expect(r.tasks.mow).toBeCloseTo(5, 9);
    expect(r.tasks.weed).toBeCloseTo(1, 9);
    expect(r.weedWomen ?? 0).toBe(0);
  });
});

describe('stavby staví muži (population.md – Práce, Stavby staví muži; „D24 ano“)', () => {
  // 10 dospělých – 4 muži a 6 žen; ženy nesou napřed denní minimum a úlohy dne
  const day = { ...base, capacity: 10, womenLabor: 6 };
  const womenFree = 6 - DAILY_MIN;

  it('úlohy dne, které ženy stihnou, mužům práci neberou – stavby dostanou celou práci mužů', () => {
    const r = allocateDay({ ...day, tasks: [{ name: 'mow', remaining: 2 }] });
    expect(r.common).toBeCloseTo(10 - DAILY_MIN - 2, 9);
    expect(r.build).toBeCloseTo(4, 9);
  });

  it('co ženy nestihnou, doplní muži – stavbám zbude jen zbytek mužů', () => {
    const r = allocateDay({ ...day, tasks: [{ name: 'mow', remaining: womenFree + 3 }] });
    expect(r.common).toBeCloseTo(1, 9);
    expect(r.build).toBeCloseTo(1, 9);
  });

  it('pletí jde napřed z práce žen a mužům práci nebere', () => {
    const r = allocateDay({ ...day, tasks: [{ name: 'weed', remaining: 3 }] });
    expect(r.weedWomen).toBeCloseTo(3, 9);
    expect(r.build).toBeCloseTo(4, 9);
  });

  it('práce „za den“ (péče o koně, výpravy) nesou muži', () => {
    const r = allocateDay({ ...day, horseCare: 0.5, away: 1 });
    expect(r.build).toBeCloseTo(2.5, 9);
  });

  it('ves jen se ženami nestaví – společná práce zůstane jiným pracím', () => {
    const r = allocateDay({ ...day, womenLabor: 10 });
    expect(r.common).toBeCloseTo(10 - DAILY_MIN, 9);
    expect(r.build).toBe(0);
  });

  it('bez údaje o ženách (pohlaví neznámé) staví všichni – celá společná práce', () => {
    const r = allocateDay(base);
    expect(r.build).toBeCloseTo(r.common, 9);
  });

  it('venku podle délky dne a štěstí – muži dají svou práci × světlo', () => {
    const r = allocateDay({ ...day, daylight: 0.7, productivity: 0.9 });
    expect(r.build).toBeCloseTo(4 * 0.9 * 0.7, 9);
  });

  it('menCommon: venkovní práce bez práce žen, nejvýš celá společná', () => {
    expect(menCommon(9.5, 5.5, 9.5)).toBeCloseTo(4, 9);
    expect(menCommon(9.5, 5.5, 1)).toBeCloseTo(1, 9);
    expect(menCommon(9.5, 12, 9.5)).toBe(0);
    expect(menCommon(9.5, 0, 0)).toBe(0);
  });
});
