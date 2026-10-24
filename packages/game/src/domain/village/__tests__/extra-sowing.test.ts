import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { extraPartsOf, extraSowable, extraSowingCrop, queueExtraParts } from '../extra-sowing';
import { fieldPartLooks, partYearWork } from '../field-progress';
import { planPartIds, tilledShare } from '../year-plan';
import { advanceVillage } from '../simulate';
import { summarizeVillage } from '../summary';
import type { Construction, VillageState } from '../types';

// Osev navíc (fields.md – Kolik ves oseje, Osev navíc): ves bez staveb obdělá všechny díly, které
// smí osít, ale jen prací, která zbude po stavbách.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];

/** Pole 3 ha (133 dílů po 225 m², úrodnost 70). */
const field = (count = 133): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

/**
 * Ves s polem, které se loni osévalo (díly smějí dál), a se zásobou obilí na roky – potřebný osev
 * obilí k 1. 9. 600 je nulový, všechno obilí je osev navíc. Bez staveb, dopočítaná do 31. 8. 600.
 */
function richVillage(): VillageState {
  const s = foundVillage({
    seed: 42,
    day: at(600, 6, 1),
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts: field() },
  });
  s.constructions = [];
  s.lastDay = at(600, 8, 31);
  s.storesKg = 20_000;
  s.meatKg = 300;
  s.parts.forEach((p) => {
    p.foundingDone = p.foundingCost;
    p.state = 'sown';
    p.crop = 'spring';
    p.sownYears = 1;
  });
  return s;
}

/** Totéž pole po políčkách (12 × 11) a ves s vycvičeným spřežením – orá rádlem (oxen.md). */
function ploughVillage(): VillageState {
  const s = richVillage();
  s.parts.splice(132);
  s.parts.forEach((p, i) => {
    p.cell = { x: 10 + (i % 12), y: 10 + Math.floor(i / 12) };
  });
  s.pens = [
    {
      id: 800,
      cell: { x: 5, y: 5 },
      x: 80,
      z: 80,
      builtDay: s.lastDay - 800,
      team: { readyDay: s.lastDay - 10 },
      training: null,
    },
  ];
  return s;
}

/** Stavba, která spotřebuje všechnu společnou práci (do konce testu ji ves nedostaví). */
function bigSite(day: number): Construction {
  return {
    id: 900,
    kind: 'dwelling',
    startedDay: day,
    cost: 1_000_000,
    done: 0,
    dwellingType: 'zemnice',
    position: null,
    dwellingId: null,
    fieldId: null,
  };
}

/** Kopání jednoho dílu (225 m², nejdál 100 m od domu – příplatek za vzdálenost nanejvýš 1 %). */
const PART_DIG = 0.0225 * 100 * 1.01;

const grainIds = (s: VillageState): number[] =>
  s.plan ? [...(s.plan.winter?.partIds ?? []), ...s.plan.partIds] : [];

