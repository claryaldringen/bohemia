import { CATTLE_GOODS } from '../village/trade/neighbours';
import type { CattleGood } from '../village/types';
import type { MacroGoods } from './macro';

// Rozdělení jídla domény mezi vsi, kterým chybí (hillfort.md – Jídlo domény; Martin 8. 11. 2026:
// „rovnoměrně“, obilí a dobytek, seno ne; algoritmus návrh Clauda). Čistá funkce bez I/O,
// výsledek nezávisí na pořadí vstupu (příjemci se řadí podle id). Napřed obilí, dobytek jen na to,
// co obilí nepokryje, po celých kusech.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

export type DomainOffer = Pick<MacroGoods, 'grainKg' | 'cattle'>;

export interface DomainRecipient {
  villageId: string;
  /** Kolik obilí vsi chybí (kg). */
  needKg: number;
}

export interface DomainDelivery {
  toVillageId: string;
  grainKg: number;
  cattle: Record<CattleGood, number>;
}

function noCattle(): Record<CattleGood, number> {
  return { cows: 0, youngOxen: 0, trainedOxen: 0 };
}

/**
 * Rozdělí nabídku mezi příjemce s `needKg > 0`: každá dostane stejný podíl `f` toho, co jí chybí
 * (`f = min(1, nabídka ÷ součet potřeb`, nabídka = obilí + kusy × `headKg`). Obilí se dělí
 * úměrně cíli (celé kg dolů), dobytek po kusech: kus dostane ves s největším nepokrytým zbytkem
 * cíle (shoda → nižší id), jen je-li zbytek aspoň půl kusu (`headKg ÷ 2`), jinak zůstane doma.
 * Vrací jen nenulové dodávky seřazené podle `toVillageId`.
 */
export function allocateDomainFood(
  offer: DomainOffer,
  recipients: readonly DomainRecipient[],
  headKg: number,
): DomainDelivery[] {
  const needy = recipients
    .filter((r) => r.needKg > 0)
    .sort((a, b) => (a.villageId < b.villageId ? -1 : a.villageId > b.villageId ? 1 : 0));
  const totalNeed = needy.reduce((sum, r) => sum + r.needKg, 0);
  const grainKg = Math.max(0, offer.grainKg);
  const heads = CATTLE_GOODS.reduce((sum, good) => sum + Math.max(0, offer.cattle[good]), 0);
  if (needy.length === 0 || totalNeed <= 0) return [];

  const supply = grainKg + heads * Math.max(0, headKg);
  const share = Math.min(1, supply / totalNeed);
  const targets = needy.map((r) => share * r.needKg);
  const totalTarget = targets.reduce((sum, t) => sum + t, 0);

  const grain = targets.map(() => 0);
  const given = Math.min(grainKg, totalTarget);
  if (given > 0 && totalTarget > 0) {
    for (let i = 0; i < needy.length; i++) {
      grain[i] = Math.floor(((targets[i] ?? 0) * given) / totalTarget + EPSILON);
    }
  }

  const cattle = needy.map(() => noCattle());
  const rest = targets.map((t, i) => t - (grain[i] ?? 0));
  if (headKg > 0) {
    for (const good of CATTLE_GOODS) {
      for (let n = Math.max(0, Math.floor(offer.cattle[good])); n > 0; n--) {
        let best = -1;
        for (let i = 0; i < needy.length; i++) {
          if (best < 0 || (rest[i] ?? 0) > (rest[best] ?? 0) + EPSILON) best = i;
        }
        if (best < 0 || (rest[best] ?? 0) < headKg / 2 - EPSILON) break;
        const target = cattle[best];
        if (target) target[good] += 1;
        rest[best] = (rest[best] ?? 0) - headKg;
      }
    }
  }

  const out: DomainDelivery[] = [];
  needy.forEach((r, i) => {
    const c = cattle[i] ?? noCattle();
    const g = grain[i] ?? 0;
    if (g > 0 || c.cows + c.youngOxen + c.trainedOxen > 0) {
      out.push({ toVillageId: r.villageId, grainKg: g, cattle: c });
    }
  });
  return out;
}
