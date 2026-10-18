import {
  sacredBuildingHappiness,
  type Craft,
  type Crop,
  type DwellingType,
  type FieldSurface,
  type HerdSpecies,
  type PartStage,
  type RoadGrade,
  type RoadUpgradeOption,
  type SacredBuildingKind,
  type WorkshopActivity,
} from '@bohemia/game';
import type { VillageTarget } from './scene/village-picking';
import { CRAFT_LOOKS, type SceneVillage, type VillageRoad, type VillageView } from './village-view';

// Co ukáže panel výběru (dole uprostřed, jako v 0 A.D.) o vybraném obydlí (i řemeslné dílně –
// crafts.md), poli, hřbitovu, sadu, posvátném místě (posvátný dub, dubový háj, modla, svatyně –
// happiness.md) nebo ohradě (oxen.md – zvířata, spřežení, výcvik a seno; diet.md – stáda vsi).
// Čistý modul – data z pohledu na ves a scény vsi.

/** Řemeslná dílna v panelu výběru – co dělá, kolik vyrobí a zásoba jejího výrobku. */
export interface SelectionWorkshop {
  craft: Craft;
  activity: WorkshopActivity;
  /** Práce řemeslu za den (člověkodny). */
  laborPerDay: number;
  /** Výroba za den, když jsou vstupy (kg). */
  outputPerDayKg: number;
  /** Zásoba výrobku ve vsi (kg). */
  stockKg: number;
  /** Pokrytí potřeby vsi výrobkem 0–1 (nástroje, keramika); uhlí null. */
  coverage: number | null;
  /**
   * Uhlíř: rozdělaný milíř – fáze, buky (připravené / v dávce), průběh fáze 0–1, v lese
   * (crafts.md – Uhlíř); jinak null.
   */
  kiln: VillageView['crafts']['workshops'][number]['kiln'];
  /** Uhlíř: pařezy buků, na které ještě zasadí mladý buk. */
  toPlant: number;
}

