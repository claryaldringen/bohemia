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

  it('příjemce: Jídlo z vsi {jméno}, dobytek poražen', () => {
    const e: ChronicleEvent = {
      day: 1,
      kind: 'shipment-received',
      villageName: 'Dub',
      goods,
      purpose: 'domain-food',
    };
    expect(chronicleText(e, 'Ves')).toBe(
      'Jídlo z vsi Dub: 500 kg obilí a 2 ks dobytka, dobytek poražen.',
    );
  });

  it('obyčejná zásilka zůstává beze změny', () => {
    const e: ChronicleEvent = { day: 1, kind: 'shipment-received', villageName: 'Dub', goods };
    expect(chronicleText(e, 'Ves')).toBe(
      'Zásilka z vsi Dub dorazila – 500 kg obilí a 2 ks dobytka.',
    );
  });
});
