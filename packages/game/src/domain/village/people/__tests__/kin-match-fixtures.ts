import type {
  Direction8,
  KinAsk,
  KinSeeker,
  MarketArrival,
  NearbySingle,
  NearbyVillage,
  VillageState,
} from '../../types';
import { DAY, couple, dwelling, kin, village, type KinSpec } from '../../__tests__/kin-fixtures';

// Vsi pro sňatky se skutečnými sousedy (markets.md – Rozhodnutí plánu 3, body 11 a 12): Lhota (A),
// kde se někdo ptá, a Bukovec (B) na sousední mapě na východě, odkud partner přijde.

export const LHOTA = { villageId: 'a', name: 'Lhota' };
export const BUKOVEC = { villageId: 'b', name: 'Bukovec' };
const NAMES: Readonly<Record<string, string>> = { a: 'Lhota', b: 'Bukovec', c: 'Chlum', d: 'Dub' };

export const WOMAN_20: NearbySingle = { sex: 'female', ageFrom: 20 };
export const MAN_25: NearbySingle = { sex: 'male', ageFrom: 25 };

/** Ves okolí na sousední mapě (první krok `firstStep`) se svobodnými `singles`; bez nich nikdo. */
export function near(
  villageId: string,
  singles?: NearbySingle[],
  firstStep: Direction8 = 'E',
): NearbyVillage {
  return {
    villageId,
    name: NAMES[villageId] ?? villageId,
    cells: 1,
    firstStep,
    ...(singles ? { singles } : {}),
  };
}

/** Ves `self` s okolím `villages` (snímek z doby před dnem DAY). */
export function withNearby(
  s: VillageState,
  self: { villageId: string; name: string },
  villages: NearbyVillage[],
): VillageState {
  s.nearby = { day: DAY - 5, self, villages };
  return s;
}

/** Ves z lidí `specs` v obydlích 1–3 se zásobami, dopočtená do DAY. */
export function folk(specs: KinSpec[], extra: Partial<VillageState> = {}): VillageState {
  return village(
    specs.map((k) => kin(k)),
    [dwelling(1), dwelling(2), dwelling(3)],
    { storesKg: 3_000, ...extra },
  );
}

/** Syn, který ve Lhotě nemá nevěstu. */
export const SON = 3;

/**
 * Lhota: syn 25 let v domě rodičů (50 a 47 – matka už není svobodná ani jako vdova, sňatky
 * příbuzenství nehlídají); okolí – Bukovec se svobodnými `singles`.
 */
export function seekerVillage(villages: NearbyVillage[] = [near('b', [WOMAN_20])]): VillageState {
  return withNearby(
    folk([
      ...couple({ id: 1, age: 50 }, { id: 2, age: 47 }),
      { id: SON, age: 25, sex: 'male', mother: 2, father: 1 },
    ]),
    LHOTA,
    villages,
  );
}

/** Dcera, která se z Bukovce vdá pryč. */
export const DAUGHTER = 3;

/**
 * Bukovec: dcera 20 let v domě rodičů (45 a 42) se ženatým bratrem (24 a 22 – dům drží on, i když
 * matka zestárne); okolí – Lhota na západě se svobodným mužem.
 */
export function brideVillage(extra: KinSpec[] = []): VillageState {
  return withNearby(
    folk([
      ...couple({ id: 1, age: 45 }, { id: 2, age: 42 }),
      { id: DAUGHTER, age: 20, sex: 'female', mother: 2, father: 1 },
      ...couple({ id: 4, age: 24, mother: 2, father: 1 }, { id: 5, age: 22 }),
      ...extra,
    ]),
    BUKOVEC,
    [near('a', [MAN_25], 'W')],
  );
}

/** Dotaz Lhoty (`kin-ask`) poslaný den před `day` – hledající `seeker`. */
export function askOf(
  seeker: Pick<KinSeeker, 'sex' | 'bornDay'> & Partial<KinSeeker>,
  day = DAY + 1,
): KinAsk {
  const personId = seeker.personId ?? SON;
  return {
    key: `kin:a:${day - 1}:${personId}`,
    fromVillageId: 'a',
    fromName: 'Lhota',
    cells: 1,
    firstStep: 'E',
    seeker: { personId, widowed: false, ...seeker },
    report: { day: day - 1, people: 3, houses: 1, crafts: [], traders: [] },
  };
}

/** Příjezd výpravy z odchozí schránky vsi (jediný). */
export function arrivalOf(s: VillageState): MarketArrival {
  const mails = (s.outbox ?? []).filter((m) => m.body.kind === 'market-arrive');
  const mail = mails[0];
  if (mails.length !== 1 || mail?.body.kind !== 'market-arrive') {
    throw new Error(`čekal jsem jeden příjezd, je jich ${mails.length}`);
  }
  return mail.body.arrival;
}
