// Škody zvěře na polích (wildlife.md – Škody, Prasata a jeleni na polích): od 1. 6. do sklizně dílu
// prasata a jelení zvěř ubírají úrodu dílů u lesa, vrány 2 % osetých dílů. Bez náhody.

import { dateOfDayIndex } from '../calendar';
import type { Landscape } from '../landscape';
import { effectiveFertility } from './fields';
import { taskPosition, taskSpans } from './field-progress';
import { FIELD_DAMAGE } from './rules-wildlife';
import type { Crop, CropWork, FieldDamage, FieldPart, VillageState, WildlifeState } from './types';
import { forestEdgeDistances } from './wildlife-land';
import { cropGrossPerHa, seasonCrops } from './year-plan';

const M2_PER_HA = 10_000;
const EPSILON = 1e-9;

type DamageCrop = 'winter' | 'spring';

/** Váha dílu podle vzdálenosti od okraje lesa: 1 do 50 m, k 250 m klesá na 0. */
export function edgeWeight(edgeM: number): number {
  const { fullM, zeroM } = FIELD_DAMAGE.weight;
  if (edgeM <= fullM) return 1;
  if (edgeM >= zeroM) return 0;
  return (zeroM - edgeM) / (zeroM - fullM);
}

/** Obilné plodiny hospodářského roku, které zvěř ničí (ozim, jař; i nad potřebu). */
function cerealCrops(state: VillageState): { crop: DamageCrop; work: CropWork }[] {
  if (!state.season) return [];
  return seasonCrops(state.season).flatMap(({ crop, work }) =>
    crop === 'winter' || crop === 'spring' ? [{ crop, work }] : [],
  );
}

/**
 * 1. 6. (před prací dne): ohrožené díly sezóny – osetý ozim a jař (i nad potřebu) s váhou podle
 * vzdálenosti od lesa (`forestEdgeDistances`; bez krajiny les dílu 0 m, jiný `defaultEdgeM`).
 * Díl s váhou 0 zůstává v seznamu kvůli vranám. Ztráty začínají od nuly, loňský součet se zapíše
 * do `lastYearKg`. Jiný den nic nedělá.
 */
export function damageWindowStart(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
): void {
  const w = state.wildlife;
  if (!w) return;
  const date = dateOfDayIndex(day);
  if (date.month !== FIELD_DAMAGE.windowStart.month || date.day !== FIELD_DAMAGE.windowStart.day)
    return;
  const distances = landscape ? forestEdgeDistances(landscape, state) : null;
  const byId = new Map(state.parts.map((p) => [p.id, p]));
  const risk: FieldDamage['risk'] = [];
  for (const { work } of cerealCrops(state)) {
    if (work.harvestedKg !== null) continue;
    const sown = sownPartIds(work, byId, day);
    for (const id of work.partIds) {
      const part = byId.get(id);
      if (!part || !sown.has(id)) continue;
      const edgeM = distances?.get(id) ?? defaultEdgeM(part);
      risk.push({
        partId: id,
        weightHa: (part.areaM2 / M2_PER_HA) * edgeWeight(edgeM),
        edgeM: Number.isFinite(edgeM) ? Math.round(edgeM) : 9999,
      });
    }
  }
  const previous = w.damage;
  w.damage = {
    fromDay: day,
    risk,
    parts: {},
    topPartId: null,
    totalKg: 0,
    ...(previous ? { lastYearKg: previous.totalKg } : {}),
  };
}

function defaultEdgeM(part: FieldPart): number {
  return part.surface === 'forest' ? 0 : FIELD_DAMAGE.defaultEdgeM;
}

/** Díly plodiny, které setí už zasáhlo celé (v 1. 6. je setí hotové). */
function sownPartIds(
  work: CropWork,
  byId: ReadonlyMap<number, FieldPart>,
  day: number,
): Set<number> {
  const position = taskPosition(work, 'sow');
  const sown = new Set<number>();
  for (const span of taskSpans(work, byId, 'sow', day)) {
    if (position >= span.end - EPSILON) sown.add(span.id);
  }
  return sown;
}

/** Díly plodiny, které sklizeň už prošla celé. */
function harvestedPartIds(
  work: CropWork,
  byId: ReadonlyMap<number, FieldPart>,
  day: number,
): Set<number> {
  const position = taskPosition(work, 'harvest');
  const done = new Set<number>();
  if (position <= 0) return done;
  for (const span of taskSpans(work, byId, 'harvest', day)) {
    if (position >= span.end - EPSILON) done.add(span.id);
  }
  return done;
}

