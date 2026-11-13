import { describe, expect, it } from 'vitest';
import { horseVillage, START } from '../../__tests__/horse-fixtures';
import { sendAway } from '../../../vassalage';
import { lineCandidates, villagerCandidates } from '../../../war';
import { foodNeedPerDay, isAway, laborPerDay } from '../people';

// Muž na výjezdu (lord-control.md – Kdo jede): doma nepracuje a není k mání pro tažení, ale jí
// dál ze zásob své vsi (výjezd neveze zásoby).

function village() {
  const s = horseVillage(null, 1, 4);
  for (const p of s.people) if (p.id === 10 || p.id === 12) p.line = true;
  return s;
}

describe('nepřítomnost journey', () => {
  it('muž na výjezdu nepracuje a není pryč „na čas“ jinak než ostatní', () => {
    const s = village();
    sendAway(s, START, [10], { kind: 'journey', refId: 'j1' });
    const lord = s.people.find((p) => p.id === 10)!;
    expect(isAway(lord, START)).toBe(true);
    expect(laborPerDay(lord, START)).toBe(0);
  });

  it('jí doma: potřeba jídla je stejná jako u muže, který je doma', () => {
    const s = village();
    const home = s.people.find((p) => p.id === 10)!;
    const before = foodNeedPerDay(home, START);
    expect(before).toBeGreaterThan(0);
    sendAway(s, START, [10], { kind: 'journey', refId: 'j1' });
    expect(foodNeedPerDay(home, START)).toBe(before);
  });

  it('na rozdíl od tažení (jí jinde)', () => {
    const s = village();
    sendAway(s, START, [12], { kind: 'campaign', refId: 'c1' });
    expect(
      foodNeedPerDay(
        s.people.find((p) => p.id === 12)!,
        START,
      ),
    ).toBe(0);
  });

  it('není mezi muži způsobilými na tažení', () => {
    const s = village();
    expect(lineCandidates(s, START).map((p) => p.id)).toEqual([10, 12]);
    sendAway(s, START, [10], { kind: 'journey', refId: 'j1' });
    expect(lineCandidates(s, START).map((p) => p.id)).toEqual([12]);
    sendAway(s, START, [20], { kind: 'journey', refId: 'j1' });
    expect(villagerCandidates(s, START).map((p) => p.id)).not.toContain(20);
  });
});
