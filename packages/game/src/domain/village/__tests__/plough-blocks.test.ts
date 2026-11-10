import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { fieldPartLooks, partsWorked, taskSpans } from '../field-progress';
import {
  bandLengthM,
  bandPartWeight,
  furrowAxis,
  furrowEfficiency,
  ploughBandFinder,
  ploughLayout,
} from '../plough-blocks';
import {
  ploughDayFactor,
  ploughTeamsAfield,
  plannedFurrowEfficiency,
  relayUntouchedBands,
  settlePloughTeams,
  travelShare,
  type PloughTravels,
} from '../plough-trip';
import { FURROW, TEAM_TRAVEL } from '../rules';
import { advanceVillage } from '../simulate';
import type { DayTask } from '../simulate-plan';
import { dayTaskOrder } from '../simulate-work';
import type { CropWork, FieldPart, VillageState } from '../types';
import { addToCropWork, createCropWork, seasonCrop, seasonCrops, springCrop } from '../year-plan';
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

describe('rozvržení nezačatých pásů', () => {
  it('trip.block po relay uprostřed bloku – zbytek bloku s rozpracovaným pásem drží číslo', () => {
    // jeden blok 4 × 3 čtverce: pás 0 se začne orat, přibude dávka u téhož bloku
    const work = createCropWork(rect(1, 0, 0, 4, 3), DAY, 0, true, undefined, 'winter');
    const bands = work.plough!.bands!;
    expect(bands.length).toBeGreaterThan(1);
    expect(new Set(bands.map((b) => b.block)).size).toBe(1);
    const block = bands[0]!.block;
    // rozpracovaný první pás
    work.plough!.done = work.plough!.required * 0.05;
    addToCropWork(work, rect(100, 0, 3, 4, 2), DAY, 0, undefined, 'winter');
    const partsById = new Map(
      [...rect(1, 0, 0, 4, 3), ...rect(100, 0, 3, 4, 2)].map((p) => [p.id, p]),
    );
    relayUntouchedBands(work, partsById, DAY);
    // zbytek téhož bloku i s dávkou se spojil a drží číslo bloku, na kterém spřežení stojí
    expect(work.plough!.bands!.every((b) => b.block === block)).toBe(true);
  });
});

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

  it('zoráno, ale díly plodiny čekají na čelo – spřežení zůstane na poli (Martin, 24. 10. 2026)', () => {
    const parts = rect(1, 0, 0, 4, 1);
    const s = village(parts);
    const work = createCropWork(parts, DAY, 0, true, undefined, 'spring');
    work.plough!.done = work.plough!.required;
    s.season = { startDay: DAY, ard: true, crops: [{ crop: 'spring', ...work }] };
    const plough = springCrop(s.season).plough!;
    plough.trip = { block: 0, costM: 60, arrived: { day: DAY - 3, from: null } };
    settlePloughTeams(s, DAY, new Map(), false, new Set(['spring']));
    expect(plough.trip.home).toBeUndefined();
    // čeká jen ozim – jař má zoráno a jde domů
    settlePloughTeams(s, DAY + 1, new Map(), false, new Set(['winter']));
    expect(plough.trip.home).toBe(DAY + 1);
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
      // snopů málo – ves dál potřebuje osev obilí (dřív při 20 t orala luštěniny – ty už ne)
      if (threshing) s.sheaves = { grainKg: 100, legumesKg: 0, work: { spring: 200 } };
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
    // výmlat dělá ze dne žňový den – poloviční minimum nechá orbě víc (population.md – Skladba dne
    // podle ročního období), nikdy méně
    expect(busy.plough).toBeGreaterThanOrEqual(ploughed(false).plough - 1e-9);
  });

  it('v dubnu dostane orba práci první a osev zbytek – osev se nezastaví (Martin, 24. 10. 2026)', () => {
    const april = at(601, 4, 10);
    const parts = rect(1, 0, 0, 8, 2);
    const s = village(parts, april);
    // osivo ze zásob při setí (fields.md – Úroda, Osivo ze zásob)
    s.storesKg += 1500;
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

  it('v září jablka před orbou, výmlat za ní – pořadí důležitosti prací dne (fields.md)', () => {
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
    expect(sorted.map((t) => t.name)).toEqual(['orchard-harvest', 'plough', 'thresh']);
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

describe('orba po dávkách dílů (fields.md – Osevní postup po dílech; oxen.md – Co nejdelší brázda)', () => {
  /** Ves se třemi páry a polem 24 × 16 hotových dílů na řadě, bez zásob – díly přibývají po dávkách. */
  function village(): VillageState {
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 11, day: DAY - 10, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    s.lastDay = DAY - 1;
    s.fields = [{ id: 1 }];
    s.parts = rect(1, 0, 0, 24, 16).map((p) => ({ ...p, state: 'ready' as const, sownYears: 0 }));
    s.storesKg = 0;
    s.meatKg = 300;
    s.pens = [1, 2, 3].map((i) => ({
      id: 900 + i,
      cell: { x: 30 + i, y: 30 },
      x: 50 + 10 * i,
      z: 60,
      builtDay: DAY - 800,
      team: { readyDay: DAY - 10 },
      training: null,
    }));
    s.hay = { kg: 50_000, mowing: null };
    return s;
  }

  /** Výkon podle délky brázdy pásů plodiny (vážený dílem) proti rozvržení všech jejích dílů najednou. */
  function furrows(s: VillageState, work: CropWork): { season: number; whole: number } {
    const byId = new Map(s.parts.map((p) => [p.id, p]));
    let weight = 0;
    let sum = 0;
    for (const band of work.plough!.bands!) {
      const w = band.partIds.reduce((a, id) => a + bandPartWeight(byId.get(id)!), 0);
      weight += w;
      sum += w * furrowEfficiency(bandLengthM(band, byId));
    }
    const whole = plannedFurrowEfficiency(work.partIds.map((id) => byId.get(id)!));
    return { season: sum / weight, whole };
  }

  it('díly přibývající po dávkách orá spřežení v pásech – brázda jako najednou', () => {
    // dřív dávka dne s vlastními bloky: ozim k 31. 10. jen 0,60 výkonu proti 1,02 najednou – teď
    // díl přibude s celým pásem výběru
    const first = advanceVillage(village(), at(600, 9, 2), null);
    const october = advanceVillage(first, at(600, 10, 31), null);
    const april = advanceVillage(october, at(601, 4, 30), null);
    // dávky po pásech i nové rozvržení nezačatých pásů nezávisí na kouscích dopočtu
    expect(advanceVillage(village(), at(601, 4, 30), null)).toEqual(april);
    const winter = seasonCrop(first.season!, 'winter')!;
    expect(furrows(first, winter).season).toBeCloseTo(furrows(first, winter).whole, 2);
    const crops = [october, april].flatMap((s) =>
      seasonCrops(s.season!)
        .filter(({ work }) => work.partIds.length > 4 && work.plough?.bands)
        .map(({ crop, work }) => ({ s, crop, work })),
    );
    expect(crops.some((c) => c.crop === 'winter')).toBe(true);
    for (const { s, crop, work } of crops) {
      // díly, které během podzimu přibudou, se k zoraným pásům nepřipojí – nejvýš −10 %
      const { season, whole } = furrows(s, work);
      expect(season, crop).toBeGreaterThanOrEqual(0.9 * whole);
    }
  }, 120_000);
});

describe('pás dílu líně (ploughBandFinder)', () => {
  it('dá tytéž pásy jako celé rozvržení orby – i s dvojím políčkem a díly bez políčka', () => {
    // deterministická „náhoda“ – díly na mřížce 14 × 14 ve třech polích, část vynechaná
    let seed = 7;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let round = 0; round < 40; round++) {
      const selected: FieldPart[] = [];
      let id = 1;
      for (let x = 0; x < 14; x++) {
        for (let y = 0; y < 14; y++) {
          if (next() < 0.35) continue;
          const fieldId = 1 + Math.floor(next() * 3);
          selected.push(part(id++, x, y, { fieldId, distanceM: 40 + next() * 200 }));
          // dvojí políčko – platí poslední díl
          if (next() < 0.03) selected.push(part(id++, x, y, { fieldId }));
        }
      }
      // díly bez políčka a promíchané pořadí výběru
      selected.push(part(id++, 0, 0, { cell: undefined }), part(id++, 0, 0, { cell: undefined }));
      selected.sort(() => next() - 0.5);
      const bandOf = new Map<number, readonly number[]>();
      for (const band of ploughLayout(selected).bands) {
        for (const member of band.partIds) bandOf.set(member, band.partIds);
      }
      const find = ploughBandFinder(selected);
      for (const p of [...selected].sort(() => next() - 0.5)) {
        expect(find(p.id)).toEqual(bandOf.get(p.id));
      }
      expect(find(id + 1)).toBeUndefined();
    }
  });
});
