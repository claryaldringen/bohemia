// Obilné jámy v pohledu na ves (docs/design/production-chains.md – Obilné jámy; Martin 20. 10. 2026:
// „Označit půjde jen otevřená jáma - zavřená nebude vidět - a v označení se ukáže kolik v ní je
// zrní.“): jen otevřené jámy – scéna je kreslí a jdou vybrat, panel ukáže zrno v jámě. Zapečetěné
// jámy pohled nezná. Žádná nová pravidla – jámy po dnešním odběru (`openGrainPits` z jádra). Čistý
// modul – smí i do prohlížeče.
import {
  openGrainPits,
  type GrainPit,
  type VillageState,
  type VillageSummary,
} from '@bohemia/game';
import { structureUseOf } from './village-view-structure-use';
import type { StructureUseView } from './village-view-types';

const DAYS_PER_YEAR = 365;

/** Otevřená obilná jáma pro panel výběru. */
export interface VillageGrainPit {
  /** Id jámy – vybírá se podle něj (`{ kind: 'grain-pit', id }`). */
  id: number;
  /** Zrno v jámě (kg, po celých). */
  grainKg: number;
  /** Kolik zrna se do jámy vejde (kg). */
  capacityKg: number;
  /** Stáří jámy v celých letech od vykopání. */
  ageYears: number;
  /** Opustit, zbourat, vrátit (demolition.md); chybí, kde pohled stavbě tlačítka nedává. */
  use?: StructureUseView;
}

/** Otevřená obilná jáma ve scéně: id, střed (m) a jak je plná 0–1 (po 5 %). */
export interface SceneGrainPit {
  id: number;
  x: number;
  z: number;
  fill: number;
}

/**
 * Jámy v pohledu: otevřené a opuštěné (prázdná opuštěná jáma zůstane vidět a jde vrátit nebo
 * zbourat – návrh Clauda, demolition.md).
 */
function visiblePits(state: VillageState): GrainPit[] {
  const open = openGrainPits(state);
  const disused = (state.grainPits ?? []).filter(
    (p) => p.disusedDay !== undefined && !open.some((o) => o.id === p.id),
  );
  return [...open, ...disused];
}

/** Otevřené jámy pro panel výběru – po dnešním odběru ze zásob. */
export function grainPitViews(
  state: VillageState,
  day: number,
  summary?: Pick<VillageSummary, 'constructions'>,
): VillageGrainPit[] {
  return visiblePits(state).map((p) => ({
    id: p.id,
    grainKg: Math.round(p.grainKg),
    capacityKg: p.capacityKg,
    ageYears: Math.max(0, Math.floor((day - p.dugDay) / DAYS_PER_YEAR)),
    ...(summary ? structureUseOf(state, summary, { structure: 'grain-pit', id: p.id }, day) : {}),
  }));
}

/** Pole pohledu na ves s otevřenými jamami (chybí, když žádná není). */
export function grainPitsField(
  state: VillageState,
  day: number,
  summary?: Pick<VillageSummary, 'constructions'>,
): { grainPits?: VillageGrainPit[] } {
  const pits = grainPitViews(state, day, summary);
  return pits.length > 0 ? { grainPits: pits } : {};
}

/** Otevřené jámy pro scénu – kolik zrna v nich je po 5 % (scéna se nepřestavuje každý den). */
export function sceneGrainPits(state: VillageState): SceneGrainPit[] {
  return visiblePits(state).map((p) => ({
    id: p.id,
    x: p.x,
    z: p.z,
    fill: p.capacityKg > 0 ? Math.round((p.grainKg / p.capacityKg) * 20) / 20 : 0,
  }));
}
