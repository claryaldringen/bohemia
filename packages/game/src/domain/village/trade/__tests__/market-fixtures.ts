import type { VillageEvent } from '../../core/inbox';
import type { MarketTarget, VillageMail, VillageReport, VillageState } from '../../types';
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
