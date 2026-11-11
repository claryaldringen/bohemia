// Svatby pro scénu (docs/design/kinship.md – Svatba ve scéně; Martin – GitHub issue #2: „Jako máme
// pohřeb, udělej i svatbu. Svatebčané půjdou na některé z posvátných míst v okolí, kde budou
// oddáni.“). Jen zobrazení – pravidla sňatků se nemění: ze svateb posledních dnů v kronice kdo se
// bral (věk, z kterého domu – nebo z okolí, odkud), kam se stěhují (`weddingHome` – nový domov),
// kdo jde v průvodu (domácnosti obou a z dalších domácností 1–2 lidé, ve vojvodově rodině celá
// ves) a kdo přišel s nevěstou nebo ženichem z okolí. Kam se jde a kdy co ve scéně je, počítá
// scéna (scene/wedding-plan.ts) – čistá funkce času z okna herního dne. Čistý modul na serveru.
import {
  DIRECTION_VECTORS,
  NEIGHBOR_DIRECTIONS,
  ageYears,
  villageManorId,
  type ChronicleEvent,
  type Landscape,
  type NeighborDirection,
  type Person,
  type Sex,
  type VillageState,
} from '@bohemia/game';
import {
  byPriority,
  fillFromOtherHomes,
  mix01,
  peopleByHome,
  processionPersonOf,
  type ProcessionPerson,
} from './procession';

/**
 * Svatby kolika posledních herních dnů jdou do scény. Průvod jde skutečnou chůzí (jako pohřeb) –
 * k posvátnému místu 600 m daleko ≈ 9 minut, lidé z okolí jdou od kraje mapy (≈ 1 km) a zase
 * zpátky; celé to trvá i třicet herních dnů (≈ 86 s). Scéna sama pozná, které svatby už skončily
 * (`WeddingPlan.figuresUntilMs`).
 */
export const WEDDING_VIEW_DAYS = 40;
/** Nejvýš tolik postav svatby (i s párem a lidmi z okolí); ve vojvodově rodině jde celá ves. */
export const MAX_WEDDING_FIGURES = 30;
export const MAX_MANOR_WEDDING_FIGURES = 40;
/** Kolik lidí přijde s nevěstou nebo ženichem z okolí (rodiče, sourozenci – návrh Clauda). */
export const OUTSIDE_PARTY = { min: 2, max: 5 } as const;
/** Věk nevěsty a ženicha, když ho kronika nezná (události zapsané dřív). */
const DEFAULT_AGE = { bride: 19, groom: 23 } as const;
/** Lidé z okolí se objeví kus uvnitř kraje mapy (m – u kraje se nechodí, EDGE_MARGIN_M pěšin). */
const EDGE_INSET_M = 12;

/** Člověk vsi ve svatebním průvodu (viz `ProcessionPerson`). */
export type SceneWeddingGuest = ProcessionPerson;

/** Nevěsta nebo ženich: věk, dům před svatbou (z okolí null) a u člověka z okolí odkud přišel. */
export interface SceneWeddingSpouse {
  id?: number;
  age: number;
  /** Obydlí před svatbou (odtud vyjde průvod); z okolí null. */
  from: number | null;
  /** Z okolí: směr sousední vsi a bod na kraji mapy, odkud přichází se svými lidmi. */
  outside?: { direction: NeighborDirection; edge: { x: number; z: number } };
}

/**
 * Svatba ve scéně (kinship.md – Svatba ve scéně): den svatby, nevěsta a ženich, nový domov páru
 * (`home` – obydlí, kam se po svatbě stěhují), svatba ve vojvodově rodině (`manor` – jde celá ves),
 * svatebčané ze vsi (`guests` – bez páru) a lidé z okolí, kteří přišli s nevěstou nebo ženichem
 * (`companions` – po obřadu se vrátí ke kraji mapy).
 */
export interface SceneWedding {
  /** Stálý klíč – den a pořadí svatby toho dne. */
  key: string;
  day: number;
  bride: SceneWeddingSpouse;
  groom: SceneWeddingSpouse;
  home: number;
  manor?: true;
  guests: SceneWeddingGuest[];
  companions?: { sex: Sex; age: number }[];
}

