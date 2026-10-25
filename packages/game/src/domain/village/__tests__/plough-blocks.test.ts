import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { fieldPartLooks, partsWorked, taskSpans } from '../field-progress';
import { bandLengthM, furrowAxis, furrowEfficiency, ploughLayout } from '../plough-blocks';
import {
  ploughDayFactor,
  ploughTeamsAfield,
  plannedFurrowEfficiency,
  settlePloughTeams,
  travelShare,
  type PloughTravels,
} from '../plough-trip';
import { FURROW, TEAM_TRAVEL } from '../rules';
import { advanceVillage } from '../simulate';
import type { DayTask } from '../simulate-plan';
import { dayTaskOrder } from '../simulate-work';
import type { FieldPart, VillageState } from '../types';
import { createCropWork, seasonCrop, springCrop } from '../year-plan';
import { withBuiltFirstDwelling } from './village-fixtures';

// Co nejdelší brázda (oxen.md; Martin, 19. 10. 2026: „Volské spřežení chce rýt co nejdelší
// brázdu – otáčení zabírá čas a snižuje produktivitu.“ a „… snaží se zorat co největší souvislou
// plochu.“).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 9, 1);

/** Díl pole na čtverci (x, y) – vzdálenost od obydlí roste s y (obydlí je pod polem). */
function part(id: number, x: number, y: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 225,
    distanceM: 60 + 15 * y,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'sown',
    sownYears: 1,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
    cell: { x, y },
    ...over,
  };
}

/** Obdélník w × h čtverců od (x0, y0); id od `first`. */
function rect(
  first: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  fieldId = 1,
): FieldPart[] {
  const parts: FieldPart[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) parts.push(part(first + y * w + x, x0 + x, y0 + y, { fieldId }));
  return parts;
}

describe('výkon podle délky brázdy', () => {
  it('krátká brázda víc obratů – jeden díl ≈ 0,44, referenční 1, dlouhá nejvýš +15 %', () => {
    const turnM = FURROW.speedMps * FURROW.turnS;
    expect(furrowEfficiency(FURROW.referenceM)).toBeCloseTo(1, 12);
    expect(furrowEfficiency(15)).toBeCloseTo(
      15 / (15 + turnM) / (FURROW.referenceM / (FURROW.referenceM + turnM)),
      12,
    );
    expect(furrowEfficiency(15)).toBeLessThan(0.5);
    expect(furrowEfficiency(45)).toBeGreaterThan(furrowEfficiency(30));
    expect(furrowEfficiency(1000)).toBe(FURROW.maxGain);
  });

  it('cesta k bloku ubírá den – po cestě 1 km pár procent, nejvýš polovinu', () => {
    expect(travelShare(0)).toBe(1);
    expect(travelShare(1000)).toBeCloseTo(1 - 1000 / TEAM_TRAVEL.speedMps / TEAM_TRAVEL.dayS, 12);
    expect(travelShare(1000)).toBeGreaterThan(0.9);
    expect(travelShare(1e6)).toBe(1 - TEAM_TRAVEL.maxShare);
  });
});

