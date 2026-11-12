// Typy stavu vsi – Kamenné zdivo (stavební huť) a kostely.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.
// Návrhy: docs/design/stone-masonry.md, docs/design/churches.md.

import type { Position } from './types-people';

/** Okruh stavební huti (stone-masonry.md – Stavební huť); určí typy kostelů (churches.md). */
export type MasonryCircle = 'adriatic' | 'carolingian';

/**
 * Obor mistra huti (stone-masonry.md – Stavební huť): stavbyvedoucí, vápeník, kameník, zedník,
 * štukatér a malíř fresek.
 */
export type MasonCraft = 'builder' | 'limeBurner' | 'stonemason' | 'mason' | 'plasterer';

/** Zkušenost osoby v oborech huti – člověkodny práce v oboru (stone-masonry.md – Zkušenost). */
export type MasonryXp = Partial<Record<MasonCraft, number>>;

/** Mistr nebo kněz na cestě do vsi – dorazí v den `day`. */
export interface LodgeArrival {
  readonly role: MasonCraft | 'priest';
  readonly day: number;
  /** Kostel, ke kterému kněz patří (jen u kněze). */
  readonly churchId?: number;
}

/**
 * Stavební huť vsi (stone-masonry.md). Mistři jsou osoby vsi s `Person.mason`; tady je jen okruh,
 * kdo je na cestě a počítadla odchodu. Chybí = ves huť nepozvala.
 */
export interface Lodge {
  readonly circle: MasonryCircle;
  readonly invitedDay: number;
  /** Mistři a kněží na cestě (příchod za `LODGE.arrivalDays` / `CHURCH.priestAfterDays`). */
  readonly arriving?: readonly LodgeArrival[];
  /** Dní v řadě s pokrytím jídla pod `LODGE.leaving.foodBelow`. */
  readonly hungryDays?: number;
  /** Dní v řadě se štěstím vsi pod `LODGE.leaving.happinessBelow`. */
  readonly unhappyDays?: number;
  /**
   * Ves NPC rodu nenašla místo pro kostel – další hledání nejdřív v tento den (`CHURCH.npc.retryDays`;
   * `steward/npc-masonry.ts`). Ves hráče ho nemá.
   */
  readonly npcRetryDay?: number;
}

/**
 * Typ kostela (churches.md – Typy podle okruhu huti): jednolodní s pravoúhlým kněžištěm
 * a trojlodní bazilika (adriatický), jednolodní s půlkruhovou apsidou a rotunda se dvěma
 * apsidami (karolinský).
 */
export type ChurchType = 'chancel' | 'basilica' | 'apse' | 'rotunda';

/** Rozměry hlavní lodi, které volí hráč (churches.md – Velikost a cena), m. */
export type ChurchDims =
  | { readonly kind: 'round'; readonly diameter: number; readonly height: number }
  | {
      readonly kind: 'long';
      readonly width: number;
      readonly length: number;
      readonly height: number;
    };

/** Práce na kostele po druzích (churches.md – Stavba); každý druh vede mistr `CHURCH_WORK_CRAFT`. */
export type ChurchWork = 'foundation' | 'quarry' | 'lime' | 'sand' | 'walls' | 'roof' | 'decor';

/**
 * Staveniště kostela (churches.md – Stavba; `Construction.church`): typ a rozměry, hotová práce po
 * druzích a stav pece. Dodaný kámen, vápenec a písek se odvodí z hotové práce (`churchMaterials`),
 * vápno je vypálené celkem (i zazděné).
 */
export interface ChurchSite {
  readonly type: ChurchType;
  readonly dims: ChurchDims;
  /** Hotová práce po druzích (čd); `lime` i se stavbou pece. */
  done: Partial<Record<ChurchWork, number>>;
  /** Vypálené vápno celkem (t), i to, které už je ve zdivu. */
  limeT: number;
  /** Stavba pece (čd, nejvýš `LIME.kilnBuildManDays`). */
  kilnDone: number;
  /** Dávka v peci (t vápna) a den, kdy je vypálená; mimo pálení chybí. */
  burnT?: number;
  burnUntilDay?: number;
  /** Zahloubená pec u staveniště (v pásu hřbitůvku) a písník u nejbližší vody. */
  readonly kiln: { readonly x: number; readonly z: number };
  readonly sandPit: { readonly x: number; readonly z: number };
  /**
   * Lom (id skalního výchozu), odkud se láme kámen a vápenec, a jeho vzdušná vzdálenost od
   * kostela (m) – nošení v nůších (fortifications.md – Kámen, Nošení kamene a vůz).
   */
  readonly quarryId: number;
  readonly quarryDistanceM: number;
  /** Kámen z hromad vsi při zahájení (m³); zbytek se láme v lomu. */
  readonly stoneFromPileM3: number;
  /** Příprava staveniště – kácení dřeva stavby a odklizení překážek (čd); jde před vším. */
  readonly prepManDays: number;
}

/** Cena kostela z objemu zdiva (churches.md – Velikost a cena). */
export interface ChurchCost {
  /** Objem zdiva včetně základů, m³. */
  readonly masonryM3: number;
  readonly stoneM3: number;
  readonly limeT: number;
  readonly limestoneT: number;
  readonly sandM3: number;
  /** Dřevo na krov a pálení vápna, kg. */
  readonly woodKg: number;
  /** Člověkodny po druzích práce (lámání kamene a vápence bez vzdálenosti lomu). */
  readonly work: Readonly<Record<ChurchWork, number>>;
}

/** Hrob na hřbitůvku u kostela (churches.md – Co kostel dává). */
export interface ChurchGrave {
  readonly personId: number;
  readonly day: number;
}

/** Dostavěný kostel vsi (churches.md). */
export interface Church {
  readonly id: number;
  readonly type: ChurchType;
  readonly dims: ChurchDims;
  /** Střed hlavní lodi; `rotation` = směr osy západ → východ (vstup → kněžiště), rad. */
  readonly position: Position;
  readonly finishedDay: number;
  /** Den dokončení výzdoby (omítky a fresky); chybí = holý kostel. */
  readonly decoratedDay?: number;
  /** Kněz kostela (id osoby); chybí = kněz ještě nepřišel nebo zemřel a nový je na cestě. */
  readonly priestId?: number;
  /** Den, kdy do kostela dorazí nový kněz (po dostavění nebo po smrti kněze); chybí = kněz je, nebo se den ještě nezapsal. */
  readonly priestArrivalDay?: number;
  /** Hroby na hřbitůvku (nejstarší první); hrob starší než `CHURCH.graveReuseYears` se uvolní. */
  readonly graves?: readonly ChurchGrave[];
}
