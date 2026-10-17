import {
  DWELLINGS,
  FOUNDING_COST_PER_HA,
  dateOfDayIndex,
  partStage,
  summarizeVillage,
  tileCenterWorld,
  type BuildBlocker,
  type ChronicleEvent,
  type ConstructionSummary,
  type DwellingType,
  type Landscape,
  type PartStage,
  type PlacementCheck,
  type PlacementVillage,
  type Position,
  type VillageRecord,
  type VillageState,
} from '@bohemia/game';
import { formatGameDate } from './game-date';

// Pohled na ves pro panel a scénu (DTO server actions). Čistý modul – smí ho importovat
// i klient (typy, převod scény na data pro kontrolu umístění).

export type { PartStage } from '@bohemia/game';

export interface VillageView {
  name: string;
  dayIndex: number;
  people: { children: number; adults: number; elders: number };
  households: {
    dwellingId: number;
    type: DwellingType;
    occupants: number;
    capacity: number;
    full: boolean;
    overcrowded: boolean;
    condition: number;
  }[];
  storesKg: number;
  storesMonths: number;
  satiation: number;
  commonLaborPerDay: number;
  canBuildDwelling: PlacementCheck;
  costs: { zemnice: number; polozemnice: number; fieldPerHa: number };
  constructions: {
    id: number;
    kind: 'dwelling' | 'rebuild' | 'field';
    label: string;
    progress: number;
  }[];
  scene: SceneVillage;
  /** Posledních CHRONICLE_LENGTH událostí, nejnovější první. */
  chronicle: { day: number; dateLabel: string; text: string }[];
}

export interface SceneVillage {
  /** Hotová obydlí (`built: true`, id obydlí) i rozestavěná (`built: false`, id stavby). */
  dwellings: {
    id: number;
    type: DwellingType;
    position: Position;
    built: boolean;
    progress: number;
  }[];
  /** Pole s obrysem a díly – střed políčka (x, z), strana políčka `size` v m a stadium. */
  fields: {
    id: number;
    outline: [number, number][];
    parts: { x: number; z: number; size: number; stage: PartStage }[];
  }[];
}

export const CHRONICLE_LENGTH = 8;

const DWELLING_NAMES: Record<DwellingType, { nominative: string; accusative: string }> = {
  zemnice: { nominative: 'Zemnice', accusative: 'zemnici' },
  polozemnice: { nominative: 'Polozemnice', accusative: 'polozemnici' },
};

const BUILD_BLOCKERS: Record<BuildBlocker, string> = {
  'no-full-household':
    'Nové obydlí jde stavět, až bude některá domácnost plná a budou v ní aspoň 4 dospělí.',
  'already-building': 'Na každou plnou domácnost smí být rozestavěné jen jedno nové obydlí.',
};

const M2_PER_HA = 10_000;