type WeddingEvent = Extract<
  ChronicleEvent,
  { kind: 'marriage' | 'bride-from-outside' | 'groom-from-outside' }
>;

function isWedding(e: ChronicleEvent): e is WeddingEvent {
  return (
    e.kind === 'marriage' || e.kind === 'bride-from-outside' || e.kind === 'groom-from-outside'
  );
}

/**
 * Svatebčané ze vsi (kinship.md – Svatba ve scéně): celé domácnosti obou (`own` – domy před svatbou
 * a nový domov) a z každé další domácnosti jeden až dva lidé (los podle svatby – napřed dospělí),
 * ve vojvodově rodině (`all`) celá ves. Nevěsta a ženich mezi nimi nejsou (`couple`). Nejvýš `max`;
 * když je lidí víc, jdou domácnosti páru a z ostatních domácností po jednom, pak po druhém…
 */
export function weddingGuests(
  people: readonly Person[],
  own: readonly number[],
  couple: ReadonlySet<number>,
  all: boolean,
  max: number,
  day: number,
  seed: number,
): SceneWeddingGuest[] {
  const homes = peopleByHome(people.filter((p) => !couple.has(p.id)));
  const out: Person[] = [];
  for (const id of own) {
    for (const p of byPriority(homes.get(id) ?? [], day, seed + id)) {
      if (out.length < max && !out.includes(p)) out.push(p);
    }
  }
  fillFromOtherHomes(out, homes, new Set(own), all, max, day, seed);
  return out.map((p) => processionPersonOf(p, day));
}

/**
 * Lidé z okolí, kteří přijdou s nevěstou nebo ženichem (návrh Clauda): otec a matka, pak
 * sourozenci a příbuzní – OUTSIDE_PARTY lidí podle losu svatby (jádro je nezná – jen vzhled).
 */
export function weddingCompanions(seed: number): { sex: Sex; age: number }[] {
  const { min, max } = OUTSIDE_PARTY;
  const count = min + Math.floor(mix01(seed, 11, 7) * (max - min + 1));
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) return { sex: 'male' as const, age: 44 + Math.floor(mix01(seed, i, 13) * 12) };
    if (i === 1) return { sex: 'female' as const, age: 40 + Math.floor(mix01(seed, i, 13) * 10) };
    return {
      sex: mix01(seed, i, 17) < 0.5 ? ('female' as const) : ('male' as const),
      age: 9 + Math.floor(mix01(seed, i, 13) * 20),
    };
  });
}

/** Kde je obydlí (bez obydlí střed vsi – dvorec, první obydlí). */
function dwellingPoint(
  state: Pick<VillageState, 'dwellings' | 'manorId' | 'constructions'>,
  id: number,
): { x: number; z: number } {
  const own = state.dwellings.find((d) => d.id === id);
  if (own) return own.position;
  const manor = villageManorId(state);
  const fallback = state.dwellings.find((d) => d.id === manor) ?? state.dwellings[0];
  return fallback?.position ?? { x: 0, z: 0 };
}

/** Bod na kraji mapy ve směru `direction` od bodu `from` (kus uvnitř). */
function edgePoint(
  landscape: Pick<Landscape, 'size' | 'cellSizeM'>,
  from: { x: number; z: number },
  direction: NeighborDirection,
): { x: number; z: number } {
  const v = DIRECTION_VECTORS[direction];
  // jako edgeDistanceM jádra – vzdálenost ke kraji krajiny ve směru
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const along = (p: number, d: number): number =>
    d > 0 ? (half - p) / d : d < 0 ? (-half - p) / d : Number.POSITIVE_INFINITY;
  const reach = Math.max(0, Math.min(along(from.x, v.x), along(from.z, v.z)) - EDGE_INSET_M);
  return {
    x: Math.round((from.x + v.x * reach) * 100) / 100,
    z: Math.round((from.z + v.z * reach) * 100) / 100,
  };
}

/** Odkud přišel člověk z okolí: `origin` z jádra, jinak (starší vsi) podle losu svatby. */
function originOf(person: Person | undefined, seed: number): NeighborDirection {
  if (person?.origin) return person.origin;
  const i = Math.floor(mix01(seed, 3, 29) * NEIGHBOR_DIRECTIONS.length);
  return NEIGHBOR_DIRECTIONS[Math.min(NEIGHBOR_DIRECTIONS.length - 1, i)] ?? 'N';
}

