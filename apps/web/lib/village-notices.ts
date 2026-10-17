import { formatPercent } from './village-format';
import type { VillageView } from './village-view';

// Upozornění vsi pro hráče (population.md – Co hráč vidí): plná domácnost a jde stavět, ves
// hladoví, stavby stojí bez společné práce. Odvozují se z pohledu na ves; nově vzniklá se
// ukážou jako toast (jednou při změně stavu), trvající jako seznam v panelu vsi.

export type NoticeKind = 'can-build' | 'hungry' | 'stalled';

export interface VillageNotice {
  kind: NoticeKind;
  /** good = příležitost (jde stavět), warn = problém. */
  tone: 'good' | 'warn';
  title: string;
  text: string;
}

/** Upozornění, která pro ves právě platí (pořadí: problémy, pak příležitosti). */
export function villageNotices(view: VillageView): VillageNotice[] {
  const notices: VillageNotice[] = [];
  if (view.hungry) {
    notices.push({
      kind: 'hungry',
      tone: 'warn',
      title: 'Ves hladoví',
      text: `Zásoby nevystačí do sklizně – nasycení ${formatPercent(view.satiation)}. Ves potřebuje víc pole.`,
    });
  }
  if (view.constructionsStalled) {
    notices.push({
      kind: 'stalled',
      tone: 'warn',
      title: 'Stavby stojí',
      text: 'Na stavby nezbývá žádná společná práce – lidé mají dost práce s poli a domácností.',
    });
  }
  if (view.canBuildDwelling.ok) {
    notices.push({
      kind: 'can-build',
      tone: 'good',
      title: 'Domácnost je plná',
      text: 'Ves může postavit nové obydlí – Zemnici nebo Polozemnici najdeš v nabídce staveb.',
    });
  }
  return notices;
}

/**
 * Upozornění, která mezi dvěma pohledy na ves nově vznikla (dřív neplatila). Bez předchozího
 * pohledu (první načtení) žádná – trvající stav ukazuje panel.
 */
export function newNotices(previous: VillageView | null, next: VillageView): VillageNotice[] {
  if (previous === null) return [];
  const before = new Set(villageNotices(previous).map((n) => n.kind));
  return villageNotices(next).filter((n) => !before.has(n.kind));
}
