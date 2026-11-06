import { describe, expect, it } from 'vitest';
import { parseTermItems } from '../house-input';

const goods = {
  grainKg: 10,
  hayKg: 0,
  cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 },
  horses: 0,
  logs: 0,
  people: { families: 0, men: 0, women: 0 },
  laborDays: 0,
};

describe('parseTermItems – obchod', () => {
  it('přijme obchod s makrokomoditami a vsí odeslání', () => {
    const items = parseTermItems([
      {
        kind: 'trade',
        give: goods,
        get: { ...goods, grainKg: 0, logs: 3 },
        fromVillage: { a: 'v' },
      },
    ]);
    expect(items).toMatchObject([{ kind: 'trade', fromVillage: { a: 'v' } }]);
  });

  it('mikrokomoditu (hrnce, železo) v give i get odmítne', () => {
    expect(parseTermItems([{ kind: 'trade', give: { ...goods, pots: 4 }, get: goods }])).toBeNull();
    expect(parseTermItems([{ kind: 'trade', give: goods, get: { ...goods, iron: 2 } }])).toBeNull();
  });

  it('víc než dvě strany ve vsích odeslání odmítne', () => {
    const fromVillage = { a: 'x', b: 'y', c: 'z' };
    expect(parseTermItems([{ kind: 'trade', give: goods, get: goods, fromVillage }])).toBeNull();
  });
});