describe('osev navíc', () => {
  it('plodina dne: ozim do předposledního dne setí ozimu, pak jař v oknech kopání', () => {
    expect(extraSowingCrop(at(600, 9, 1))).toBe('winter');
    expect(extraSowingCrop(at(600, 10, 30))).toBe('winter');
    expect(extraSowingCrop(at(600, 10, 31))).toBe('spring');
    expect(extraSowingCrop(at(600, 11, 30))).toBe('spring');
    expect(extraSowingCrop(at(600, 12, 15))).toBeNull();
    expect(extraSowingCrop(at(601, 3, 1))).toBe('spring');
    expect(extraSowingCrop(at(601, 4, 29))).toBe('spring');
    expect(extraSowingCrop(at(601, 4, 30))).toBeNull();
    expect(extraSowingCrop(at(601, 6, 1))).toBeNull();
  });

  it('ves bez staveb oseje díly navíc – na podzim ozim, pak jař; čekající díly leží ladem', () => {
    const s0 = richVillage();
    const planned = advanceVillage(s0, at(600, 9, 1), null);
    // potřebný osev obilí je nulový – všechny díly čekají v osevu navíc v pořadí výběru
    const waiting = planned.plan!.extra!;
    expect(waiting.length + planPartIds(planned.plan!).length).toBe(133);
    // díl, který se osíval, si pamatuje léta v řadě (1. 9. přibyl osetý rok)
    expect(waiting[0]!.sownYears).toBe(2);
    const autumn = advanceVillage(planned, at(600, 11, 30), null);
    const winter = autumn.plan!.winter!;
    expect(winter.partIds.length).toBeGreaterThan(5);
    expect(autumn.plan!.partIds.length).toBeGreaterThan(0);
    // začatý díl navíc se osévá dál s léty v řadě
    const started = autumn.parts.find((p) => p.id === winter.partIds[0])!;
    expect(started.state).toBe('sown');
    expect(started.crop).toBe('winter');
    expect(started.sownYears).toBe(2);
    expect(started.fallowBeforePlan).toBeUndefined();
    // co je zkopané, je zaseté – setí patří k potřebné práci; kopání čeká nejvýš na jednom dílu
    expect(winter.done.sow).toBeGreaterThan(0.999 * winter.required.sow * tilledShare(winter));
    expect(winter.required.dig - winter.done.dig).toBeLessThan(PART_DIG);
    // čekající díl vypadá jako příloh a v datech panelu čeká na volnou práci
    const left = autumn.plan!.extra!;
    expect(left.length).toBeGreaterThan(0);
    expect(left.length).toBeLessThan(waiting.length);
    const looks = fieldPartLooks(autumn, autumn.lastDay);
    const work = partYearWork(autumn, autumn.lastDay);
    for (const { id } of left) {
      expect(autumn.parts.find((p) => p.id === id)!.state).toBe('fallow');
      expect(['young-fallow', 'pasture', 'meadow']).toContain(looks.get(id)?.look);
      expect(work.get(id)?.extra).toBe(true);
    }
    // na jaře přibude jař; po dubnu se zbytek smaže a díly leží ladem
    const spring = advanceVillage(autumn, at(601, 5, 2), null);
    expect(spring.plan!.partIds.length).toBeGreaterThan(autumn.plan!.partIds.length);
    expect(spring.plan!.extra).toBeUndefined();
    // sklizeň ozimu i jaře jde do zásob
    const harvested = advanceVillage(spring, at(601, 8, 31), null);
    const kg = harvested.chronicle
      .filter((e) => e.kind === 'harvest' && e.day > at(601, 1, 1))
      .reduce((sum, e) => sum + (e.kind === 'harvest' ? e.kg : 0), 0);
    expect(kg).toBeGreaterThan(500);
  }, 60_000);

  it('jediný vstup do osevu navíc: příloh 70–95 % `extraPartsOf` zahodí, jarní hotové díly též', () => {
    const s = richVillage();
    const [a, b, c] = s.parts;
    a!.state = 'fallow';
    a!.fertilityShare = 0.8;
    b!.state = 'fallow';
    b!.fertilityShare = 0.97;
    c!.state = 'sown';
    c!.fertilityShare = 0.9;
    const parts = extraPartsOf([a!, b!, c!]);
    expect(parts.map((e) => e.id)).toEqual([b!.id, c!.id]);
    const plan = { extra: [] } as unknown as NonNullable<VillageState['plan']>;
    queueExtraParts(plan, parts);
    expect(plan.extra!.map((e) => e.id)).toEqual([b!.id, c!.id]);
  });

  it('osev navíc jen na dílech v oběhu – ne na přílohu 70–95 % (Martin 24. 10. 2026)', () => {
    const s0 = richVillage();
    // třetina dílů je příloh odpočatý na 80 %, třetina na 96 %
    s0.parts.forEach((p, i) => {
      if (i % 3 === 0) return;
      p.state = 'fallow';
      p.fallowSinceDay = at(590, 9, 1);
      p.sownYears = 0;
      delete p.crop;
      p.fertilityShare = i % 3 === 1 ? 0.8 : 0.96;
    });
    const tired = s0.parts.filter((_, i) => i % 3 === 1).map((p) => p.id);
    expect(tired.every((id) => !extraSowable(s0.parts.find((p) => p.id === id)!))).toBe(true);
    const planned = advanceVillage(s0, at(600, 9, 1), null);
    const extra = new Set(planned.plan!.extra!.map((e) => e.id));
    expect(extra.size).toBeGreaterThan(0);
    for (const id of tired) expect(extra.has(id)).toBe(false);
    // díly v oběhu (osévané od 70 %, příloh od 95 %) v osevu navíc jsou
    const rested = s0.parts.filter((_, i) => i % 3 === 2).map((p) => p.id);
    expect(rested.some((id) => extra.has(id))).toBe(true);
  });

  it('ves se spřežením díly navíc orá – pásy orby pokrývají díly plodiny právě jednou', () => {
    const autumn = advanceVillage(ploughVillage(), at(600, 11, 30), null);
    const plan = autumn.plan!;
    expect(plan.ard).toBe(true);
    expect(plan.winter!.partIds.length).toBeGreaterThan(5);
    for (const work of [plan.winter!, plan]) {
      const plough = work.plough!;
      expect([...plough.partIds].sort()).toEqual([...work.partIds].sort());
      const banded = plough.bands!.flatMap((b) => b.partIds);
      expect([...banded].sort()).toEqual([...plough.partIds].sort());
      expect(work.required.dig).toBe(0);
      expect(plough.done).toBeLessThanOrEqual(plough.required + 1e-9);
    }
    // co spřežení zoralo, je zaseté
    const winter = plan.winter!;
    expect(winter.done.sow).toBeGreaterThan(0.999 * winter.required.sow * tilledShare(winter));
  }, 60_000);

  it('se stavbou dostane stavba práci napřed a díly navíc zůstanou ladem', () => {
    const s0 = richVillage();
    s0.constructions.push(bigSite(s0.lastDay));
    const autumn = advanceVillage(s0, at(600, 11, 30), null);
    const plan = autumn.plan!;
    expect(grainIds(autumn)).toEqual([]);
    expect(plan.extra!.length).toBe(133 - planPartIds(plan).length);
    const site = autumn.constructions.find((c) => c.id === 900)!;
    expect(site.done).toBeGreaterThan(20);
    // volná práce v souhrnu = co dostala stavba
    const common = summarizeVillage(autumn, autumn.lastDay).commonLaborPerDay;
    expect(common).toBeGreaterThan(0);
    const toSite = autumn.labor!.shares.filter((x) => x.construction === 900);
    expect(toSite.reduce((sum, x) => sum + x.manDays, 0)).toBeCloseTo(common, 2);
  }, 60_000);

  it('začatý díl navíc se dokončí a sklidí i se stavbou – další už nezačnou', () => {
    // v září ves kope luštěniny a dohání domácí výrobu – osev navíc začne v říjnu
    const begun = advanceVillage(richVillage(), at(600, 10, 25), null);
    const winterIds = [...begun.plan!.winter!.partIds];
    expect(winterIds.length).toBeGreaterThan(0);
    begun.constructions.push(bigSite(begun.lastDay));
    const after = advanceVillage(begun, at(601, 7, 31), null);
    const winter = after.plan!.winter!;
    // žádný další díl navíc – všechna práce po potřebné jde do stavby
    expect(winter.partIds).toEqual(winterIds);
    expect(after.plan!.partIds).toEqual([]);
    // co je na začatých dílech zkopané, se zaselo a sklidilo; kopání posledního začatého dílu
    // čeká na volnou práci (stavba ji bere celou)
    expect(winter.required.dig - winter.done.dig).toBeLessThan(PART_DIG);
    expect(winter.done.sow).toBeGreaterThan(0.999 * winter.required.sow * tilledShare(winter));
    expect(winter.harvestedKg).toBeGreaterThan(0);
    const sown = winter.done.sow / winter.required.sow;
    expect(winter.done.harvest).toBeGreaterThan(0.999 * winter.required.harvest * sown);
  }, 60_000);

  it('volná práce v souhrnu nezahrnuje polní práci navíc', () => {
    const s = advanceVillage(richVillage(), at(600, 10, 30), null);
    const summary = summarizeVillage(s, s.lastDay);
    // dnes šla práce navíc na kopání dílů navíc, a přesto ukazatel ukazuje práci pro stavby
    const dig = s.labor!.shares.filter((x) => x.activity === 'dig');
    const digging = dig.reduce((sum, x) => sum + x.manDays, 0);
    expect(digging).toBeGreaterThan(0.5);
    expect(summary.commonLaborPerDay).toBeGreaterThan(0.5);
    const idle = s.labor!.shares.find((x) => x.activity === 'idle')?.manDays ?? 0;
    expect(idle).toBeLessThan(0.01);
  }, 60_000);

  it('po kouscích dá stejný stav jako jedním voláním', () => {
    const s0 = richVillage();
    const end = at(601, 5, 10);
    const whole = advanceVillage(s0, end, null);
    let pieces = s0;
    const steps = [1, 13, 40, 2, 77];
    for (let i = 0; pieces.lastDay < end; i++) {
      pieces = advanceVillage(
        pieces,
        Math.min(end, pieces.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(pieces).toEqual(whole);
  }, 60_000);

  it('plán starší vsi bez osevu navíc se dopočítá beze změny dílů plánu', () => {
    const planned = advanceVillage(richVillage(), at(600, 9, 1), null);
    const old: VillageState = structuredClone(planned);
    delete old.plan!.extra;
    const ids = planPartIds(old.plan!);
    const later = advanceVillage(old, at(600, 11, 30), null);
    expect(planPartIds(later.plan!)).toEqual(ids);
    expect(later.plan!.extra).toBeUndefined();
  }, 60_000);
});
