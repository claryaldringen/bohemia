import type { VillageView } from './village-view';

// Upozornění vsi (population.md – Co hráč vidí): plná domácnost, ves hladoví, stavby stojí.
// Odvozují se z pohledu na ves a ukážou se jednou, když nově vzniknou – jako krátký mizející
// řádek nahoře uprostřed (jako oznámení v 0 A.D.). Jen fakt, žádná rada.

export type NoticeKind = 'full-household' | 'hungry' | 'stalled';

export interface VillageNotice {
  kind: NoticeKind;
  /** info = zpráva, warn = problém. */
  tone: 'info' | 'warn';
  text: string;
}

/** Upozornění, která pro ves právě platí (pořadí: problémy, pak zprávy). */
export function villageNotices(view: VillageView): VillageNotice[] {
  const notices: VillageNotice[] = [];
  if (view.hungry) notices.push({ kind: 'hungry', tone: 'warn', text: 'Ves hladoví' });
  if (view.constructionsStalled) {
    notices.push({ kind: 'stalled', tone: 'warn', text: 'Stavby stojí' });
  }
  if (view.fullHousehold) {
    notices.push({ kind: 'full-household', tone: 'info', text: 'Domácnost je plná' });
  }
  return notices;
}

/**
 * Upozornění, která mezi dvěma pohledy na ves nově vznikla (dřív neplatila). Bez předchozího
 * pohledu (první načtení) žádná.
 */
export function newNotices(previous: VillageView | null, next: VillageView): VillageNotice[] {
  if (previous === null) return [];
  const before = new Set(villageNotices(previous).map((n) => n.kind));
  return villageNotices(next).filter((n) => !before.has(n.kind));
}
