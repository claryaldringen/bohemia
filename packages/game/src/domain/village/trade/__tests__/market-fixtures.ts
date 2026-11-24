import type { VillageEvent } from '../../core/inbox';
import { newWorkshop } from '../../crafts/crafts';
import { toolNeedKg } from '../../crafts/iron';
import { CRAFT_BASE } from '../../rules';
import type {
  Craft,
  Dwelling,
  FieldPart,
  MarketTarget,
  VillageMail,
  VillageReport,
  VillageState,
  Workshop,
} from '../../types';
import { at, horseVillage } from '../../__tests__/horse-fixtures';
import { dwelling } from '../../__tests__/kin-fixtures';
import { marketStance } from '../market-stance';

// Vsi pro testy trhu (markets.md – Rozhodnutí plánu 2): hostitel M a domovská ves výpravy H,
// zpráva na pivo a pošta mezi vsemi jako události schránky.

/** Den trhu v červnu. */
export const D = at(601, 6, 15);

/**
 * Ves M: dvorec a 5 dospělých, každý ve svém domě (6 domácností – chovné jádro 3 krávy), 8 krav
 * a obilí `shortKg` pod pojistkou (ne v hladu); dopočítaná do dne před D.
 */
export function marketVillage(shortKg = 3_000): VillageState {
  const s = horseVillage(null, 2, 5);
  s.people
    .filter((p) => p.dwellingId !== s.manorId)
    .forEach((p, i) => {
      const id = 500 + i;
      if (!s.dwellings.some((d) => d.id === id)) {
        s.dwellings.push({ ...dwelling(id), position: { x: 30 + 12 * i, z: 0, rotation: 0 } });
      }
      p.dwellingId = id;
    });
  s.livestock!.herds.cow = 8;
  s.lastDay = D - 1;
  s.storesKg = 0;
  // bez zásob shání ves celou pojistku
  s.storesKg = marketStance(s, D).wants.grain! - shortKg;
  return s;
}

/**
 * Ves H (Vlkov): dvorec, 4 dospělí jinde, 3 000 kg obilí, čtyřkolák a dva vycvičení voli doma;
 * dopočítaná do D (dnešek hráčovy vsi je spočtený).
 */
export function homeVillage(): VillageState {
  const s = horseVillage(null, 2, 4);
  s.lastDay = D;
  s.storesKg = 3_000;
  s.carts = [{ id: 1, kind: 'four-wheel', builtDay: D - 10 }];
  s.pens = [
    ...(s.pens ?? []),
    {
      id: 900,
      cell: { x: 3, y: 4 },
      x: 50,
      z: 60,
      builtDay: D - 800,
      team: { readyDay: D - 10 },
      training: null,
    },
  ];
  return s;
}

/**
 * Pracující dílna řemesla `craft` (`ownCraftsmanWorks`) v novém obydlí `id`: přestěhuje se do ní
 * první člověk mimo dvorec a mimo dílny – lidí ve vsi nepřibude ani neubude. `workshop` doplní
 * stav dílny (ruda, rozdělaný vůz…).
 */
export function withWorkshop(
  s: VillageState,
  craft: Craft,
  id: number,
  workshop: Partial<Workshop> = {},
): Dwelling {
  const inWorkshop = new Set(s.dwellings.filter((d) => d.workshop).map((d) => d.id));
  const worker = s.people.find((p) => p.dwellingId !== s.manorId && !inWorkshop.has(p.dwellingId))!;
  const d: Dwelling = {
    ...dwelling(id, CRAFT_BASE[craft]),
    position: { x: 30 + 12 * inWorkshop.size, z: 40, rotation: 0 },
    workshop: { ...newWorkshop(craft), activity: 'producing', ...workshop },
  };
  s.dwellings.push(d);
  worker.dwellingId = id;
  return d;
}

/** Cíl výpravy z H: Lhota (M) na sousední mapě na východě. */
export const target: MarketTarget = {
  villageId: 'm',
  name: 'Lhota',
  cells: 1,
  firstStep: 'E',
  homeVillageId: 'h',
  homeName: 'Vlkov',
};

/** Zpráva na pivo o domovské vsi výpravy. */
export const report: VillageReport = {
  day: D - 2,
  people: 25,
  houses: 5,
  crafts: ['potter'],
  traders: [],
};

/** Den před rozhodnutím vesničanů o výrobcích (CRAFT_BUYING.day) a ten den. */
export const NOV14 = at(601, 11, 14);
export const NOV15 = at(601, 11, 15);

/** Osetý díl ozimu (0,25 ha) – úroda za rok, kterou nástroje zlevní. */
export function sownPart(id: number): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 2_500,
    distanceM: 80,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    crop: 'winter',
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    cell: { x: id % 20, y: Math.floor(id / 20) },
  };
}

/** Okolí H (Vlkov) s Lhotou (M) na sousední mapě na východě (markets.md – Rozhodnutí plánu 3, bod 1). */
export function withNearby(s: VillageState, day: number): VillageState {
  s.nearby = {
    day: day - 5,
    self: { villageId: 'h', name: 'Vlkov' },
    villages: [{ villageId: 'm', name: 'Lhota', cells: 1, firstStep: 'E' }],
  };
  return s;
}

/** Zpráva na pivo o Lhotě s řemesly `crafts` (bez cen trhu). */
export function withNews(s: VillageState, crafts: Craft[]): VillageState {
  s.news = [{ villageId: 'm', name: 'Lhota', report: { ...report, crafts } }];
  return s;
}

/**
 * Vlkov (H) bez kováře dopočítaný do 14. 11. – 40 osetých dílů ozimu (10 ha), nástrojů o 10 kg míň,
 * než potřebuje; s okolím a zprávou o řemeslech Lhoty (`crafts`, výchozí kovář).
 */
export function villagersHome(crafts: Craft[] = ['smith']): VillageState {
  const s = homeVillage();
  s.lastDay = NOV14;
  s.fields = [{ id: 1 }];
  s.parts = Array.from({ length: 40 }, (_, i) => sownPart(100 + i));
  s.toolEquipmentKg = toolNeedKg(s, NOV15) - 10;
  return withNews(withNearby(s, NOV15), crafts);
}

/** Zprávy odchozí schránky jako události schránky cílové vsi (doručení – village-core.md). */
export function asEvents(mails: readonly VillageMail[]): VillageEvent[] {
  return mails.map((mail, i) => ({
    id: mail.ref,
    seq: i + 1,
    villageId: mail.villageId,
    day: mail.day,
    body: mail.body,
  }));
}

/** Ves po doručení odchozí schránky – zprávy jsou pryč. */
export function withoutOutbox(s: VillageState): VillageState {
  const copy = structuredClone(s);
  delete copy.outbox;
  return copy;
}