/** Domy ženicha a nevěsty před svatbou a nový domov (starší události – z `from` / `to`). */
function housesOf(e: WeddingEvent): {
  groomFrom: number | null;
  brideFrom: number | null;
  home: number;
} {
  if (e.kind === 'bride-from-outside') {
    return { groomFrom: e.dwellingId, brideFrom: null, home: e.dwellingId };
  }
  if (e.kind === 'groom-from-outside') {
    return { groomFrom: null, brideFrom: e.dwellingId, home: e.dwellingId };
  }
  // kdo se stěhoval, šel z `from` do `to`; druhý bydlel v `to` (weddingHome)
  return {
    groomFrom: e.groomFromDwellingId ?? (e.groomMoved ? e.fromDwellingId : e.toDwellingId),
    brideFrom: e.brideFromDwellingId ?? (e.groomMoved ? e.toDwellingId : e.fromDwellingId),
    home: e.toDwellingId,
  };
}

/**
 * Svatby posledních WEDDING_VIEW_DAYS herních dnů (včetně dneška `day`) pro scénu – z kroniky
 * (`marriage`, `bride-from-outside`, `groom-from-outside`); dcera vdaná pryč ve scéně svatbu nemá
 * (odchází ze vsi – návrh Clauda). Bez kraje mapy (`landscape`) lidé z okolí přicházejí od středu
 * mapy obvyklé velikosti.
 */
export function sceneWeddings(
  state: Pick<
    VillageState,
    'chronicle' | 'people' | 'seed' | 'dwellings' | 'manorId' | 'constructions'
  >,
  day: number,
  landscape: Pick<Landscape, 'size' | 'cellSizeM'>,
): SceneWedding[] {
  const recent = state.chronicle.filter(
    (e): e is WeddingEvent & { day: number } =>
      isWedding(e) && e.day <= day && day - e.day < WEDDING_VIEW_DAYS,
  );
  if (recent.length === 0) return [];
  const people = new Map(state.people.map((p) => [p.id, p]));
  const manor = villageManorId(state);
  const perDay = new Map<number, number>();
  return recent.map((e) => {
    const n = perDay.get(e.day) ?? 0;
    perDay.set(e.day, n + 1);
    const seed = (state.seed * 31 + e.day * 7919 + n * 104_729) | 0;
    const { groomFrom, brideFrom, home } = housesOf(e);
    const groom = e.groomId === undefined ? undefined : people.get(e.groomId);
    const bride = e.brideId === undefined ? undefined : people.get(e.brideId);
    const spouse = (
      p: Person | undefined,
      id: number | undefined,
      from: number | null,
      fallbackAge: number,
    ): SceneWeddingSpouse => {
      const outside =
        from === null
          ? (() => {
              const direction = originOf(p, seed);
              return {
                direction,
                edge: edgePoint(landscape, dwellingPoint(state, home), direction),
              };
            })()
          : undefined;
      return {
        ...(id !== undefined ? { id } : {}),
        age: p ? ageYears(p.bornDay, e.day) : fallbackAge,
        from,
        ...(outside ? { outside } : {}),
      };
    };
    const own = [...new Set([brideFrom, groomFrom, home].filter((d): d is number => d !== null))];
    const isManor = manor !== null && own.includes(manor);
    const companions = groomFrom === null || brideFrom === null ? weddingCompanions(seed) : [];
    const max = (isManor ? MAX_MANOR_WEDDING_FIGURES : MAX_WEDDING_FIGURES) - 2 - companions.length;
    const couple = new Set([e.groomId, e.brideId].filter((id): id is number => id !== undefined));
    return {
      key: `${e.day}:${n}`,
      day: e.day,
      bride: spouse(bride, e.brideId, brideFrom, DEFAULT_AGE.bride),
      groom: spouse(groom, e.groomId, groomFrom, DEFAULT_AGE.groom),
      home,
      ...(isManor ? { manor: true as const } : {}),
      guests: weddingGuests(state.people, own, couple, isManor, max, day, seed),
      ...(companions.length > 0 ? { companions } : {}),
    };
  });
}
