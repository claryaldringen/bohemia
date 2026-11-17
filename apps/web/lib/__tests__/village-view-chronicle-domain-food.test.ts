import { describe, expect, it } from 'vitest';
import type { ChronicleEvent } from '@bohemia/game';
import { chronicleText } from '../village-view-chronicle';

// Kronika jídla domény (hillfort.md – Jídlo domény): odesílatel „Jídlo pro ves“, příjemce „dobytek poražen“.

const goods = {
  grainKg: 500,
  hayKg: 0,
  logs: 0,
  cattle: { cows: 2, youngOxen: 0, trainedOxen: 0 },
  horses: 0,
  people: { families: 0, men: 0, women: 0 },
};

describe('kronika – jídlo domény', () => {
  it('odesílatel: Jídlo pro ves {jméno}', () => {
    const e: ChronicleEvent = {
      day: 1,
      kind: 'shipment-sent',
      villageName: 'Lhota',
      goods,
      purpose: 'domain-food',
    };
    expect(chronicleText(e, 'Ves')).toBe('Jídlo pro ves Lhota: 500 kg obilí a 2 ks dobytka.');
  });

  it('příjemce: Jídlo ze vsi {jméno}, dobytek poražen', () => {
    const e: ChronicleEvent = {
      day: 1,
      kind: 'shipment-received',
      villageName: 'Dub',
      goods,
      purpose: 'domain-food',
    };
    expect(chronicleText(e, 'Ves')).toBe(
      'Jídlo ze vsi Dub: 500 kg obilí a 2 ks dobytka, dobytek poražen.',
    );
  });

  it('obyčejná zásilka zůstává beze změny', () => {
    const e: ChronicleEvent = { day: 1, kind: 'shipment-received', villageName: 'Dub', goods };
    expect(chronicleText(e, 'Ves')).toBe(
      'Zásilka ze vsi Dub dorazila – 500 kg obilí a 2 ks dobytka.',
    );
  });
});

// D90 (Martin 17. 11. 2026): zásoba po sklizni a počet obyvatel u narození a úmrtí.
describe('kronika – zásoby a obyvatelé', () => {
  it('sklizeň ozimu s nepovinnou zásobou', () => {
    const base: ChronicleEvent = { day: 1, kind: 'harvest', kg: 765, crop: 'winter' };
    expect(chronicleText(base, 'Ves')).toBe('Sklizeň ozimu: 765 kg obilí.');
    const e: ChronicleEvent = { ...base, stock: { kg: 1821, days: 80, people: 60 } };
    expect(chronicleText(e, 'Ves')).toBe(
      'Sklizeň ozimu: 765 kg obilí. Obilí má ves 1 821 kg – při 60 lidech vystačí na 80 dní.',
    );
  });

  it('jablka a nevystačí ani na den', () => {
    const e: ChronicleEvent = {
      day: 1,
      kind: 'apple-harvest',
      kg: 50,
      stock: { kg: 50, days: 0, people: 1 },
    };
    expect(chronicleText(e, 'Ves')).toBe(
      'Sklizeň ovoce: 50 kg. Jablka má ves 50 kg – při 1 člověku nevystačí ani na den.',
    );
  });

  it('narození a úmrtí s počtem obyvatel', () => {
    expect(chronicleText({ day: 1, kind: 'birth', name: 'Bořivoj', population: 61 }, 'Ves')).toBe(
      'Narodil se Bořivoj. Ves má 61 obyvatel.',
    );
    expect(
      chronicleText({ day: 1, kind: 'death', group: 'elder', age: 64, population: 3 }, 'Ves'),
    ).toContain('Ves má 3 obyvatele.');
  });
});
