import { horse, horseVillage, START } from '../../village/__tests__/horse-fixtures';
import { villageHorses } from '../../village/horses';
import { villageOxen } from '../../village/oxen';
import type { Person, VillageState } from '../../village/types';
import { woodLogs } from '../../village/wood';
import { noMacroGoods, type MacroBundle } from '../macro';

// Vsi pro testy zásilek (shipment.test.ts, application/__tests__/shipments.test.ts): odesílatel
// s koňmi, voly, kravami, senem, klády a rodinami; příjemce s prázdnými ohradami.

export const DAY = START;
const YEAR = 365.25;

function person(id: number, age: number, sex: Person['sex'], extra: Partial<Person> = {}): Person {
  return { id, bornDay: DAY - Math.ceil((age + 0.5) * YEAR), dwellingId: 500, sex, ...extra };
}

/** Odesílatel: kůň, voli, krávy, seno, klády a rodina se dvěma dětmi + dva svobodní mimo dvorec. */
export function sender(): VillageState {
  const s = horseVillage(
    [
      horse(70, 6, 'male', 800, DAY),
      horse(71, 7, 'female', 0, DAY),
      horse(72, 1, 'female', 0, DAY),
      horse(73, 1, 'male', 0, DAY),
      horse(74, 2, 'female', 0, DAY),
    ],
    2,
    0,
  );
  s.people.push(
    person(38, 40, 'male', { spouseId: 39, fatherId: 36, motherId: 37 }),
    person(39, 38, 'female', { spouseId: 38 }),
    person(36, 62, 'male', { spouseId: 37 }),
    person(37, 58, 'female', { spouseId: 36 }),
    person(30, 35, 'male', { spouseId: 31, fatherId: 36, motherId: 37 }),
    person(31, 32, 'female', { spouseId: 30 }),
    person(32, 8, 'male', { fatherId: 30, motherId: 31 }),
    person(33, 5, 'female', { fatherId: 30, motherId: 31 }),
    person(34, 28, 'male'),
    person(35, 27, 'female'),
  );
  s.pens = [
    ...(s.pens ?? []),
    {
      id: 91,
      species: 'team',
      cell: { x: 6, y: 4 },
      x: 0,
      z: 0,
      builtDay: DAY - 900,
      oxen: [{ trainedDay: DAY - 900 }, { trainedDay: DAY - 900 }, { trainedDay: DAY + 200 }],
    },
  ];
  s.livestock = {
    herds: { cow: 8, sheep: 0, goat: 0, pig: 0, hen: 0 },
    young: { cow: 0, sheep: 0, goat: 0, pig: 0, hen: 0 },
  } as VillageState['livestock'];
  s.hay = { kg: 3_000, mowing: null };
  s.woodLogs = 40;
  s.storesKg = 5_000;
  // společná práce vsi nese dopravu (`transportLimit`): 40 člověkodní denně
  s.commonLaborYearly = 40;
  return s;
}

/** Příjemce: prázdná ohrada koní a volů, domy, sklad. */
export function receiver(): VillageState {
  const s = horseVillage([horse(80, 5, 'male', 0, DAY)], 3, 2);
  s.pens = [
    ...(s.pens ?? []),
    { id: 92, species: 'team', cell: { x: 6, y: 4 }, x: 0, z: 0, builtDay: DAY - 900, oxen: [] },
  ];
  s.storesKg = 1_000;
  s.hay = { kg: 100, mowing: null };
  s.woodLogs = 5;
  s.nextId = 2_000;
  return s;
}

export const bundle = (b: Partial<MacroBundle>): MacroBundle => ({
  ...noMacroGoods(),
  people: { families: 0, men: 0, women: 0 },
  laborDays: 0,
  ...b,
});

export const stock = (s: VillageState): Record<string, number> => ({
  grain: s.storesKg,
  hay: s.hay?.kg ?? 0,
  logs: woodLogs(s),
  cows: s.livestock?.herds.cow ?? 0,
  oxen: villageOxen(s) + (s.looseOxen?.length ?? 0),
  horses: villageHorses(s).length,
  people: s.people.length,
});
