import { describe, expect, it } from 'vitest';
import { lordOffer, type OfferCandidate } from '../lord-offer';

const c = (
  houseId: string,
  villages: number,
  language: OfferCandidate['language'] = 'cs',
  extra: Partial<OfferCandidate> = {},
): OfferCandidate => ({ houseId, kind: 'player', alive: true, villages, language, ...extra });

const me = { language: 'cs', seed: 7 } as const;

describe('lordOffer', () => {
  it('nabídne jen rody s nejmenším počtem vsí ≥ 2', () => {
    const r = lordOffer([c('a', 1), c('b', 2), c('c', 2), c('d', 3)], me);
    expect([...r].sort()).toEqual(['b', 'c']);
  });
  it('když nikdo nemá 2, rody se 3', () => {
    expect(lordOffer([c('a', 1), c('d', 3), c('e', 4)], me)).toEqual(['d']);
  });
  it('vynechá NPC a mrtvé', () => {
    const r = lordOffer(
      [c('n', 2, 'cs', { kind: 'npc' }), c('m', 2, 'cs', { alive: false }), c('b', 3)],
      me,
    );
    expect(r).toEqual(['b']);
  });
  it('nikdo s ≥ 2 vsemi = prázdná nabídka', () => {
    expect(lordOffer([c('a', 1), c('b', 0)], me)).toEqual([]);
    expect(lordOffer([], me)).toEqual([]);
  });
  it('stejný jazyk první', () => {
    const r = lordOffer([c('a', 2, 'de'), c('b', 2, 'cs'), c('c', 2, 'en'), c('d', 2, 'cs')], me);
    expect(r.slice(0, 2).sort()).toEqual(['b', 'd']);
  });
  it('stejný seed = stejné pořadí, jiný seed = jiné pořadí', () => {
    const cands = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => c(id, 2));
    const one = lordOffer(cands, me);
    expect(lordOffer(cands, me)).toEqual(one);
    const others = [1, 2, 3, 4, 5].map((seed) => lordOffer(cands, { language: 'cs', seed }));
    expect(others.some((o) => o.join() !== one.join())).toBe(true);
  });
});