/** Kg obilí za den, které sežere dnešní zvěř (bez násobku malé vsi). */
export function wildlifeEatsKgPerDay(w: WildlifeState): number {
  const k = FIELD_DAMAGE.kgPerDay;
  return (
    w.boar.adults * k.adult +
    w.boar.piglets * k.piglet +
    w.deer.stags * k.stag +
    w.deer.hinds * k.hind +
    w.deer.calves * k.calf
  );
}

/**
 * Škoda dne (po práci dne, před jídlem): kg zvěře podle kusů se vynásobí `min(1; Σ plocha × váha
 * ÷ 10 ha)` (malá ves u lesa; Martin 26. 10. 2026), rozdělí podle plochy × váhy na dosud
 * nesklizené osetré díly a přepočte na podíl hrubé úrody dílu (celkem nejvýš `maxShare`, zbytek
 * zvěř spásla v lese). Vrány berou nesklizeným dílům `crowShare ÷ délka okna plodiny` denně.
 * Sklizené díly neztrácejí. Mimo okno (1. 6. – 31. 8.) nic.
 */
export function wildlifeDamageDay(state: VillageState, day: number): void {
  const w = state.wildlife;
  const damage = w?.damage;
  if (!w || !damage || damage.risk.length === 0) return;
  const date = dateOfDayIndex(day);
  if (date.month < 6 || date.month > 8 || day < damage.fromDay) return;
  const riskById = new Map(damage.risk.map((r) => [r.partId, r]));
  const crops = cerealCrops(state).filter(({ work }) => work.harvestedKg === null);
  if (crops.length === 0) return;
  const byId = new Map(state.parts.map((p) => [p.id, p]));
  const open: { id: number; crop: DamageCrop; weightHa: number; grossKg: number }[] = [];
  for (const { crop, work } of crops) {
    const harvested = harvestedPartIds(work, byId, day);
    for (const id of work.partIds) {
      const risk = riskById.get(id);
      const part = byId.get(id);
      if (!risk || !part || harvested.has(id)) continue;
      open.push({ id, crop, weightHa: risk.weightHa, grossKg: grossKgOf(part, crop, day) });
    }
  }
  if (open.length === 0) return;
  const totalHa = damage.risk.reduce((sum, r) => sum + r.weightHa, 0);
  const eatenKg = wildlifeEatsKgPerDay(w) * Math.min(1, totalHa / FIELD_DAMAGE.fullAreaHa);
  const openHa = open.reduce((sum, o) => sum + o.weightHa, 0);
  let top = damage.topPartId === null ? -1 : (damage.parts[damage.topPartId]?.kg ?? -1);
  for (const o of open) {
    if (o.grossKg <= 0) continue;
    const eaten = openHa > 0 ? (eatenKg * o.weightHa) / openHa : 0;
    const crows = FIELD_DAMAGE.crowShare / FIELD_DAMAGE.windowDays[o.crop];
    const before = damage.parts[o.id] ?? { share: 0, kg: 0 };
    const share = Math.min(FIELD_DAMAGE.maxShare, before.share + eaten / o.grossKg + crows);
    if (share <= before.share + EPSILON) continue;
    const kg = share * o.grossKg;
    damage.totalKg += kg - before.kg;
    damage.parts[o.id] = { share, kg };
    if (kg > top) {
      top = kg;
      damage.topPartId = o.id;
    }
  }
}

function grossKgOf(part: FieldPart, crop: Crop, day: number): number {
  return (part.areaM2 / M2_PER_HA) * cropGrossPerHa(crop, effectiveFertility(part, day));
}

/**
 * 31. 8. po sklizni: kronika „Zvěř zničila … kg obilí“ (jen když > 0). Ztráty dílů se zahodí
 * (`risk`, `parts`), ať nezkreslí výhled další sezóny; `totalKg` zůstává do 1. 6.
 */
export function wildlifeSeasonEnd(state: VillageState, day: number): void {
  const damage = state.wildlife?.damage;
  if (!damage) return;
  const kg = Math.round(damage.totalKg);
  if (kg > 0) state.chronicle.push({ day, kind: 'wildlife-damage', kg });
  damage.risk = [];
  damage.parts = {};
  damage.topPartId = null;
}
