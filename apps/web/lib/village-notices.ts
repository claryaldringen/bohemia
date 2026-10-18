import type { VillageView } from './village-view';

// Upozornění vsi (population.md – Co hráč vidí): plná domácnost, ves hladoví, lidé umírají hlady
// (Hlad a vymření), stavby stojí, hřbitov je plný (cemetery.md), vesničané ušetřili posvátný dub
// nebo dubový háj (happiness.md – jen když přibude), kovář nemá uhlí a dílna nemá co kácet
// (crafts.md), svatba mezi domy (population.md – Sňatky mezi domy, když přibude). Vymřelá ves
// žádná nemá.
// Odvozují se z pohledu na ves a ukážou se jednou, když nově vzniknou – jako krátký mizející
// řádek nahoře uprostřed (jako oznámení v 0 A.D.). Jen fakt, žádná rada.

export type NoticeKind =
  | 'full-household'
  | 'hungry'
  | 'starving'
  | 'stalled'
  | 'cemetery-full'
  | 'no-charcoal'
  | 'no-wood'
  | 'sacred-oak'
  | 'sacred-grove'
  | 'marriage';

export interface VillageNotice {
  kind: NoticeKind;
  /** info = zpráva, warn = problém. */
  tone: 'info' | 'warn';
  text: string;
}

/** Upozornění, která pro ves právě platí (pořadí: problémy, pak zprávy). */
export function villageNotices(view: VillageView): VillageNotice[] {
  const notices: VillageNotice[] = [];
  if (view.extinct) return notices;
  if (view.starving) notices.push({ kind: 'starving', tone: 'warn', text: 'Lidé umírají hlady' });
  if (view.hungry) notices.push({ kind: 'hungry', tone: 'warn', text: 'Ves hladoví' });
  if (view.constructionsStalled) {
    notices.push({ kind: 'stalled', tone: 'warn', text: 'Stavby stojí' });
  }
  // aspoň jeden hotový hřbitov a žádný hotový nemá volný hrob (rozestavěný mrtvé nepřijme)
  const built = view.cemeteries.filter((c) => c.built);
  if (built.length > 0 && built.every((c) => c.freeGraves === 0)) {
    notices.push({ kind: 'cemetery-full', tone: 'warn', text: 'Hřbitov je plný' });
  }
  // dílny bez vstupu stojí (crafts.md)
  if (view.crafts.workshops.some((w) => w.activity === 'no-charcoal')) {
    notices.push({ kind: 'no-charcoal', tone: 'warn', text: 'Kovář nemá uhlí' });
  }
  if (view.crafts.workshops.some((w) => w.activity === 'no-wood')) {
    notices.push({ kind: 'no-wood', tone: 'warn', text: 'Dílna nemá co kácet' });
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
  const notices = villageNotices(next).filter((n) => !before.has(n.kind));
  // posvátná místa vznikají jednou – fakt, když přibudou (happiness.md)
  if (next.sacred.oaks.length > previous.sacred.oaks.length) {
    notices.push({ kind: 'sacred-oak', tone: 'info', text: 'Vesničané ušetřili posvátný dub' });
  }
  if (next.sacred.groves.length > previous.sacred.groves.length) {
    notices.push({ kind: 'sacred-grove', tone: 'info', text: 'Vesničané ušetřili dubový háj' });
  }
  // svatba mezi domy – fakt, když od minulého pohledu přibude (population.md)
  const married = next.lastMarriageDay;
  if (!next.extinct && married !== null && married > (previous.lastMarriageDay ?? -Infinity)) {
    notices.push({ kind: 'marriage', tone: 'info', text: 'Svatba' });
  }
  return notices;
}
