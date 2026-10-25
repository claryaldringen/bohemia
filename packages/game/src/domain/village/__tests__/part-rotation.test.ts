import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { fieldPartLooks } from '../field-progress';
import { partRotation } from '../part-rotation';
import { sowParts } from '../rotation';
import type { FarmSeason, FieldPart, VillageState } from '../types';
import { createCropWork } from '../year-plan';

// Panel dílu a pole (fields.md – Osevní postup po dílech, bod 6 – Co hráč vidí): co na dílu
// poroste příště, kolikátý osev oběhu, úhor s odpočinkem a díly na řadě či nad potřebu.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });

function part(id: number, over: Partial<FieldPart> = {}): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 2_500,
    distanceM: 50 + id,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'ready',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 10,
    foundingDone: 10,
    surface: 'meadow',
    ...over,
  };
}

/** Stav vsi jen s díly a hospodářským rokem – partRotation a fieldPartLooks čtou jen je. */
function village(parts: FieldPart[], season: FarmSeason | null = null): VillageState {
  return { parts, season, threshingSeason: null, fields: [] } as unknown as VillageState;
}

/** Hospodářský rok s jednou plodinou na dílech `parts` (osev podle `sown` 0–1). */
function seasonWith(
  parts: FieldPart[],
  crop: 'winter' | 'spring',
  day: number,
  sown: number,
  surplus = false,
): FarmSeason {
  sowParts(parts, crop);
  const work = createCropWork(parts, day, 1, false, (p) => [...p], crop);
  work.done.dig = work.required.dig;
  work.done.sow = work.required.sow * sown;
  return { startDay: day, crops: [{ crop, ...work, ...(surplus ? { surplus: true } : {}) }] };
}

describe('partRotation – co poroste příště', () => {
  it('díl po ozimu čeká na jař, po jaři prvního osevu na ozim', () => {
    const day = at(600, 12, 1);
    const shown = partRotation(
      village([part(1, { next: 'spring', sownYears: 1 }), part(2, { next: 'winter' })]),
      day,
    );
    expect(shown.get(1)).toEqual({ next: 'spring', onTurn: true });
    expect(shown.get(2)).toMatchObject({ next: 'spring', onTurn: true }); // ozim už nestihne
    expect(partRotation(village([part(2, { next: 'winter' })]), at(600, 9, 10)).get(2)).toEqual({
      next: 'winter',
      onTurn: true,
    });
  });

  it('hotový díl – ozim, dokud zbývá den setí ozimu, potom jař; v létě zase ozim', () => {
    expect(partRotation(village([part(1)]), at(600, 9, 10)).get(1)?.next).toBe('winter');
    expect(partRotation(village([part(1)]), at(601, 1, 10)).get(1)?.next).toBe('spring');
    expect(partRotation(village([part(1)]), at(601, 6, 10)).get(1)?.next).toBe('winter');
  });

  it('úhor ukazuje odpočinek k 95 % a roky do osevu; odpočatý příloh je na řadě', () => {
    const resting = part(1, { state: 'fallow', fertilityShare: 0.76, fallowSinceDay: 0 });
    const ready = part(2, { state: 'fallow', fertilityShare: 0.95, fallowSinceDay: 0 });
    const shown = partRotation(village([resting, ready]), at(600, 9, 10));
    expect(shown.get(1)).toEqual({ next: 'fallow', rest: { share: 0.8, years: 8 } });
    expect(shown.get(2)).toEqual({ next: 'winter', onTurn: true });
  });

  it('osetý díl: nezasetá plodina je příště, po zasetí postup po sezóně a kolikátý osev', () => {
    const day = at(600, 9, 5);
    const a = part(1);
    const unsown = partRotation(village([a], seasonWith([a], 'winter', day, 0)), day);
    expect(unsown.get(1)).toEqual({ next: 'winter', round: 1 });
    const b = part(2);
    const sown = partRotation(village([b], seasonWith([b], 'winter', day, 1)), day + 30);
    expect(sown.get(2)).toEqual({ next: 'spring', round: 1 });
    const c = part(3, { sownYears: 1, fertilityShare: 0.88 });
    const second = partRotation(village([c], seasonWith([c], 'spring', day, 1)), day + 30);
    expect(second.get(3)).toMatchObject({ next: 'fallow', round: 2 });
  });

  it('díl letošní práce nad potřebu', () => {
    const day = at(600, 9, 5);
    const a = part(1);
    const shown = partRotation(village([a], seasonWith([a], 'winter', day, 0, true)), day);
    expect(shown.get(1)).toEqual({ next: 'winter', round: 1, surplus: true });
  });

  it('zakládaný díl nic neukazuje', () => {
    const founding = part(1, { state: 'founding', foundingDone: 2 });
    expect(partRotation(village([founding]), at(600, 9, 5)).has(1)).toBe(false);
  });
});

describe('fieldPartLooks – strniště po prvním osevu', () => {
  it('díl na řadě po ozimu či jaři vypadá jako strniště, nový hotový díl jako rozrytý drn', () => {
    const looks = fieldPartLooks(
      village([part(1, { next: 'spring', sownYears: 1 }), part(2)]),
      at(600, 9, 5),
    );
    expect(looks.get(1)).toEqual({ look: 'stubble' });
    expect(looks.get(2)).toEqual({ look: 'bare' });
  });
});