describe('bloky a pásy orby', () => {
  it('pole se orá podél delší strany – pás přes celou řadu dílů, od strany blíž vsi', () => {
    const parts = rect(1, 0, 0, 6, 2);
    expect(furrowAxis(parts)).toBe('x');
    const { order, bands } = ploughLayout(parts);
    expect(bands.map((b) => b.partIds)).toEqual([
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12],
    ]);
    expect(bands.every((b) => b.axis === 'x' && b.sweep === 1 && b.block === 0)).toBe(true);
    expect(order.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const byId = new Map(parts.map((p) => [p.id, p]));
    expect(bandLengthM(bands[0]!, byId)).toBeCloseTo(90, 9);
    // vyšší než širší – podél y; ves u pravého sloupce – pásy od něj
    const tall = rect(1, 0, 0, 2, 5).map((p) => ({ ...p, distanceM: 60 + 15 * (1 - p.cell!.x) }));
    const layout = ploughLayout(tall);
    expect(layout.bands[0]!.axis).toBe('y');
    expect(layout.bands[0]!.sweep).toBe(-1);
    expect(layout.bands[0]!.partIds).toEqual([2, 4, 6, 8, 10]);
  });

  it('bloky od nejbližšího; blok se zorá celý, než spřežení přejde jinam (U – rameno po rameni)', () => {
    // dva bloky jednoho pole: vzdálenější vlevo (x 0–2, y 4–5), bližší vpravo (x 5–7, y 0–1)
    const far = rect(100, 0, 4, 3, 2);
    const near = rect(200, 5, 0, 3, 2);
    const field = [...far, ...near];
    const { bands } = ploughLayout(field);
    expect(bands.map((b) => b.block)).toEqual([0, 0, 1, 1]);
    expect(bands[0]!.partIds[0]).toBe(200);
    // U: dno y = 0–1 (x 0–4), ramena x 0 a x 4 (y 2–3) – brázdy podél x delší
    const u = [
      ...rect(1, 0, 0, 5, 2),
      ...[2, 3].flatMap((y) => [part(10 + y, 0, y), part(20 + y, 4, y)]),
    ];
    const layout = ploughLayout(u);
    expect(layout.bands.every((b) => b.axis === 'x')).toBe(true);
    expect(layout.bands.map((b) => b.partIds)).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [12],
      [13],
      [22],
      [23],
    ]);
  });

  it('osa podle bloku – co nejdelší brázda, i sever – jih v širokém poli', () => {
    // Martin (19. 10. 2026): „oře jen v ose východ – západ, i když u spousty polí by byla
    // výhodnější sever – jih“ – pole protáhlé sever – jih (mřížka y = sever – jih)
    const tall = rect(1, 0, 0, 3, 8);
    expect(furrowAxis(tall)).toBe('y');
    const { bands } = ploughLayout(tall);
    expect(bands.every((b) => b.axis === 'y')).toBe(true);
    expect(bands.map((b) => b.partIds.length)).toEqual([8, 8, 8]);
    // blok plodiny v poli širším než vyšším (pole 8 × 3 + pruh 2 × 6 sever – jih): osa bloku,
    // ne celého pole
    const strip = rect(100, 0, 3, 2, 6);
    expect(ploughLayout(strip).bands.every((b) => b.axis === 'y')).toBe(true);
    // čtvercové pole (Vlkov 49 × 49): rozhodne délka brázd, ne rozloha – bez děr je shoda podél x
    expect(furrowAxis(rect(1, 0, 0, 4, 4))).toBe('x');
    // čtverec s výřezem v řadách: řady podél x přerušené, sloupce celé → sever – jih
    const notched = rect(1, 0, 0, 5, 5).filter((p) => !(p.cell!.x === 2 && p.cell!.y % 2 === 1));
    expect(furrowAxis(notched)).toBe('y');
    // blok tvaru L se dvěma rameny – osa podle průměrné délky brázd (vážené plochou)
    const l = [...rect(1, 0, 0, 2, 6), ...rect(50, 2, 0, 2, 2)];
    expect(furrowAxis(l)).toBe('y');
  });

  it('díly pásu postupují spolu – stejná rozpracovanost, dnešní práce se dělí podle ploch', () => {
    const parts = rect(1, 0, 0, 4, 2);
    const byId = new Map(parts.map((p) => [p.id, p]));
    const work = createCropWork(parts, DAY, 0, true, undefined, 'spring');
    work.plough!.done = work.plough!.required * 0.25; // půlka prvního pásu
    const spans = taskSpans(work, byId, 'plough', DAY);
    expect(new Set(spans.slice(0, 4).map((s) => `${s.start}-${s.end}`)).size).toBe(1);
    expect(spans[0]!.share).toBeCloseTo(0.25, 9);
    const worked = partsWorked(work, byId, 'plough', DAY, 0, work.plough!.done);
    expect(worked.map((w) => w.id)).toEqual([1, 2, 3, 4]);
    expect(worked.reduce((sum, w) => sum + w.share, 0)).toBeCloseTo(1, 9);
    for (const w of worked) expect(w.to).toBeCloseTo(0.5, 9);
    // setí jde za orbou po stejných pásech
    expect(taskSpans(work, byId, 'sow', DAY)[3]!.end).toBeCloseTo(0.5, 9);
  });
});

