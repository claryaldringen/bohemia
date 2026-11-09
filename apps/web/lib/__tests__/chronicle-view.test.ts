import { describe, expect, it } from 'vitest';
import { CHRONICLE_MAX_EVENTS, dayIndexOf, type ChronicleEvent } from '@bohemia/game';
import {
  CHRONICLE_PAGE_ENTRIES,
  appendOlder,
  chroniclePage,
  mergeNewest,
  parseChronicleAsk,
} from '../chronicle-view';

// Panel Kronika (absence.md – Návrat): zápisy od nejnovějších, po herních letech, po stránkách.

const day = (year: number, month = 1, d = 1): number => dayIndexOf({ year, month, day: d });

/** Kronika s `perYear` narozeními v každém roce od `from` do `to` (po založení vsi). */
function births(from: number, to: number, perYear: number): ChronicleEvent[] {
  const events: ChronicleEvent[] = [{ day: day(from), kind: 'village-founded' }];
  for (let year = from; year <= to; year++) {
    for (let i = 0; i < perYear; i++)
      events.push({ day: day(year, 3 + Math.floor(i / 28), 1 + (i % 28)), kind: 'birth' });
  }
  return events;
}

describe('stránka kroniky', () => {
  it('seskupí zápisy po letech, nejnovější rok i zápis první, s dnem a měsícem', () => {
    const events: ChronicleEvent[] = [
      { day: day(500, 1, 1), kind: 'village-founded' },
      { day: day(500, 5, 3), kind: 'birth' },
      { day: day(501, 2, 9), kind: 'birth' },
      { day: day(501, 7, 20), kind: 'line-birth' },
    ];
    const page = chroniclePage(events, 'Lhota', { before: null });
    expect(page.years.map((y) => y.year)).toEqual([501, 500]);
    expect(page.years[0]!.entries.map((e) => e.kind)).toEqual(['line-birth', 'birth']);
    expect(page.years[1]!.entries.map((e) => e.text)).toEqual([
      'Narodilo se dítě.',
      'Osadníci založili ves Lhota.',
    ]);
    expect(page.years[0]!.entries[0]!.dateLabel).toBe('20. července');
    expect(page.olderThan).toBeNull();
    expect(page.lost).toBe(false);
  });

  it('zápis ze schránky s dřívějším dnem se zařadí podle dne', () => {
    const events: ChronicleEvent[] = [
      { day: day(500), kind: 'village-founded' },
      { day: day(502, 6), kind: 'birth' },
      { day: day(501, 6), kind: 'line-birth' },
    ];
    const page = chroniclePage(events, 'Lhota', { before: null });
    expect(page.years.map((y) => y.year)).toEqual([502, 501, 500]);
  });

  it('trvalé stavy vsi s datem začátku a konce; denní zápisy hladu panel neukazuje (absence.md)', () => {
    // začátek se zapíše až týden po začátku s jeho dnem, konce téhož dne od nejhoršího stupně
    const events: ChronicleEvent[] = [
      { day: day(500), kind: 'village-founded' },
      { day: day(501, 2, 1), kind: 'hunger-began' },
      { day: day(501, 2, 3), kind: 'notice-began', notice: 'no-charcoal' },
      { day: day(501, 2, 1), kind: 'notice-began', notice: 'rationing' },
      { day: day(501, 3, 1), kind: 'notice-began', notice: 'hungry' },
      { day: day(501, 5, 10), kind: 'hunger-ended' },
      { day: day(501, 5, 10), kind: 'notice-ended', notice: 'hungry' },
      { day: day(501, 5, 10), kind: 'notice-ended', notice: 'rationing' },
      { day: day(501, 6, 2), kind: 'notice-ended', notice: 'no-charcoal' },
    ];
    const page = chroniclePage(events, 'Lhota', { before: null });
    expect(page.years[0]!.entries.map((e) => `${e.dateLabel}: ${e.text}`)).toEqual([
      '2. června: Kovář má zase uhlí.',
      '10. května: Ves už nešetří jídlem.',
      '10. května: Hlad skončil.',
      '1. března: Ves hladoví.',
      '3. února: Kovář nemá uhlí.',
      '1. února: Ves šetří jídlem – zásoby nevystačí do sklizně.',
    ]);
  });

  it('stránka bere celé roky, dokud nemá CHRONICLE_PAGE_ENTRIES zápisů; další stránka navazuje', () => {
    const events = births(500, 529, 7); // 30 let po 7 zápisech (+ založení)
    const first = chroniclePage(events, 'Lhota', { before: null });
    const perPage = Math.ceil(CHRONICLE_PAGE_ENTRIES / 7);
    expect(first.years.map((y) => y.year)).toEqual(
      Array.from({ length: perPage }, (_, i) => 529 - i),
    );
    expect(first.years.every((y) => y.entries.length === 7)).toBe(true);
    expect(first.olderThan).toBe(529 - perPage + 1);

    const second = chroniclePage(events, 'Lhota', { before: first.olderThan });
    expect(second.years[0]!.year).toBe(first.olderThan! - 1);

    // projít všechny stránky – každý rok právě jednou, poslední stránka bez dalších
    let page = first;
    let ask = first.olderThan;
    while (ask !== null) {
      const older = chroniclePage(events, 'Lhota', { before: ask });
      page = appendOlder(page, older);
      ask = older.olderThan;
    }
    expect(page.years.map((y) => y.year)).toEqual(Array.from({ length: 30 }, (_, i) => 529 - i));
    expect(page.years.at(-1)!.entries.at(-1)!.kind).toBe('village-founded');
    expect(page.olderThan).toBeNull();
  });

  it('rok s víc zápisy než stránka se nedělí', () => {
    const events = births(500, 501, CHRONICLE_PAGE_ENTRIES + 5);
    const page = chroniclePage(events, 'Lhota', { before: null });
    expect(page.years.map((y) => y.year)).toEqual([501]);
    expect(page.years[0]!.entries).toHaveLength(CHRONICLE_PAGE_ENTRIES + 5);
    expect(page.olderThan).toBe(501);
  });

  it('zkrácená kronika (CHRONICLE_MAX_EVENTS) bez založení vsi – nejstarší zápisy se nedochovaly', () => {
    const events = births(500, 600, 6).slice(-CHRONICLE_MAX_EVENTS);
    expect(events.some((e) => e.kind === 'village-founded')).toBe(false);
    let ask: number | null = null;
    let page = chroniclePage(events, 'Lhota', { before: null });
    expect(page.lost).toBe(false);
    ask = page.olderThan;
    while (ask !== null) {
      page = chroniclePage(events, 'Lhota', { before: ask });
      ask = page.olderThan;
    }
    expect(page.lost).toBe(true);
  });
});

