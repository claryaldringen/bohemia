import type { VillageEvent } from '../../core/inbox';
import { newWorkshop } from '../../crafts/crafts';
import { toolNeedKg } from '../../crafts/iron';
import { windowSeedNeedKg } from '../../fields/seed';
import { breedingCows, oxenCalvesWanted } from '../../livestock/husbandry';
import { CRAFT_BASE } from '../../rules';
import type {
  Craft,
  Dwelling,
  FieldPart,
  MarketTarget,
  Person,
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

/** Dům rodiny na prodej a dům jejího ženatého syna (`familyHome`). */
export const FAMILY_HOUSE = 500;
export const SON_HOUSE = 501;
/** Rodina na prodej (`familyHome`): otec, matka, syn 10 a dcera 8 let. */
export const FAMILY_IDS = [62, 63, 64, 65];

/**
 * Vlkov (H) s rodinou na prodej (markets.md – Rozhodnutí plánu 3, bod 10): v domě 500 drží dům
 * starší pár (60 a 61, 42 a 40 let), rodina 62 ∞ 63 (36 a 34) s dětmi 64 a 65 z něj smí odejít
 * (`familiesOf`). Jejich ženatý syn 66 (18) se ženou 67 bydlí v domě 501 – příbuzný, se kterým
 * rodina zůstane v `emigrants`. Matka otce (id 7) ve vsi není – vazba ven. Dospělých je 10.
 */
export function familyHome(): VillageState {
  const s = homeVillage();
  s.dwellings.push({ ...dwelling(SON_HOUSE), position: { x: 60, z: 0, rotation: 0 } });
  const person = (
    id: number,
    age: number,
    dwellingId: number,
    sex: Person['sex'],
    extra: Partial<Person> = {},
  ): Person => ({ id, bornDay: D - Math.ceil((age + 0.5) * 365.25), dwellingId, sex, ...extra });
  s.people = [
    ...s.people.filter((p) => p.dwellingId !== FAMILY_HOUSE),
    person(60, 42, FAMILY_HOUSE, 'male', { spouseId: 61 }),
    person(61, 40, FAMILY_HOUSE, 'female', { spouseId: 60 }),
    person(62, 36, FAMILY_HOUSE, 'male', { spouseId: 63, motherId: 7 }),
    person(63, 34, FAMILY_HOUSE, 'female', { spouseId: 62 }),
    person(64, 10, FAMILY_HOUSE, 'male', { motherId: 63, fatherId: 62 }),
    person(65, 8, FAMILY_HOUSE, 'female', { motherId: 63, fatherId: 62 }),
    person(66, 18, SON_HOUSE, 'male', { spouseId: 67, motherId: 63, fatherId: 62 }),
    person(67, 17, SON_HOUSE, 'female', { spouseId: 66 }),
  ];
  return s;
}

/** Domy otroků (`slaveHome`). */
export const SLAVE_HOUSE = 500;
export const SLAVE_HOUSE_2 = 501;

/**
 * Vlkov (H) s otroky (markets.md – Rozhodnutí plánu 5, bod 6): ve dvorci vojvoda 1 (muž rodu, 45)
 * se ženou 13 – otrokyní-pohankou (22) – a povýšený otrok-pohan 17 (19, muž rodu a šlechtic –
 * `settleNoble`). V domě 500 manželé 2 a 3 (35 a 33), otrokyně-pohanka 10
 * (25, neprovdaná) a její dítě 16 (2 roky, narozené ve vsi – svobodné). V domě 501 pokřtěný otrok
 * 11 (30), otrok-pohan 12 (28) na práci mimo ves do D + 5, otrok-pohan 14 (3 roky) a svobodný pohan
 * 15 (20). Prodat jde 10 a 14; otroci jsou neženatí (manželství – Úloha 4).
 */
export function slaveHome(): VillageState {
  const s = homeVillage();
  s.dwellings.push({ ...dwelling(SLAVE_HOUSE_2), position: { x: 60, z: 0, rotation: 0 } });
  const manor = s.manorId!;
  const person = (
    id: number,
    age: number,
    dwellingId: number,
    sex: Person['sex'],
    extra: Partial<Person> = {},
  ): Person => ({ id, bornDay: D - Math.ceil((age + 0.5) * 365.25), dwellingId, sex, ...extra });
  s.people = [
    person(1, 45, manor, 'male', { line: true, spouseId: 13 }),
    person(2, 35, SLAVE_HOUSE, 'male', { spouseId: 3 }),
    person(3, 33, SLAVE_HOUSE, 'female', { spouseId: 2 }),
    person(10, 25, SLAVE_HOUSE, 'female', { slave: true }),
    person(11, 30, SLAVE_HOUSE_2, 'male', { slave: true, faith: 'christian' }),
    person(12, 28, SLAVE_HOUSE_2, 'male', {
      slave: true,
      away: { kind: 'labor', untilDay: D + 5 },
    }),
    person(13, 22, manor, 'female', { slave: true, spouseId: 1 }),
    person(14, 3, SLAVE_HOUSE_2, 'male', { slave: true }),
    person(15, 20, SLAVE_HOUSE_2, 'male'),
    person(16, 2, SLAVE_HOUSE, 'female', { motherId: 10 }),
    person(17, 19, manor, 'male', { slave: true, line: true, noble: { houseId: 'h' } }),
  ];
  s.dynasty = { lordId: 1, lords: [{ id: 1, fromDay: D - 3_000 }] };
  return s;
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

/** Den nákupu osiva ozimu (`SEED_RESERVE.days`). */
export const SEP1 = at(601, 9, 1);

/**
 * Vlkov (H) dopočítaný do 31. 8. s 12 díly na řadě a osivem kratším o `shortKg` (celé zásoby jsou
 * rezerva osiva), 2 kg hřiven a 3 krávami nad chovné jádro a voly; s okolím (Lhota).
 */
export function seedHome(shortKg: number): VillageState {
  const s = homeVillage();
  s.lastDay = SEP1 - 1;
  s.fields = [{ id: 1 }];
  s.parts = Array.from({ length: 12 }, (_, i) => ({
    ...sownPart(100 + i),
    state: 'ready' as const,
    sownYears: 0,
    crop: undefined,
  }));
  s.season = null;
  const need = windowSeedNeedKg(s, 'winter');
  if (need <= shortKg)
    throw new Error(`osivo na díly ${need} kg nestačí na chybějících ${shortKg}`);
  s.storesKg = need - shortKg;
  s.reservedSeedKg = need - shortKg;
  s.crafts = { charcoalKg: 0, potteryKg: 0, ironBarsKg: 2 };
  s.livestock!.herds.cow = Math.ceil(breedingCows(s) + oxenCalvesWanted(s, SEP1)) + 3;
  return withNearby(s, SEP1);
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
