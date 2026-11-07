// Škody zvěře na polích (wildlife.md – Škody, Prasata a jeleni na polích): od 1. 6. do sklizně dílu
// prasata a jelení zvěř ubírají úrodu dílů u lesa, vrány 2 % osetých dílů. Bez náhody.

import { dateOfDayIndex } from '../calendar';
import type { Landscape } from '../landscape';
import { effectiveFertility } from './fields';
import { taskPosition, taskSpans } from './field-progress';
import { patrolOfDay } from './field-patrol';
import { lordTraineeIds } from './lord';
import { ageGroup } from './people';
import { isYoungster } from './herding';
import { FIELD_DAMAGE, FIELD_GUARD } from './rules-wildlife';
import type {
  Crop,
  CropWork,
  FieldDamage,
  FieldPart,
  FieldWatch,
  VillageState,
  WildlifeState,
} from './types';
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
  // ves s `wildlifeFailed` krajinu nepřepočítává (jako bez krajiny)
  const distances =
    landscape && state.wildlifeFailed === undefined ? forestEdgeDistances(landscape, state) : null;
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
  planWatch(state, w, day);
}

/**
 * 1. 6. (hned po `damageWindowStart`): plán noční hlídky (wildlife.md – Noční hlídka vesničanů).
 * Hrozba dílu za sezónu = denní hrozba (`dailyThreatShare` bez jezdecké hlídky – ta kolísá ode
 * dne ke dni podle koní, hladu a výprav, plán ji konzervativně nepočítá) × délka okna plodiny, nejvýš `maxShare`. Hlídají se díly s hrozbou aspoň 10 % úrody, největší napřed;
 * 1. stupeň – staří a výrostci mimo dvorec, 1 hlídač na 5 ha; kde po něm hrozba stále dosahuje
 * 10 %, přidají se dospělí z práce vsi (úloha `'watch'`). Ves hlídá sama, hráč nic nezadává.
 */
function planWatch(state: VillageState, w: WildlifeState, day: number): void {
  delete w.watch;
  const damage = w.damage;
  if (!damage || damage.risk.length === 0) return;
  const { threat: minThreat, haPerGuard, effect } = FIELD_GUARD.night;
  const daily = dailyThreatShare(state, day, false);
  const cropOf = new Map<number, DamageCrop>();
  for (const { crop, work } of cerealCrops(state))
    for (const id of work.partIds) cropOf.set(id, crop);
  const byId = new Map(state.parts.map((p) => [p.id, p]));
  const candidates: FieldWatch['parts'] = [];
  for (const risk of damage.risk) {
    const crop = cropOf.get(risk.partId);
    const part = byId.get(risk.partId);
    const share = daily.get(risk.partId);
    if (!crop || !part || share === undefined) continue;
    const threat = Math.min(FIELD_DAMAGE.maxShare, share * FIELD_DAMAGE.windowDays[crop]);
    if (threat + EPSILON < minThreat) continue;
    candidates.push({
      partId: risk.partId,
      ha: part.areaM2 / M2_PER_HA,
      threat,
      free: 0,
      adult: false,
    });
  }
  if (candidates.length === 0) return;
  candidates.sort((a, b) => b.threat - a.threat || a.partId - b.partId);
  const guards = nightGuards(state, day);
  let haLeft = (guards.elders + guards.youngsters) * haPerGuard;
  for (const c of candidates) {
    c.free = c.ha > EPSILON ? Math.min(1, haLeft / c.ha) : 1;
    haLeft = Math.max(0, haLeft - c.free * c.ha);
    c.adult = c.threat * (1 - effect * c.free) + EPSILON >= minThreat;
  }
  w.watch = { fromDay: day, parts: candidates, guards, wantedManDays: 0, paidManDays: 0 };
}

/** Hlídači 1. stupně: staří a výrostci 7–13 let mimo cvičící rodinu dvorce (ta pasení ani hlídání nedělá). */
function nightGuards(state: VillageState, day: number): FieldWatch['guards'] {
  const family = lordTraineeIds(state, day);
  let elders = 0;
  let youngsters = 0;
  for (const p of state.people) {
    if (family.has(p.id)) continue;
    if (isYoungster(p, day)) youngsters += 1;
    else if (ageGroup(p, day) === 'elder') elders += 1;
  }
  return { elders, youngsters };
}

/** Pokrytí dílu hlídkou dnes (0–1): 1. stupeň + dospělí podle toho, kolik práce ves dnes dala. */
function watchCover(watch: FieldWatch | undefined, partId: number, day: number): number {
  if (!watch) return 0;
  const part = watch.parts.find((p) => p.partId === partId);
  if (!part) return 0;
  const adults = part.adult && watch.adultDay === day ? (watch.adultFrac ?? 0) : 0;
  return Math.min(1, part.free + (1 - part.free) * adults);
}

/**
 * Práce dospělých na dnešní noční hlídku (člověkodny, před štěstím): dosud nesklizené díly, které
 * 1. stupeň nepokryl, 1 hlídač na 5 ha × 0,3 čd za noc. Mimo okno a bez plánu 0.
 */
