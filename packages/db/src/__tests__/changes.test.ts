import { describe, expect, it } from 'vitest';
import { parseChange } from '../changes';

describe('parseChange', () => {
  it('náklad druhu v vrátí objekt', () => {
    expect(parseChange('{"k":"v","id":"a","ver":3,"p":"hrac"}')).toEqual({
      k: 'v',
      id: 'a',
      ver: 3,
      p: 'hrac',
    });
  });

  it('s, n a x dostanou doplněné výchozí hodnoty', () => {
    expect(parseChange('{"k":"s","p":"a"}')).toEqual({ k: 's', p: 'a', op: null });
    expect(parseChange('{"k":"s","p":"a","op":"b"}')).toEqual({ k: 's', p: 'a', op: 'b' });
    expect(parseChange('{"k":"n","p":"a"}')).toEqual({ k: 'n', p: 'a' });
    expect(parseChange('{"k":"x","p":"a","progress":{"doneDays":2,"totalDays":9}}')).toEqual({
      k: 'x',
      p: 'a',
      progress: { doneDays: 2, totalDays: 9 },
    });
    expect(parseChange('{"k":"x","p":"a","progress":null}')).toEqual({
      k: 'x',
      p: 'a',
      progress: null,
    });
  });

  it('j a c s políčky a vsemi', () => {
    expect(parseChange('{"k":"j","id":"j1","t":5,"p":"a","c":[[3,4],[4,4]]}')).toEqual({
      k: 'j',
      id: 'j1',
      t: 5,
      p: 'a',
      c: [
        [3, 4],
        [4, 4],
      ],
      big: false,
    });
    expect(parseChange('{"k":"c","id":"c1","t":null,"c":[[1,1]],"a":["u"]}')).toEqual({
      k: 'c',
      id: 'c1',
      t: null,
      c: [[1, 1]],
      a: ['u'],
      big: false,
    });
  });

  it('big bez c a a dá prázdná pole', () => {
    expect(parseChange('{"k":"c","id":"c1","t":5,"big":true}')).toEqual({
      k: 'c',
      id: 'c1',
      t: 5,
      c: [],
      a: [],
      big: true,
    });
    expect(parseChange('{"k":"j","id":"j1","t":5,"p":"a","big":true}')).toMatchObject({
      c: [],
      big: true,
    });
  });

  it('neznámý druh, vadný tvar a nejson dají null', () => {
    expect(parseChange('{"k":"q"}')).toBeNull();
    expect(parseChange('nejson')).toBeNull();
    expect(parseChange('[]')).toBeNull();
    expect(parseChange('{"k":"v","id":"a"}')).toBeNull();
    expect(parseChange('{"k":"j","id":"j1","t":5,"p":"a","c":[[1]]}')).toBeNull();
    expect(parseChange('{"k":"c","id":"c1","t":5,"a":[1]}')).toBeNull();
  });
});