export type SelectionDetails =
  | {
      kind: 'dwelling';
      id: number;
      type: DwellingType;
      occupants: number;
      capacity: number;
      /** Věk obyvatel v letech, od nejstaršího. */
      ages: number[];
      condition: number;
      ageYears: number;
      full: boolean;
      overcrowded: boolean;
      /**
       * Obyvatelé obydlí přestavují (průběh 0–1, nový typ a stromy, které ještě musí skácet),
       * jinak null.
       */
      rebuild: { progress: number; type: DwellingType; treesToFell: number } | null;
      /** Řemeslná dílna (crafts.md); obyčejné obydlí null. */
      workshop: SelectionWorkshop | null;
    }
  | {
      kind: 'site';
      id: number;
      type: DwellingType;
      /** Stavěná řemeslná dílna; obydlí null. */
      craft: Craft | null;
      /** Průběh celé stavby i s kácením dřeva 0–1. */
      progress: number;
      /** Kolik stromů stavba ještě musí skácet (forest.md). */
      treesToFell: number;
    }
  | {
      kind: 'field';
      id: number;
      areaM2: number;
      fertility: number;
      /** Díly podle stadia v pořadí PART_STAGE_ORDER (jen nenulová). */
      stages: { stage: PartStage; count: number }[];
      /**
       * Díly podle povrchu, na kterém se zakládaly, v pořadí FIELD_SURFACE_ORDER (jen nenulové) –
       * prázdné, když je celé pole na louce.
       */
      surfaces: { surface: FieldSurface; count: number }[];
      /**
       * Oseté díly podle plodiny v pořadí CROP_ORDER (jen nenulové – fields.md, Ozim a jař,
       * Luštěniny).
       */
      crops: { crop: Crop; count: number }[];
      /** Díly s popelem z vymýceného lesa (fields.md – Úroda). */
      ashParts: number;
      /** Nejvyšší letošní bonus úrodnosti z popela (+40 první sezónu, +20 druhou), jinak 0. */
      ashBonus: number;
      /** Zakládání pole (průběh 0–1), hotové null. */
      founding: number | null;
    }
  | {
      kind: 'cemetery';
      id: number;
      squares: number;
      capacity: number;
      graves: number;
      freeGraves: number;
      /** Odhad, za kolik let se zaplní; bez úmrtí null. Hygienu hráč nevidí (cemetery.md). */
      yearsLeft: number | null;
      /** Vytyčený a ohrazený – nehotový ukáže jen průběh založení. */
      built: boolean;
      /** Stavba – založení, u hotového rozšíření (průběh 0–1); bez stavby null. */
      building: number | null;
    }
  | {
      kind: 'orchard';
      id: number;
      areaM2: number;
      /** Stáří v celých letech od výsadby; nevysazený null. */
      ageYears: number | null;
      /** Úroda nejbližší sklizně (kg jablek). */
      expectedYieldKg: number;
      /** Výsadba (průběh 0–1); vysazený sad null. */
      planting: number | null;
      /** Výsadba čeká na okno (jaro, podzim). */
      plantingWaits: boolean;
    }
  | {
      kind: 'sacred-oak';
      id: number;
      /** Kolik dub sám přidává štěstí (stropy vsi platí zvlášť). */
      happiness: number;
      /**
       * Stáří dubu v celých letech (podle velikosti, roste s herním časem; souš – stáří, kdy
       * uschla); neznámé null.
       */
      ageYears: number | null;
      /** Dub stářím uschl – stojí posvátná souš. */
      snag: boolean;
    }
  | {
      kind: 'grove';
      id: number;
      /** Dospělé duby háje (v okruhu 25 m). */
      oaks: number;
      /** Kolik háj sám přidává štěstí. */
      happiness: number;
      /** Stáří nejstaršího dubu háje v celých letech; neznámé null. */
      ageYears: number | null;
    }
  | {
      kind: 'sacred';
      id: number;
      type: SacredBuildingKind;
      /** Kolik stavba přidá štěstí (hotová přidává, rozestavěná až po dostavění). */
      happiness: number;
      /** Stavba (průběh celé stavby i s kácením dubů 0–1); hotová null. */
      building: number | null;
      /** Kolik dubů stavba ještě musí skácet. */
      oaksToFell: number;
    }
  | {
      kind: 'pen';
      id: number;
      built: boolean;
      /** Průběh stavby 0–1 (hotová 1). */
      progress: number;
      /** Voli v ohradě – spřežení i telata ve výcviku. */
      oxen: number;
      /** Krávy v ohradě (v zimě). */
      cows: number;
      /** Stáda vsi (kusy) a slepice u obydlí. */
      herds: Record<HerdSpecies, number>;
      chickens: number;
      /** Pastva vsi a kolik ji stáda spásají (ha). */
      pastureHa: number;
      grazingHa: number;
      /** Mléko stád dnes (l, v době dojení – diet.md). */
      milkLPerDay: number;
      /** Vycvičené spřežení – stáří a kolik let ještě slouží; bez spřežení null. */
      team: { ageYears: number; yearsLeft: number } | null;
      /** Výcvik spřežení – průběh 0–1 a zbývající dny; bez výcviku null. */
      training: { progress: number; daysLeft: number } | null;
      /** Zásoba sena vsi (kg). */
      hayKg: number;
      /** Proč teď nejde začít výcvik (česky), nebo null. */
      trainBlocked: string | null;
    }
  | {
      kind: 'road';
      id: number;
      grade: RoadGrade;
      lengthM: number;
      ageYears: number;
      /** Stojící stromy u úseku. */
      trees: number;
      /** Mokřina na ose (m) a brody – kde se hodí hať a lávka. */
      wetM: number;
      fords: number;
      /** Rozestavěné vylepšení (stupeň, průběh 0–1, stromy ke skácení); jinak null. */
      building: { grade: RoadGrade; progress: number; treesToFell: number } | null;
      /** Vylepšení, která úsek nabízí – cena a proč teď nejde. */
      upgrades: RoadUpgradeOption[];
      /** Jabloně podél úseku a „Vysadit jabloně“ (roads.md – Vysazení jabloní). */
      apples: VillageRoad['apples'];
    };

/** Pořadí stád v panelu ohrady (diet.md – Dobytek). */
export const HERD_ORDER: readonly HerdSpecies[] = ['sheep', 'goat', 'pig', 'cow'];

/** Ikony a názvy stád (`/icons/resources/<ikona>.png`). */
export const HERD_LABELS: Record<HerdSpecies, { name: string; icon: string }> = {
  sheep: { name: 'Ovce', icon: 'sheep' },
  goat: { name: 'Kozy', icon: 'goat' },
  pig: { name: 'Prasata', icon: 'pig' },
  cow: { name: 'Krávy', icon: 'cow' },
};

