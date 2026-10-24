import { describe, expect, it } from 'vitest';
import { dayIndexOf, foundVillage, isLineMan, type VillageState } from '@bohemia/game';
import { lineEndView } from '../line-end-view';

// Kronika rodu na obrazovce porážky (lord.md – Konec rodu: „Bořivoj 500–541“, „Zemřel Ctibor –
// poslední muž rodu“, jméno vsi a roky jejího života).

const at = (year: number): number => dayIndexOf({ year, month: 3, day: 1 });

/** Ves založená roku 500 vojvodou Bořivojem, rod skončil roku `ended` (bez mužů rodu). */
function endedVillage(ended: number): VillageState {
  const s = foundVillage({
    seed: 3,
    day: at(500),
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    lord: { name: 'Bořivoj' },
  });
  s.people = s.people.filter((p) => !isLineMan(p));
  s.dynasty = {
    lordId: null,
    lords: [
      { id: 1, name: 'Bořivoj', fromDay: at(500), toDay: at(541) },
      { id: 7, fromDay: at(541), toDay: at(560) },
      { id: 9, name: 'Ctibor', fromDay: at(560), toDay: at(ended) },
    ],
    endedDay: at(ended),
  };
  return s;
}

describe('lineEndView', () => {
  it('vojvodové po sobě s roky, poslední muž rodu a ves, kde rod skončil', () => {
    expect(lineEndView([{ name: 'Libice', state: endedVillage(571) }])).toEqual({
      lords: [
        { name: 'Bořivoj', fromYear: 500, toYear: 541 },
        { fromYear: 541, toYear: 560 },
        { name: 'Ctibor', fromYear: 560, toYear: 571 },
      ],
      last: 'Ctibor',
      village: 'Libice',
      foundedYear: 500,
      endedYear: 571,
      // celé roky po 365,25 dne jako `villageLifespan`
      years: 70,
    });
  });

  it('víc vsí – ves, kde rod skončil nejpozději', () => {
    const early = endedVillage(530);
    const view = lineEndView([
      { name: 'Libice', state: early },
      { name: 'Lhota', state: endedVillage(571) },
    ]);
    expect(view?.village).toBe('Lhota');
  });

  it('rod žije (i jen v jiné vsi) nebo ves bez rodu – null', () => {
    const living = foundVillage({
      seed: 3,
      day: at(500),
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      lord: { name: 'Bořivoj' },
    });
    expect(lineEndView([{ name: 'Libice', state: living }])).toBeNull();
    expect(
      lineEndView([
        { name: 'Libice', state: endedVillage(571) },
        { name: 'Lhota', state: living },
      ]),
    ).toBeNull();
    const without = foundVillage({
      seed: 3,
      day: at(500),
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
    });
    expect(lineEndView([{ name: 'Libice', state: without }])).toBeNull();
  });
});