describe('spojování stránek v panelu', () => {
  it('nový zápis obnoví první stránku a starší načtené roky zůstanou', () => {
    const events = births(500, 529, 7);
    const first = chroniclePage(events, 'Lhota', { before: null });
    const shown = appendOlder(first, chroniclePage(events, 'Lhota', { before: first.olderThan }));
    const later = [...events, { day: day(530, 1, 2), kind: 'birth' } as ChronicleEvent];
    const fresh = chroniclePage(later, 'Lhota', { before: null });
    const merged = mergeNewest(shown, fresh);
    expect(merged.years[0]!.year).toBe(530);
    const years = merged.years.map((y) => y.year);
    expect(new Set(years).size).toBe(years.length);
    expect(years.at(-1)).toBe(shown.years.at(-1)!.year);
    expect(merged.olderThan).toBe(shown.olderThan);
  });

  it('bez zobrazené stránky je výsledkem nová stránka', () => {
    const fresh = chroniclePage(births(500, 501, 1), 'Lhota', { before: null });
    expect(mergeNewest(null, fresh)).toBe(fresh);
  });
});

describe('dotaz na stránku', () => {
  it('before chybí nebo je celé nezáporné číslo, jinak neplatný', () => {
    expect(parseChronicleAsk({ villageId: 'x' })).toEqual({ before: null });
    expect(parseChronicleAsk({ villageId: 'x', before: null })).toEqual({ before: null });
    expect(parseChronicleAsk({ villageId: 'x', before: 512 })).toEqual({ before: 512 });
    expect(parseChronicleAsk({ villageId: 'x', before: 1.5 })).toBeNull();
    expect(parseChronicleAsk({ villageId: 'x', before: '512' })).toBeNull();
    expect(parseChronicleAsk(null)).toBeNull();
  });
});