/** Číslo s mezerami po tisících (bez nezlomitelných mezer – stejně na serveru i v prohlížeči). */
function formatInteger(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatHa(areaM2: number): string {
  return (areaM2 / M2_PER_HA).toFixed(2).replace('.', ',');
}

function deathText(group: 'child' | 'adult' | 'elder'): string {
  if (group === 'child') return 'Zemřelo dítě.';
  if (group === 'adult') return 'Zemřel jeden z dospělých.';
  return 'Zemřel jeden ze starších.';
}

function finishedText(kind: 'dwelling' | 'rebuild' | 'field'): string {
  if (kind === 'dwelling') return 'Dostavěli nové obydlí.';
  if (kind === 'rebuild') return 'Dokončili přestavbu obydlí.';
  return 'Pole je založené – dá se osévat.';
}

/** Text události kroniky česky. */
export function chronicleText(event: ChronicleEvent, villageName: string): string {
  switch (event.kind) {
    case 'village-founded':
      return `Osadníci založili ves ${villageName}.`;
    case 'birth':
      return 'Narodilo se dítě.';
    case 'death':
      return deathText(event.group);
    case 'household-founded':
      return 'Dva mladí dospělí založili v novém obydlí vlastní domácnost.';
    case 'household-merged':
      return 'Zbytek domácnosti se přestěhoval k sousedům.';
    case 'construction-finished':
      return finishedText(event.constructionKind);
    case 'rebuild-decided':
      return `Obyvatelé se rozhodli přestavět dožilé obydlí na ${DWELLING_NAMES[event.type].accusative}.`;
    case 'harvest':
      return `Sklizeň: ${formatInteger(event.kg)} kg obilí.`;
    case 'hunger-began':
      return 'Ve vsi začal hlad – zásoby nevystačí do sklizně.';
    case 'hunger-ended':
      return 'Hlad skončil.';
    case 'part-became-forest':
      return 'Opuštěný díl pole zarostl v les.';
  }
}

function constructionLabel(c: ConstructionSummary): string {
  if (c.kind === 'field') return `Pole ${formatHa(c.areaM2 ?? 0)} ha`;
  const type = c.dwellingType ?? 'zemnice';
  if (c.kind === 'rebuild') return `Přestavba na ${DWELLING_NAMES[type].accusative}`;
  return DWELLING_NAMES[type].nominative;
}

function sceneVillage(
  state: VillageState,
  landscape: Landscape,
  day: number,
  constructions: ConstructionSummary[],
): SceneVillage {
  const built = state.dwellings.map((d) => ({
    id: d.id,
    type: d.type,
    position: d.position,
    built: true,
    progress: 1,
  }));
  const sites = state.constructions.flatMap((c) => {
    if (c.kind !== 'dwelling' || c.dwellingType === null || c.position === null) return [];
    const progress = constructions.find((s) => s.id === c.id)?.progress ?? 0;
    return [{ id: c.id, type: c.dwellingType, position: c.position, built: false, progress }];
  });
  const fields = state.fields.map((f) => ({
    id: f.id,
    outline: f.outline,
    parts: state.parts.flatMap((p) => {
      if (p.fieldId !== f.id || p.cell === undefined) return [];
      const center = tileCenterWorld(landscape, p.cell.x, p.cell.y);
      return [{ x: center.x, z: center.z, size: landscape.cellSizeM, stage: partStage(p, day) }];
    }),
  }));
  return { dwellings: [...built, ...sites], fields };
}

function chronicle(state: VillageState, name: string): VillageView['chronicle'] {
  return state.chronicle
    .slice(-CHRONICLE_LENGTH)
    .reverse()
    .map((event) => ({
      day: event.day,
      dateLabel: formatGameDate(dateOfDayIndex(event.day)),
      text: chronicleText(event, name),
    }));
}

/** Pohled na ves v den `day` (ves má být dopočítaná do tohoto dne). */
export function buildVillageView(
  record: VillageRecord,
  landscape: Landscape,
  day: number,
): VillageView {
  const { state, name } = record;
  const summary = summarizeVillage(state, day);
  return {
    name,
    dayIndex: day,
    people: summary.people,
    households: summary.households,
    storesKg: summary.storesKg,
    storesMonths: summary.storesMonths,
    satiation: summary.satiation,
    commonLaborPerDay: summary.commonLaborPerDay,
    canBuildDwelling: summary.canBuildDwelling
      ? { ok: true, reason: null }
      : { ok: false, reason: BUILD_BLOCKERS[summary.buildBlocker ?? 'no-full-household'] },
    costs: {
      zemnice: DWELLINGS.zemnice.cost,
      polozemnice: DWELLINGS.polozemnice.cost,
      fieldPerHa: FOUNDING_COST_PER_HA.meadow,
    },
    constructions: summary.constructions.map((c) => ({
      id: c.id,
      kind: c.kind,
      label: constructionLabel(c),
      progress: c.progress,
    })),
    scene: sceneVillage(state, landscape, day, summary.constructions),
    chronicle: chronicle(state, name),
  };
}

/**
 * Data pro kontrolu umístění v prohlížeči (`checkDwellingPlacement`, `fieldPartsFromOutline`)
 * ze scény vsi – hotová i rozestavěná obydlí jako obydlí, pole podle obrysu.
 */
export function placementVillageFromScene(scene: SceneVillage): PlacementVillage {
  return {
    dwellings: scene.dwellings.map((d) => ({ type: d.type, position: d.position })),
    constructions: [],
    fields: scene.fields.map((f) => ({ outline: f.outline })),
  };
}