describe('výkon spřežení za den', () => {
  function village(parts: FieldPart[], today = DAY): VillageState {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: today - 10, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.lastDay = today - 1;
    s.fields = [{ id: 1 }, { id: 2 }];
    s.parts = parts;
    s.storesKg = 300;
    s.pens = [
      {
        id: 900,
        cell: { x: 30, y: 30 },
        x: 50,
        z: 60,
        builtDay: DAY - 800,
        team: { readyDay: DAY - 10 },
        training: null,
      },
    ];
    s.hay = { kg: 20_000, mowing: null };
    return s;
  }

  it('dlouhé brázdy zorají za den víc než stejná plocha po jednotlivých dílech', () => {
    const long = rect(1, 0, 0, 8, 2);
    const scattered = Array.from({ length: 16 }, (_, i) =>
      part(1 + i, (i % 4) * 2, Math.floor(i / 4) * 2),
    );
    const factor = (parts: FieldPart[]): number => {
      const s = village(parts);
      const byId = new Map(parts.map((p) => [p.id, p]));
      const work = createCropWork(parts, DAY, 0, true, undefined, 'spring');
      return ploughDayFactor(s, DAY, work, byId, null, null);
    };
    expect(factor(long) / factor(scattered)).toBeCloseTo(
      furrowEfficiency(120) / furrowEfficiency(15),
      9,
    );
    expect(factor(long)).toBeGreaterThan(2 * factor(scattered));
    // ves s dlouhým polem orá: plán orby jde po pásech a zorané díly pásu postupují spolu
    const s = advanceVillage(village(long), DAY + 3, null);
    const plan = s.season!;
    const crop = seasonCrop(plan, 'winter') ?? springCrop(plan);
    expect(crop.plough!.bands!.length).toBeGreaterThan(0);
    const looks = fieldPartLooks(s, s.lastDay);
    const band = crop.plough!.bands![0]!;
    const works = band.partIds.map((id) => looks.get(id)?.work ?? null);
    expect(new Set(works).size).toBe(1);
  });

  it('spřežení vyjede z ohrady jednou, na poli zůstane a cestu platí jen při výjezdu a přesunu', () => {
    const parts = [
      ...rect(1, 0, 0, 4, 1),
      ...rect(50, 10, 0, 4, 1).map((p) => ({ ...p, distanceM: 600 })),
    ];
    const s = village(parts);
    const byId = new Map(parts.map((p) => [p.id, p]));
    const work = createCropWork(parts, DAY, 0, true, undefined, 'spring');
    s.season = { startDay: DAY, ard: true, crops: [{ crop: 'spring', ...work }] };
    const plough = springCrop(s.season).plough!;
    // výjezd z ohrady – cesta jen tam (bez krajiny chůze k dílu), stav se ráno nemění
    const travels: PloughTravels = new Map();
    const first = ploughDayFactor(s, DAY, springCrop(s.season), byId, null, null, travels);
    expect(first).toBeCloseTo(furrowEfficiency(60) * travelShare(60), 12);
    expect(plough.trip).toBeUndefined();
    // druhé volání téhož dne vrátí totéž
    expect(ploughDayFactor(s, DAY, springCrop(s.season), byId, null, null, travels)).toBe(first);
    // den bez orby – spřežení nevyjede
    settlePloughTeams(s, DAY, travels, false);
    expect(plough.trip).toBeUndefined();
    // den s orbou – večer je u bloku
    plough.done = plough.required * 0.1;
    settlePloughTeams(s, DAY, travels, false);
    expect(plough.trip).toEqual({ block: 0, costM: 60, arrived: { day: DAY, from: null } });
    // další den na poli – žádná cesta
    const stay: PloughTravels = new Map();
    expect(ploughDayFactor(s, DAY + 1, springCrop(s.season), byId, null, null, stay)).toBeCloseTo(
      furrowEfficiency(60),
      12,
    );
    plough.done = plough.required * 0.2;
    settlePloughTeams(s, DAY + 1, stay, false);
    expect(plough.trip!.arrived).toEqual({ day: DAY, from: null });
    // přesun k dalšímu bloku – cesta od bloku k bloku (bez krajiny rozdíl vzdáleností od vsi)
    plough.done = plough.required * 0.75;
    const move: PloughTravels = new Map();
    const moved = ploughDayFactor(s, DAY + 2, springCrop(s.season), byId, null, null, move);
    expect(moved).toBeCloseTo(furrowEfficiency(60) * travelShare(540), 12);
    plough.done = plough.required * 0.8;
    settlePloughTeams(s, DAY + 2, move, false);
    expect(plough.trip).toEqual({ block: 1, costM: 540, arrived: { day: DAY + 2, from: 0 } });
    expect(ploughTeamsAfield(s)).toBe(true);
    // zoráno vše potřebné – večer zpět do ohrady, další den je doma
    plough.done = plough.required;
    settlePloughTeams(s, DAY + 3, new Map(), false);
    expect(plough.trip!.home).toBe(DAY + 3);
    expect(ploughTeamsAfield(s)).toBe(false);
  });

  it('spřežení se vrátí, když okno orby končí nebo ves spřežení ztratí', () => {
    const parts = rect(1, 0, 0, 4, 1);
    const s = village(parts);
    const work = createCropWork(parts, DAY, 0, true, undefined, 'spring');
    s.season = { startDay: DAY, ard: true, crops: [{ crop: 'spring', ...work }] };
    const plough = springCrop(s.season).plough!;
    plough.trip = { block: 0, costM: 60 };
    // starší ves – spřežení u bloku (bez příjezdu), je na poli
    expect(ploughTeamsAfield(s)).toBe(true);
    settlePloughTeams(s, DAY, new Map(), true);
    expect(plough.trip.home).toBe(DAY);
    plough.trip = { block: 0, costM: 60 };
    // poslední den okna jaře na podzim (30. 11.)
    const last = at(600, 11, 30);
    settlePloughTeams(s, last - 1, new Map(), false);
    expect(plough.trip.home).toBeUndefined();
    settlePloughTeams(s, last, new Map(), false);
    expect(plough.trip.home).toBe(last);
  });

  it('ves orá: spřežení vyjede první den orby, zůstane na poli; dopočet najednou = po kouscích', () => {
    const s = village(rect(1, 0, 0, 8, 2));
    const whole = advanceVillage(s, DAY + 6, null);
    const crop = seasonCrop(whole.season!, 'winter') ?? springCrop(whole.season!);
    expect(crop.plough!.done).toBeGreaterThan(0);
    expect(crop.plough!.trip!.arrived).toEqual({ day: DAY, from: null });
    let pieces = s;
    for (const to of [DAY + 1, DAY + 2, DAY + 4, DAY + 6])
      pieces = advanceVillage(pieces, to, null);
    expect(pieces).toEqual(whole);
  });

  it('orba má přednost před výmlatem s dřívějším koncem okna (Martin, 24. 10. 2026)', () => {
    const ploughed = (threshing: boolean): { plough: number; thresh: number } => {
      const s = village(rect(1, 0, 0, 8, 2));
      // hotové díly na řadě s prvním osevem – 1. 9. přibudou k ozimu (fields.md – Osevní postup
      // po dílech); díly po dvou osevech by šly do úhoru
      for (const p of s.parts) Object.assign(p, { state: 'ready', sownYears: 0 });
      if (threshing) s.sheaves = { grainKg: 20_000, legumesKg: 0, work: { spring: 200 } };
      const next = advanceVillage(s, DAY, null);
      const sum = (activity: string): number =>
        (next.labor?.shares ?? [])
          .filter((x) => x.activity === activity)
          .reduce((t, x) => t + x.manDays, 0);
      return { plough: sum('plough'), thresh: sum('thresh') };
    };
    const busy = ploughed(true);
    expect(busy.thresh).toBeGreaterThan(0);
    expect(busy.plough).toBeGreaterThan(0);
    expect(busy.plough).toBeCloseTo(ploughed(false).plough, 9);
  });

  it('v dubnu dostane orba práci první a osev zbytek – osev se nezastaví (Martin, 24. 10. 2026)', () => {
    const april = at(601, 4, 10);
    const parts = rect(1, 0, 0, 8, 2);
    const s = village(parts, april);
    const work = createCropWork(parts, april, 0, true, undefined, 'spring');
    s.season = { startDay: april - 20, ard: true, crops: [{ crop: 'spring', ...work }] };
    springCrop(s.season).plough!.done = springCrop(s.season).plough!.required * 0.3;
    // víc rukou, ať mají osev i orba z čeho brát
    const adult = s.people.find((p) => p.bornDay < april - 18 * 365)!;
    for (let i = 0; i < 12; i++)
      s.people.push({ ...adult, id: 500 + i, spouseId: undefined, sex: i % 2 ? 'male' : 'female' });
    const next = advanceVillage(s, april, null);
    const sum = (activity: string): number =>
      (next.labor?.shares ?? [])
        .filter((x) => x.activity === activity)
        .reduce((t, x) => t + x.manDays, 0);
    expect(sum('plough')).toBeGreaterThan(0);
    expect(sum('sow')).toBeGreaterThan(0);
  });

  it('v září dostanou jablka (dřívější konec okna) zbytek po orbě – pořadí úloh dne', () => {
    const task = (name: DayTask['name'], end: number): DayTask => ({
      name,
      remaining: 1,
      end,
      tie: 0,
      rank: 0,
    });
    const sorted = [task('orchard-harvest', 1), task('thresh', 2), task('plough', 9)].sort(
      dayTaskOrder,
    );
    expect(sorted.map((t) => t.name)).toEqual(['plough', 'orchard-harvest', 'thresh']);
  });

  it('starší spřežení bez příjezdu mimo okno orby není na poli (vozy ani voda se neruší)', () => {
    const parts = rect(1, 0, 0, 4, 1);
    const s = village(parts);
    const work = createCropWork(parts, DAY, 0, true, undefined, 'spring');
    s.season = { startDay: DAY, ard: true, crops: [{ crop: 'spring', ...work }] };
    springCrop(s.season).plough!.trip = { block: 0, costM: 60 };
    expect(ploughTeamsAfield(s, DAY)).toBe(true);
    expect(ploughTeamsAfield(s, at(601, 1, 15))).toBe(false);
    // s příjezdem je na poli, dokud se večer nevrátí domů
    springCrop(s.season).plough!.trip = { block: 0, costM: 60, arrived: { day: DAY, from: null } };
    expect(ploughTeamsAfield(s, at(601, 1, 15))).toBe(true);
  });

  it('plán osevu počítá s výkonem podle tvaru polí', () => {
    expect(plannedFurrowEfficiency(rect(1, 0, 0, 8, 2))).toBeCloseTo(furrowEfficiency(120), 12);
    const single = [part(1, 0, 0), part(2, 5, 5)];
    expect(plannedFurrowEfficiency(single)).toBeCloseTo(furrowEfficiency(15), 12);
  });
});

