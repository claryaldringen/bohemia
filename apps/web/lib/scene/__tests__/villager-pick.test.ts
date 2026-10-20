import { describe, expect, it } from 'vitest';
import { PICK_PX, pickPerson, selectedFigure } from '../villager-pick';

// Výběr postavy kliknutím (villagers.md – Výběr postavy): nejbližší vidět postava ke kurzoru.

/** Průmět shora: x → x, výška y posune nahoru (y obrazovky = z − 10·y). */
const project = (x: number, y: number, z: number): { x: number; y: number } => ({
  x,
  y: z - y * 10,
});

describe('pickPerson', () => {
  const people = [
    { person: 1, scale: 1 },
    { person: 2, scale: 1 },
    { scale: 1 }, // postava bez člověka (cizí) – nejde vybrat
    { person: 4, scale: 1 },
  ];
  const spots = new Float32Array([0, 0, 0, 20, 0, 0, 5, 0, 0, NaN, 0, 0]);

  it('nejbližší postava do PICK_PX od průmětu od nohou po hlavu', () => {
    expect(pickPerson(people, spots, 1, -5, project)).toBe(1);
    expect(pickPerson(people, spots, 18, 2, project)).toBe(2);
    // mezi dvěma blíž ke druhé
    expect(pickPerson(people, spots, 11, 0, project)).toBe(2);
    // daleko od všech nic
    expect(pickPerson(people, spots, 0, 40, project)).toBeNull();
    expect(pickPerson(people, spots, 0, PICK_PX + 0.5, project)).toBeNull();
  });

  it('cizí postava a skrytá postava (NaN) se nevybírají', () => {
    expect(pickPerson(people, spots, 5, -5, project)).toBe(1);
    // člověk 4 je skrytý – klik na jeho místo nic
    expect(
      pickPerson([{ person: 4, scale: 1 }], new Float32Array([NaN, 0, 0]), 0, 0, project),
    ).toBeNull();
  });

  it('za kamerou (průmět null) nic', () => {
    expect(pickPerson(people, spots, 0, 0, () => null)).toBeNull();
  });
});

describe('selectedFigure – výběr zůstane, i když postava zmizí', () => {
  it('vidět postava má přednost, jinak skrytá, bez postavy null', () => {
    const people = [{ person: 3 }, { person: 7 }, { person: 7 }];
    expect(selectedFigure(people, 7, (i) => i === 1)).toEqual({ index: 2, hidden: false });
    expect(selectedFigure(people, 7, () => true)).toEqual({ index: 1, hidden: true });
    expect(selectedFigure(people, 9, () => false)).toBeNull();
  });
});