/** Pořadí stadií dílů v panelu pole – od zakládání po příloh (pastvinu). */
export const PART_STAGE_ORDER: readonly PartStage[] = [
  'founding',
  'ready',
  'sown',
  'young-fallow',
  'meadow',
];

/** Pořadí plodin v panelu pole – ozim (sklízí se dřív), jař, luštěniny. */
export const CROP_ORDER: readonly Crop[] = ['winter', 'spring', 'legume'];

/** Popisky plodin a ikony (`/icons/resources/<ikona>.png`). */
export const CROP_LABELS: Record<Crop, { name: string; icon: string }> = {
  winter: { name: 'Ozim – žito a pšenice, zasetá na podzim, sklizeň v červenci', icon: 'ozim' },
  spring: { name: 'Jař – ječmen, zasetý na jaře, sklizeň v srpnu', icon: 'jar' },
  legume: {
    name: 'Luštěniny – hrách a čočka, zaseté na jaře, sklizeň v červenci',
    icon: 'legumes',
  },
};

/** Pořadí povrchů v panelu pole – od louky po les. */
export const FIELD_SURFACE_ORDER: readonly FieldSurface[] = ['meadow', 'shrub', 'forest'];

export const FIELD_SURFACE_NAMES: Record<FieldSurface, string> = {
  meadow: 'Založeno na louce',
  shrub: 'Založeno v křovinách',
  forest: 'Založeno v lese',
};

export const PART_STAGE_NAMES: Record<PartStage, string> = {
  founding: 'Zakládá se',
  ready: 'Připraveno k osevu',
  sown: 'Oseto',
  'young-fallow': 'Mladý příloh',
  meadow: 'Příloh – pastvina',
};

/** Údaje o vybraném cíli, nebo null (nic nevybráno, cíl zanikl, ves ještě není). */
export function selectionDetails(
  view: VillageView | null,
  scene: SceneVillage,
  target: VillageTarget | null,
): SelectionDetails | null {
  if (!target) return null;
  if (target.kind === 'dwelling') {
    const dwelling = scene.dwellings.find((d) => d.id === target.id);
    if (!dwelling) return null;
    if (!dwelling.built) {
      // staveniště ve scéně ukazuje jen stavbu – panel celý průběh i s kácením dřeva
      const construction = view?.constructions.find((c) => c.id === dwelling.id);
      return {
        kind: 'site',
        id: dwelling.id,
        type: dwelling.type,
        craft: dwelling.craft ?? null,
        progress: construction?.progress ?? dwelling.progress,
        treesToFell: construction?.treesToFell ?? 0,
      };
    }
    const household = view?.households.find((h) => h.dwellingId === target.id);
    if (!household) return null;
    const rebuild = view?.constructions.find(
      (c) => c.kind === 'rebuild' && c.dwellingId === target.id,
    );
    return {
      kind: 'dwelling',
      id: household.dwellingId,
      type: household.type,
      occupants: household.occupants,
      capacity: household.capacity,
      ages: household.ages,
      condition: household.condition,
      ageYears: household.ageYears,
      full: household.full,
      overcrowded: household.overcrowded,
      rebuild: rebuild
        ? {
            progress: rebuild.progress,
            type: rebuild.dwellingType ?? household.type,
            treesToFell: rebuild.treesToFell,
          }
        : null,
      workshop: view ? workshopDetails(view, household.dwellingId) : null,
    };
  }
  if (target.kind === 'cemetery') {
    const cemetery = view?.cemeteries.find((c) => c.id === target.id);
    if (!cemetery) return null;
    return {
      kind: 'cemetery',
      id: cemetery.id,
      squares: cemetery.squares,
      capacity: cemetery.capacity,
      graves: cemetery.graves,
      freeGraves: cemetery.freeGraves,
      yearsLeft: cemetery.yearsLeft,
      built: cemetery.built,
      building: cemetery.built && cemetery.progress >= 1 ? null : cemetery.progress,
    };
  }
  if (target.kind === 'sacred-oak') {
    const oak = view?.sacred.oaks.find((o) => o.id === target.id);
    return oak
      ? {
          kind: 'sacred-oak',
          id: oak.id,
          happiness: oak.happiness,
          ageYears: oak.ageYears,
          snag: oak.snag,
        }
      : null;
  }
  if (target.kind === 'grove') {
    const grove = view?.sacred.groves.find((g) => g.id === target.id);
    return grove
      ? {
          kind: 'grove',
          id: grove.id,
          oaks: grove.oaks,
          happiness: grove.happiness,
          ageYears: grove.ageYears,
        }
      : null;
  }
  if (target.kind === 'sacred') return sacredDetails(view, scene, target.id);
  if (target.kind === 'pen') return penDetails(view, target.id);
  if (target.kind === 'road') {
    const road = view?.roads.find((r) => r.id === target.id);
    return road ? { kind: 'road', ...road } : null;
  }
  if (target.kind === 'orchard') {
    const orchard = view?.orchards.find((o) => o.id === target.id);
    if (!orchard) return null;
    return {
      kind: 'orchard',
      id: orchard.id,
      areaM2: orchard.areaM2,
      ageYears: orchard.ageYears,
      expectedYieldKg: orchard.expectedYieldKg,
      planting: orchard.planting,
      plantingWaits: orchard.plantingWaits,
    };
  }
  const field = view?.fields.find((f) => f.id === target.id);
  if (!field) return null;
  const founding = view?.constructions.find((c) => c.kind === 'field' && c.fieldId === target.id);
  return {
    kind: 'field',
    id: field.id,
    areaM2: field.areaM2,
    fertility: field.fertility,
    stages: PART_STAGE_ORDER.flatMap((stage) => {
      const count = field.stages[stage] ?? 0;
      return count > 0 ? [{ stage, count }] : [];
    }),
    surfaces: Object.keys(field.surfaces).some((s) => s !== 'meadow')
      ? FIELD_SURFACE_ORDER.flatMap((surface) => {
          const count = field.surfaces[surface] ?? 0;
          return count > 0 ? [{ surface, count }] : [];
        })
      : [],
    crops: CROP_ORDER.flatMap((crop) => {
      const count = field.crops[crop] ?? 0;
      return count > 0 ? [{ crop, count }] : [];
    }),
    ashParts: field.ashParts,
    ashBonus: field.ashBonus,
    founding: founding ? founding.progress : null,
  };
}

