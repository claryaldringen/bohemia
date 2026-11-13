import { describe, expect, it } from 'vitest';
import { parseAnswerLevyInput, parseTermItems } from '../house-input';

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

describe('parseAnswerLevyInput – rozdělení po vsích', () => {
  /** Tělo server action tak, jak ho rozloží JSON – i klíč `__proto__` je vlastní vlastnost. */
  const answer = (split: string): unknown =>
    JSON.parse(`{ "dialogId": "d1", "lines": [], "split": ${split} }`);
  const bundle = JSON.stringify(goods);

  it('rozdělení nese svazek každé vsi pod jejím id', () => {
    const parsed = parseAnswerLevyInput(answer(`{ "ves-1": ${bundle}, "ves-2": ${bundle} }`));
    expect(Object.keys(parsed!.split)).toEqual(['ves-1', 'ves-2']);
    expect(parsed!.split['ves-1']?.grainKg).toBe(10);
    expect(Object.values(parsed!.split)).toHaveLength(2);
  });

  it('klíč __proto__ od klienta je obyčejný klíč – prototyp rozdělení nenastaví', () => {
    const parsed = parseAnswerLevyInput(answer(`{ "__proto__": ${bundle} }`));
    expect(parsed).not.toBeNull();
    // use-case ho uvidí mezi vsemi a odmítne jako cizí ves, místo aby tiše vypadl
    expect(Object.keys(parsed!.split)).toEqual(['__proto__']);
    // nic zděděného – data klienta se nestanou prototypem objektu
    expect('grainKg' in parsed!.split).toBe(false);
    expect('toString' in parsed!.split).toBe(false);
  });
});
