// Koně pro panel ohrady koní (docs/design/horses.md – Co hráč vidí): koně po kusech, kolik jich
// ves chce a mají-li obilí. Čistý modul, smí i do prohlížeče.
import {
  HAY_WINTER_DAYS,
  HORSES,
  horseAgeYears,
  horseGrainToday,
  horseHayDailyKg,
  horseKind,
  horsePlaces,
  horsesOverRoom,
  horsesUngrained,
  horsesWanted,
  penHorses,
  shoeingView,
  stallionId,
  villageHorses,
  type HorseKind,
  type ShoeingView,
  type VillageState,
} from '@bohemia/game';
import { fromVillage } from './village-name-cases';

/** Kůň v seznamu panelu ohrady. */
export interface VillageHorse {
  id: number;
  /** Hříbě do roku, klisna, nebo jezdecký kůň (samec). */
  kind: HorseKind;
  /** Stáří v celých letech. */
  ageYears: number;
  /** Výcvik pod sedlem 0–1 (hotový ve 12 letech). */
  training: number;
  /** Hřebec – nejstarší samec od 3 let ve vsi (ostatní jsou valaši). */
  stallion: boolean;
  /** Ohrada, ve které kůň stojí. */
  penId: number;
  /** Jezdec, který na koni jezdí (horses.md – Výcvik koně a jezdec); bez jezdce chybí. */
  riderId?: number;
}

/** Koně vsi pro panel ohrady a upozornění. */
export interface VillageHorses {
  count: number;
  kinds: { riding: number; mares: number; foals: number };
  /** Místa všech hotových ohrad koní. */
  places: number;
  /** Kolik koní ves chce (jezdečtí, klisny, hříbata). */
  wanted: { riding: number; mares: number; foals: number };
  /** Ves chce víc koní, než se vejde do ohrad. */
  overRoom: boolean;
  /** Dostali jezdečtí koně obilí (při nedostatku obilí ne – výcvik se zpomalí). */
  fed: boolean;
  /** Obilí koní za den (kg). */
  grainKgPerDay: number;
  /**
   * Jezdečtí koně jsou bez obilí – upozornění i kronika z téže podmínky jádra (`horsesUngrained`,
   * absence.md – Upozornění vsi do kroniky).
   */
  ungrained: boolean;
  /** Seno koní na celou zimu (kg). */
  hayWinterKg: number;
  /** Kování jezdeckých koní (horses.md – Kování); ves bez jezdeckých koní null. */
  shoeing?: (ShoeingView & { smithFrom: string | null }) | null;
  /** Koně po kusech od nejstaršího. */
  horses: VillageHorse[];
}

/** Koně vsi; ves bez ohrady koní null. */
export function horsesView(state: VillageState, day: number): VillageHorses | null {
  const pens = (state.pens ?? []).filter((p) => p.species === 'horse');
  if (pens.length === 0) return null;
  const all = villageHorses(state);
  const fed = state.horsesFed !== false;
  const stallion = stallionId(all, day);
  const horses = pens
    .flatMap((pen) => penHorses(pen).map((h) => ({ pen, h })))
    .map(({ pen, h }): VillageHorse => ({
      id: h.id,
      kind: horseKind(h, day),
      ageYears: Math.floor(horseAgeYears(h, day) + 1e-9),
      training: Math.min(1, Math.max(0, h.training / HORSES.trainingFull)),
      stallion: h.id === stallion,
      penId: pen.id,
    }))
    .sort((a, b) => b.ageYears - a.ageYears || a.id - b.id);
  const wanted = horsesWanted(state, day);
  const shoeing = shoeingView(state, day);
  return {
    count: all.length,
    kinds: {
      riding: horses.filter((h) => h.kind === 'riding').length,
      mares: horses.filter((h) => h.kind === 'mare').length,
      foals: horses.filter((h) => h.kind === 'foal').length,
    },
    places: horsePlaces(state),
    wanted,
    overRoom: horsesOverRoom(state, day),
    fed,
    grainKgPerDay: horseGrainToday(all, day),
    ungrained: horsesUngrained(state, day),
    hayWinterKg: Math.round(horseHayDailyKg(all, day, fed) * HAY_WINTER_DAYS),
    shoeing: shoeing === null ? null : { ...shoeing, smithFrom: smithFrom(state) },
    horses,
  };
}

/**
 * Ves kováře souseda (markets.md – Rozhodnutí plánu 3, bod 9): ta, od které čeká odpověď
 * (`shoeing.asked`), jinak ta, odkud kovář koně naposled kul (`horses-shod` s `own: false`);
 * prázdné jméno je ves, kterou cizí správce vidět nesmí; žádná – null.
 */
function smithFrom(state: VillageState): string | null {
  const asked = state.shoeing?.asked;
  if (asked) return asked.name;
  for (let i = state.chronicle.length - 1; i >= 0; i--) {
    const event = state.chronicle[i]!;
    // starší záznam bez jména: „kovář ze sousední vsi“, ne „Kovář není“
    if (event.kind === 'horses-shod' && !event.own) return event.villageName ?? '';
  }
  return null;
}

/** Kdo kuje koně, do popisku panelu ohrady: vlastní kovář, kovář z vsi, nebo nikdo. */
export function shoeingSmithText(shoeing: NonNullable<VillageHorses['shoeing']>): string {
  if (shoeing.source === 'own') return 'Kuje vlastní kovář';
  return shoeing.smithFrom === null ? 'Kovář není' : `Kovář ${fromVillage(shoeing.smithFrom)}`;
}