/** Řemeslná dílna obydlí `dwellingId` pro panel; obyčejné obydlí null. */
function workshopDetails(view: VillageView, dwellingId: number): SelectionWorkshop | null {
  const workshop = view.crafts.workshops.find((w) => w.dwellingId === dwellingId);
  if (!workshop) return null;
  const { stock } = CRAFT_LOOKS[workshop.craft].product;
  const coverage =
    workshop.craft === 'smith'
      ? view.crafts.coverage.tools
      : workshop.craft === 'potter'
        ? view.crafts.coverage.pottery
        : null;
  return {
    craft: workshop.craft,
    activity: workshop.activity,
    laborPerDay: workshop.laborPerDay,
    outputPerDayKg: workshop.outputPerDayKg,
    stockKg: view.crafts.stocks[stock],
    coverage,
    kiln: workshop.kiln,
    toPlant: workshop.toPlant,
  };
}

/**
 * Modla nebo svatyně – z pohledu na ves, staveniště čekající na server (jen ve scéně) s nulovým
 * průběhem.
 */
function sacredDetails(
  view: VillageView | null,
  scene: SceneVillage,
  id: number,
): SelectionDetails | null {
  const building = view?.sacred.buildings.find((b) => b.id === id);
  if (building) {
    return {
      kind: 'sacred',
      id,
      type: building.kind,
      happiness: building.happiness,
      building: building.built ? null : building.progress,
      oaksToFell: building.built ? 0 : building.oaksToFell,
    };
  }
  const site = scene.sacred?.buildings.find((b) => b.id === id);
  if (!site) return null;
  return {
    kind: 'sacred',
    id,
    type: site.kind,
    happiness: sacredBuildingHappiness(site.kind),
    building: site.built ? null : site.progress,
    oaksToFell: 0,
  };
}

/** Ohrada – z pohledu na ves (stáda, pastva a seno jsou celé vsi). */
function penDetails(view: VillageView | null, id: number): SelectionDetails | null {
  const pen = view?.pens.find((p) => p.id === id);
  if (!view || !pen) return null;
  return {
    kind: 'pen',
    id,
    built: pen.built,
    progress: pen.progress,
    oxen: pen.oxen,
    cows: pen.cows,
    herds: view.livestock.herds,
    chickens: view.livestock.chickens,
    pastureHa: view.livestock.pastureHa,
    grazingHa: view.livestock.grazingHa,
    milkLPerDay: view.livestock.milkLPerDay,
    team: pen.team,
    training: pen.training,
    hayKg: view.hayKg,
    trainBlocked: pen.trainBlocked,
  };
}
