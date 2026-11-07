import { describe, expect, it } from 'vitest';
import { GRAIN_PITS, dayIndexOf, foundVillage, type VillageState } from '@bohemia/game';
import { grainPitViews, grainPitsField, sceneGrainPits } from '../grain-pit-view';
import { selectionDetails } from '../selection-details';
import { grainPitGeometry, grainPitsKey } from '../scene/grain-pit-layout';
import type { SceneVillage, VillageView } from '../village-view';

// Obilné jámy v pohledu na ves (production-chains.md – Obilné jámy; Martin 20. 10. 2026: „Označit
// půjde jen otevřená jáma - zavřená nebude vidět - a v označení se ukáže kolik v ní je zrní.“).

const DAY = dayIndexOf({ year: 602, month: 1, day: 10 });

/** Ves se třemi jamami – dvě zapečetěné, jedna otevřená s 864 kg, a 120 kg doma. */
function withPits(): VillageState {
  const s = foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  const pit = (id: number, grainKg: number, state: 'sealed' | 'open', x: number) => ({
    id,
    x,
    z: 12,
    capacityKg: GRAIN_PITS.capacityKg,
    grainKg,
    state,
    dugDay: DAY - 3 * 365 - 20,
    ...(state === 'sealed' ? { filledDay: DAY - 120 } : {}),
  });
  s.grainPits = [
    pit(80, 1500, 'sealed', 20),
    pit(81, 864.4, 'open', 23),
    pit(82, 1500, 'sealed', 26),
  ];
  s.storesKg = 1500 + 864.4 + 1500 + 120;
  return s;
}

describe('obilné jámy v pohledu na ves', () => {
  it('scéna i panel mají jen otevřenou jámu – zapečetěné nejsou vidět', () => {
    const s = withPits();
    expect(sceneGrainPits(s)).toEqual([{ id: 81, x: 23, z: 12, fill: 0.6 }]);
    expect(grainPitViews(s, DAY)).toEqual([
      { id: 81, grainKg: 864, capacityKg: GRAIN_PITS.capacityKg, ageYears: 3 },
    ]);
    expect(
      grainPitsField(
        foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
        DAY,
      ),
    ).toEqual({});
  });

  it('ubude-li zásob (prodej), pohled ukáže otevřenou jámu po odběru – i další otevřenou', () => {
    const s = withPits();
    s.storesKg -= 120 + 864.4 + 100;
    expect(sceneGrainPits(s)).toEqual([{ id: 80, x: 20, z: 12, fill: 0.95 }]);
    expect(grainPitViews(s, DAY)[0]).toMatchObject({ id: 80, grainKg: 1400 });
  });

  it('panel výběru jen pro otevřenou jámu ve scéně – ukáže kg zrna', () => {
    const s = withPits();
    const scene = { dwellings: [], fields: [], grainPits: sceneGrainPits(s) } as SceneVillage;
    const view = { grainPits: grainPitViews(s, DAY) } as unknown as VillageView;
    expect(selectionDetails(view, scene, { kind: 'grain-pit', id: 81 })).toEqual({
      kind: 'grain-pit',
      id: 81,
      grainKg: 864,
      capacityKg: GRAIN_PITS.capacityKg,
      ageYears: 3,
    });
    // zapečetěná jáma ve scéně není – vybrat nejde
    expect(selectionDetails(view, scene, { kind: 'grain-pit', id: 80 })).toBeNull();
  });

  it('síť otevřených jam – hrdlo, val a hroudy pečeti; klíč podle plnosti', () => {
    const pits = sceneGrainPits(withPits());
    const geometry = grainPitGeometry(pits, () => 0);
    expect(geometry.positions.length).toBeGreaterThan(0);
    expect(geometry.positions.length / 3).toBe(geometry.colors.length / 3);
    expect(Math.max(...geometry.indices)).toBeLessThan(geometry.positions.length / 3);
    expect(grainPitGeometry([], () => 0).indices).toEqual([]);
    expect(grainPitsKey(pits)).not.toBe(grainPitsKey([{ ...pits[0]!, fill: 0.55 }]));
    // plná jáma má uprostřed zrno, prázdná tmu
    const full = grainPitGeometry([{ id: 1, x: 0, z: 0, fill: 1 }], () => 0).colors.slice(0, 3);
    const empty = grainPitGeometry([{ id: 1, x: 0, z: 0, fill: 0 }], () => 0).colors.slice(0, 3);
    expect(full[0]!).toBeGreaterThan(empty[0]! + 0.3);
  });
});