export function watchWanted(state: VillageState, day: number): number {
  const watch = state.wildlife?.watch;
  if (!watch || !watch.parts.some((p) => p.adult)) return 0;
  const month = dateOfDayIndex(day).month;
  const { fromMonth, toMonth } = FIELD_GUARD.night;
  if (month < fromMonth || month > toMonth || day < watch.fromDay) return 0;
  const byId = new Map(state.parts.map((p) => [p.id, p]));
  const harvested = new Set<number>();
  for (const { work } of cerealCrops(state)) {
    if (work.harvestedKg !== null) for (const id of work.partIds) harvested.add(id);
    else for (const id of harvestedPartIds(work, byId, day)) harvested.add(id);
  }
  const { haPerGuard, adultManDays } = FIELD_GUARD.night;
  let ha = 0;
  for (const p of watch.parts) if (p.adult && !harvested.has(p.partId)) ha += p.ha * (1 - p.free);
  return (ha / haPerGuard) * adultManDays;
}

/** Zapíše, kolik z chtěné práce noční hlídky ves dnes dala (pokrytí dospělými dnes). */
export function payWatch(state: VillageState, day: number, wanted: number, paid: number): void {
  const watch = state.wildlife?.watch;
  if (!watch || wanted <= EPSILON) return;
  const frac = Math.min(1, Math.max(0, paid / wanted));
  watch.adultDay = day;
  watch.adultFrac = frac;
  watch.wantedManDays += wanted;
  watch.paidManDays += Math.min(wanted, paid);
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
 * Denní hrozba dílů (wildlife.md – Škody): podíl hrubé úrody, který dnes zvěř a vrány ubírají
 * každému dosud nesklizenému osetému dílu (před stropem `maxShare`). Kg zvěře podle kusů se
 * vynásobí `min(1; Σ plocha × váha ÷ 10 ha)` počítanou jen z dosud nesklizených dílů (malá ves
 * u lesa; Martin 26. 10. 2026) a rozdělí podle plochy × váhy. Vrány berou `crowShare ÷ délka
 * okna plodiny`. Čistá funkce bez zápisu do stavu; obrana polí (jezdecká a noční hlídka) je zde na jednom místě.
 * Mimo okno (1. 6. – 31. 8.) nebo bez rizika prázdná mapa.
 */
export function dailyThreatShare(
  state: VillageState,
  day: number,
  withRiders = true,
): Map<number, number> {
  const shares = new Map<number, number>();
  const w = state.wildlife;
  const damage = w?.damage;
  if (!w || !damage || damage.risk.length === 0) return shares;
  const date = dateOfDayIndex(day);
  if (
    date.month < FIELD_DAMAGE.windowMonths.from ||
    date.month > FIELD_DAMAGE.windowMonths.to ||
    day < damage.fromDay
  )
    return shares;
  const riskById = new Map(damage.risk.map((r) => [r.partId, r]));
  const crops = cerealCrops(state).filter(({ work }) => work.harvestedKg === null);
  if (crops.length === 0) return shares;
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
  if (open.length === 0) return shares;
  const openHa = open.reduce((sum, o) => sum + o.weightHa, 0);
  const eatenKg = wildlifeEatsKgPerDay(w) * Math.min(1, openHa / FIELD_DAMAGE.fullAreaHa);
  // obrana polí: jezdecká hlídka snižuje vše, noční zvěř o 60 % a vrány celé na hlídaném dílu
  const riders = withRiders ? 1 - patrolOfDay(state, day).cut : 1;
  for (const o of open) {
    if (o.grossKg <= 0) continue;
    const eaten = openHa > 0 ? (eatenKg * o.weightHa) / openHa : 0;
    const crows = FIELD_DAMAGE.crowShare / FIELD_DAMAGE.windowDays[o.crop];
    const cover = watchCover(w.watch, o.id, day);
    shares.set(
      o.id,
      ((eaten / o.grossKg) * (1 - FIELD_GUARD.night.effect * cover) + crows * (1 - cover)) * riders,
    );
  }
  return shares;
}

/**
 * Škoda dne (po práci dne, před jídlem): k podílu škody dílu se přičte `dailyThreatShare`
 * (celkem nejvýš `maxShare`, zbytek zvěř spásla v lese). Sklizené díly neztrácejí.
 */
export function wildlifeDamageDay(state: VillageState, day: number): void {
  const damage = state.wildlife?.damage;
  if (!damage) return;
  const threat = dailyThreatShare(state, day);
  if (threat.size === 0) return;
  const byId = new Map(state.parts.map((p) => [p.id, p]));
  const cropOf = new Map<number, DamageCrop>();
  for (const { crop, work } of cerealCrops(state)) {
    for (const id of work.partIds) cropOf.set(id, crop);
  }
  let top = damage.topPartId === null ? -1 : (damage.parts[damage.topPartId]?.kg ?? -1);
  for (const [id, daily] of threat) {
    const part = byId.get(id);
    const crop = cropOf.get(id);
    if (!part || !crop) continue;
    const grossKg = grossKgOf(part, crop, day);
    const before = damage.parts[id] ?? { share: 0, kg: 0 };
    const share = Math.min(FIELD_DAMAGE.maxShare, before.share + daily);
    if (share <= before.share + EPSILON) continue;
    const kg = share * grossKg;
    damage.totalKg += kg - before.kg;
    damage.parts[id] = { share, kg };
    if (kg > top) {
      top = kg;
      damage.topPartId = id;
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
  delete state.wildlife?.watch;
  damage.risk = [];
  damage.parts = {};
  damage.topPartId = null;
}