describe('zoraná zem jen kam došla orba (Martin, 19. 10. 2026)', () => {
  it('setí za orbou po stejných úsecích i s drnem – nikdy před pluhem; klučení zem nezorá', () => {
    // dva pásy: první bez drnu, druhý drn (orba ×2,5) a křoviny na posledním dílu
    const parts = [
      ...rect(1, 0, 0, 4, 1),
      ...rect(11, 0, 1, 4, 1).map((p) => ({ ...p, sod: true as const })),
    ];
    parts[7] = {
      ...parts[7]!,
      sod: undefined,
      state: 'fallow',
      fallowSinceDay: at(590, 9, 1),
      overgrowthYears: 6,
    };
    const byId = new Map(parts.map((p) => [p.id, p]));
    const work = createCropWork(parts, DAY, 0, true, undefined, 'spring');
    const ploughSpans = taskSpans(work, byId, 'plough', DAY);
    const sowSpans = taskSpans(work, byId, 'sow', DAY);
    for (const [k, span] of ploughSpans.entries()) {
      expect(sowSpans[k]!.start).toBeCloseTo(span.start, 12);
      expect(sowSpans[k]!.end).toBeCloseTo(span.end, 12);
    }
    // vrácení křovin (lidé) hotové, orba nezačala: díl není zoraný
    const s = {
      parts,
      plan: { startDay: DAY, ard: true as const, ...work },
    } as unknown as VillageState;
    for (const p of parts) p.state = 'sown';
    work.done.reclaim = work.required.reclaim;
    const looks = fieldPartLooks({ ...s, threshingSeason: null } as VillageState, DAY + 1);
    for (const p of parts) expect(looks.get(p.id)!.look).not.toBe('plowed');
  });
});
