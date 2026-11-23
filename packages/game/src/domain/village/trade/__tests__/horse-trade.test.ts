import { describe, expect, it } from 'vitest';
import { foundVillage } from '../../core/actions';
import { horseValueKg, horsesForSale, horsesOf, horsesToSell } from '../horse-trade';
import { horsesWanted } from '../../livestock/horse-breeding';
import { villageHorses } from '../../livestock/horses';
import { HORSES } from '../../rules';
import { addGood, finishExpeditions, villageGoodStock } from '../trade';
import type { Horse, TradedHorse, VillageState } from '../../types';
import { at, horse, horsePen } from '../../__tests__/horse-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Koně (horses.md – Nákup a prodej; ceny návrh Clauda): hříbě 800, klisna 1 600, jezdecký kůň
// 2 400–3 600 podle výcviku za kus; ves nikdy nedá koně s jezdcem; koně z výpravy na cestě
// (markets.md – Pravidla 10) přijdou do ohrady koní.

const DAY = at(601, 5, 1);

/** Ves s ohradou koní o `squares` čtvercích, nebo bez ohrady (`horses` null). */
function village(horses: Horse[] | null, squares = 2): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 46, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
  );
  s.lastDay = DAY;
  s.nextId = 1000;
  if (horses) s.pens = [{ ...horsePen(90, horses, squares), builtDay: DAY - 400 }];
  return s;
}

/** Výprava na cestě (markets.md – Pravidla 10) přivede koně `horses` – vrátí se v den `day`. */
function returnedWith(s: VillageState, horses: TradedHorse[], day: number): VillageState {
  const next = structuredClone(s);
  next.trade = {
    expeditions: [
      {
        id: 1,
        direction: 'S',
        trailId: 7,
        startedDay: day - 6,
        give: { grain: 900 },
        get: { ridingHorses: horses.length },
        porters: 1,
        days: 6,
        cost: 6,
        done: 6,
        horses,
      },
    ],
    nextId: 2,
  };
  next.chronicle.push(...finishExpeditions(next, day));
  return next;
}

describe('ceny (horses.md – Nákup a prodej)', () => {
  it('cena jezdeckého koně podle výcviku: 2 400 nevycvičený – 3 600 vycvičený', () => {
    expect(horseValueKg({ training: 0 })).toBe(2400);
    expect(horseValueKg({ training: HORSES.trainingFull / 2 })).toBe(3000);
    expect(horseValueKg({ training: HORSES.trainingFull })).toBe(3600);
  });
});

describe('koně, které ves dá', () => {
  const herd = (): Horse[] => [
    { ...horse(1, 8, 'male', 80, DAY), riderId: 7 },
    horse(2, 5, 'male', 20, DAY),
    horse(3, 6, 'male', 50, DAY),
    horse(4, 6, 'female', 0, DAY),
    horse(5, 9, 'female', 0, DAY),
    horse(6, 2, 'male', 0, DAY),
  ];

  it('nikdy koně s jezdcem; klisny nad chovné; hříbata', () => {
    const s = village(herd(), 3);
    expect(horsesForSale(s, 'ridingHorses', DAY)).toBe(2);
    expect(horsesForSale(s, 'mares', DAY)).toBe(2 - horsesWanted(s, DAY).mares);
    expect(horsesForSale(s, 'foals', DAY)).toBe(1);
    expect(villageGoodStock(s, 'ridingHorses', DAY)).toBe(2);
  });

  it('chovný hřebec zůstane – bez koně s jezdcem se poslední hřebec ke klisnám nedá', () => {
    const s = village([horse(2, 5, 'male', 20, DAY), horse(4, 6, 'female', 0, DAY)]);
    expect(horsesForSale(s, 'ridingHorses', DAY)).toBe(0);
  });

  it('napřed nejméně vycvičený; kůň s jezdcem nikdy – odejde jen dávaný kůň', () => {
    const s = village(herd(), 3);
    expect(horsesToSell(s, 'ridingHorses', 3, DAY).map((h) => h.training)).toEqual([20, 50]);
    addGood(s, 'ridingHorses', -1, DAY);
    const left = villageHorses(s);
    expect(left.map((h) => h.id)).toEqual([1, 3, 4, 5, 6]);
    expect(left[0]!.riderId).toBe(7);
  });
});

describe('koně z výpravy na cestě (markets.md – Pravidla 10)', () => {
  const bought: TradedHorse = { bornDay: DAY - Math.round(5 * 365.25), sex: 'male', training: 30 };

  it('přijdou do ohrady koní s věkem a výcvikem z výpravy', () => {
    const back = returnedWith(village([horse(1, 8, 'male', 80, DAY)]), [bought], DAY + 6);
    expect(villageHorses(back).find((h) => h.id !== 1)).toEqual({ id: 1000, ...bought });
    expect(back.chronicle.at(-1)).toMatchObject({
      kind: 'trade-returned',
      get: { ridingHorses: 1 },
    });
    expect(back.trade!.expeditions).toEqual([]);
  });

  it('kdo se do ohrady nevejde, jde do první ohrady koní navíc; bez ohrady se koně porazí', () => {
    const adults = [1, 2, 3, 4].map((id) => horse(id, 6, 'female', 0, DAY));
    const full = returnedWith(village(adults, 1), [bought], DAY + 6);
    expect(villageHorses(full)).toHaveLength(5);
    const noPen = returnedWith(village(null), [bought], DAY + 6);
    expect(villageHorses(noPen)).toHaveLength(0);
  });
});

describe('koně druhu ve vsi (horsesOf)', () => {
  it('kůň pod jezdcem se počítá, prodat ho nejde', () => {
    const ridden = village([
      { ...horse(1, 8, 'male', 80, DAY), riderId: 7 },
      horse(2, 5, 'male', 20, DAY),
    ]);
    expect(horsesOf(ridden, 'ridingHorses', DAY)).toBe(2);
    expect(horsesForSale(ridden, 'ridingHorses', DAY)).toBe(1);
  });

  it('druh podle věku a pohlaví', () => {
    const s = village([
      horse(1, 2, 'male', 0, DAY),
      horse(2, 9, 'female', 0, DAY),
      horse(3, 6, 'male', 0, DAY),
    ]);
    expect(horsesOf(s, 'foals', DAY)).toBe(1);
    expect(horsesOf(s, 'mares', DAY)).toBe(1);
    expect(horsesOf(s, 'ridingHorses', DAY)).toBe(1);
    expect(horsesOf(village(null), 'mares', DAY)).toBe(0);
  });
});
