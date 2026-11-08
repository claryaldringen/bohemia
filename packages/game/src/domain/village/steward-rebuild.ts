// Přestavba vlastních staveb správce (steward.md – Přestavba vlastních staveb; Martin 30. 10. 2026:
// „Přestaví, ne hráčovo“): za obydlí, které správce postavil (`steward.built`) a které dožilo,
// postaví správce místo přestavby na místě nový dům na lepším slotu plánu, když se to vyplatí,
// a starý po přestěhování zbourá (demolition.md – Správce). Stavby hráče a stavby před zapnutím
// správce se nikdy nenahrazují ani neboří.
import { tileCenterWorld, type Landscape, type ObstacleLayer } from '../landscape';
import { craftCoverage } from './crafts';
import { occupants } from './people';
import { DWELLINGS } from './rules-people';
import { STEWARD } from './rules-steward';
import { dwellingBuildLabor } from './rules';
import { startStewardBuild, stewardMode, tileCell, type StewardContext } from './steward';
import { dwellingSiteValue, landValues, takenTiles } from './steward-land';
import { stewardOutlook } from './steward-outlook';
import { isStewardBuilt, isStewardOn } from './steward-state';
import { dateOfDayIndex } from '../calendar';
import type { BuildIntent } from './build-intent';
import type { BuildableDwellingType } from './types-people';
import type { Dwelling, VillageState } from './types';

/** Políčko, na kterém obydlí stojí (index y × size + x), nebo null mimo krajinu. */
function tileOfPoint(landscape: Landscape, x: number, z: number): number | null {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  const tx = Math.floor((x + half) / landscape.cellSizeM);
  const ty = Math.floor((z + half) / landscape.cellSizeM);
  if (tx < 0 || ty < 0 || tx >= landscape.size || ty >= landscape.size) return null;
  return ty * landscape.size + tx;
}

/** Je políčko pod vetem hráče pro dům? */
function houseVetoed(
  state: VillageState,
  landscape: Landscape,
  day: number,
  tile: number,
): boolean {
  const cell = tileCell(landscape, tile);
  return (state.steward?.vetoes ?? []).some(
    (v) => v.kind === 'dwelling' && v.untilDay >= day && v.cell.x === cell.x && v.cell.y === cell.y,
  );
}

/**
 * Zisk přestěhování obydlí `d` (člověkodny za horizont) na slot `slot` oproti zůstání: rozdíl ceny
 * místa za rok (`dwellingSiteValue` – voda a dřevo) × horizont. Nevhodné stávající místo (pod
 * hladinou záplav, svah) = nekonečný zisk. Horizont je `STEWARD.rebuildHorizonYears`, nejvýš
 * životnost nového domu.
 */
export function relocationGain(
  landscape: Landscape,
  current: number | null,
  slot: number,
  people: number,
  type: BuildableDwellingType,
): number {
  const values = landValues(landscape);
  const there = dwellingSiteValue(landscape, values, slot, people);
  if (there === null) return -Infinity;
  const here = current === null ? null : dwellingSiteValue(landscape, values, current, people);
  if (here === null) return Infinity;
  const years = Math.min(STEWARD.rebuildHorizonYears, DWELLINGS[type].lifespanYears);
  return (here - there) * years;
}

/** Přeplatí zisk stěhování přirážku `STEWARD.rebuildMargin` z práce nového domu? */
export function relocationWorthwhile(gain: number, type: BuildableDwellingType): boolean {
  return gain > STEWARD.rebuildMargin * dwellingBuildLabor(type);
}

/**
 * Dožilé obydlí správce: nový dům na nejlepším volném slotu plánu, když zisk za horizont převáží
 * rozdíl ceny (stavba jinde stojí tolik co přestavba na místě, takže rozdíl je jen přirážka
 * `STEWARD.rebuildMargin` z práce nového domu proti šumu); po dostavění se domácnost přestěhuje
 * a starý dům se zbourá (`replaces`, demolition.md – Správce). Mutuje stav; vrací, zda stavba
 * začala (jinak obyvatelé dům přestaví na místě). Jen obydlí v `steward.built` při zapnutém
 * správci – stavby hráče a dílny nikdy.
 */
export function stewardReplace(
  state: VillageState,
  d: Dwelling,
  type: BuildableDwellingType,
  day: number,
  landscape: Landscape,
  obstacles: ObstacleLayer,
): boolean {
  if (!isStewardOn(state) || !isStewardBuilt(state, d.id) || d.workshop) return false;
  const plan = state.steward?.plan;
  if (!plan || plan.stage !== 'done') return false;
  const slots = plan.slots.dwelling ?? [];
  if (slots.length === 0) return false;
  // hráč zrušil náhradu tohoto domu: přestaví se na místě
  const own = tileOfPoint(landscape, d.position.x, d.position.z);
  if (own !== null && houseVetoed(state, landscape, day, own)) return false;
  const people = occupants(state, d.id).length;
  const current = tileOfPoint(landscape, d.position.x, d.position.z);
  const taken = takenTiles(state, day, landscape);
  const ranked = slots
    .filter((t) => !taken[t] && !houseVetoed(state, landscape, day, t))
    .map((t) => ({ t, gain: relocationGain(landscape, current, t, people, type) }))
    .filter((e) => relocationWorthwhile(e.gain, type))
    .sort((a, b) => b.gain - a.gain || a.t - b.t);
  if (ranked.length === 0) return false;
  const coverage = craftCoverage(state, day);
  const ctx: StewardContext = {
    day,
    date: dateOfDayIndex(day),
    landscape,
    obstacles,
    coverage,
    mode: stewardMode(state, day, coverage),
    outlook: stewardOutlook(state, day, coverage),
  };
  for (const { t } of ranked.slice(0, STEWARD.slotTries)) {
    const cell = tileCell(landscape, t);
    const c = tileCenterWorld(landscape, cell.x, cell.y);
    const intent: BuildIntent = {
      kind: 'replacement',
      dwellingId: d.id,
      type,
      position: { x: c.x, z: c.z, rotation: 0 },
      ...(type === 'polozemnice' ? { plot: { cell, variant: 'center' as const } } : {}),
    };
    if (startStewardBuild(state, ctx, intent).ok) return true;
  }
  return false;
}
