// Kdo je která postava (docs/design/villagers.md – Výběr postavy; Martin 20. 10. 2026: „Jak moc
// náročné by bylo moci označit jednotlivé lidi ve vsi a vidět, co zrovna dělají?“): lidé vsi
// (`SceneLabor.persons`) se rozdělí mezi postavy dne – každá postava je jeden skutečný člověk,
// nikdo není ve dvou postavách naráz. Čistý modul bez Babylonu – villager-plan.ts se ptá při
// rozmísťování postav (jednou za herní den, nikdy za snímek). Pořadí lidí je los ze seedu vsi
// a id člověka, stejný napříč dny (villagers.md – Činnosti od začátku do konce: herec je člověk
// napříč dny) – při podobném rozdělení práce dělá tentýž člověk totéž a dvě činnosti různých dnů
// se na jednom místě nesejdou; mění se jen se změnou práce dne.
import { AGE, type CartJob, type Sex } from '@bohemia/game';
import type { ScenePerson } from '../person-view';
import type { LaborActivity, LaborTarget, SceneExpedition } from '../village-view';
import type { TrafficKind } from './road-traffic';
import { hash01 } from './smoke-schedule';

/**
 * Co postava dělá (jen data – text činnosti skládá person-activity.ts): podíl práce dne (činnost
 * a místo z jádra), cesta pro vodu, dřevo, na pole či k milíři, nošení uhlí, rudy a hlíny kováři
 * a hrnčíři, pasení (stádo `herd` ve scéně), starší u domu, karavana (výprava, nákup, kování)
 * a pohřeb.
 */
export type PersonJob =
  | { kind: 'share'; activity: LaborActivity; target: LaborTarget; job?: CartJob }
  | { kind: 'traffic'; traffic: TrafficKind }
  | { kind: 'fetch'; goods: 'charcoal' | 'ore' | 'clay' }
  | { kind: 'herd'; herd: number }
  | { kind: 'elder' }
  | { kind: 'caravan'; trip: SceneExpedition['trip'] | null; porter: boolean }
  | { kind: 'funeral'; bearer: boolean }
  /**
   * Svatba (kinship.md – Svatba ve scéně): nevěsta, ženich, nebo svatebčan – hudebník s píšťalou
   * či bubnem (`music`, wedding-plan.ts).
   */
  | { kind: 'wedding'; role: 'bride' | 'groom' | 'guest'; music?: 'pipe' | 'drum' }
  /**
   * U spřežení s rádlem (oxen.md – Spřežení postupuje s orbou): oráč u rukojeti, nebo honák
   * s provazem; `team` = pořadí spřežení dne (plough-team-renderer.ts). Postavu kreslí spřežení.
   */
  | { kind: 'plough'; team: number; role: 'ploughman' | 'leader' }
  /** Vozka u vozu (wagons.md – Vozy se spřežením): `cart` = id vozu. Postavu kreslí vůz. */
  | { kind: 'cart'; cart: number }
  /**
   * Vojvodova rodina (lord.md – Ve scéně): muž či chlapec na cvičišti (co právě cvičí, říká úsek
   * pózy – `bow` / `combat`), nebo žena rodiny u dvorce (`household`).
   */
  | { kind: 'lord'; household: boolean }
  /** Dítě s řehtačkou na hlídaném dílu (wildlife.md – Noční hlídka; jen zobrazení). */
  | { kind: 'watch' }
  /** Řetěz s vědry v den požáru (disasters.md – Hašení – řetěz s vědry). */
  | { kind: 'fire' };

/** Koho postava chce – věk, domácnost, pohlaví. */
export interface PersonRequest {
  /** Věk od – do (roky, `to` už ne). */
  from: number;
  to: number;
  /** Jen z těchto domácností (id obydlí) – i z dílen, které dnes pracují. */
  homes?: ReadonlySet<number>;
  /** Přednostně z této domácnosti (jinak odjinud). */
  preferHome?: number;
  /** Přednostně toto pohlaví (jinak druhé). */
  sex?: Sex;
  /** Jen toto pohlaví (nosiči már). */
  onlySex?: Sex;
  /** Co nejbližší věk (nosiči kováře – `LaborShare.ages`). */
  age?: number;
  /**
   * Lehčí polní práce se vsí (setí, okopávání, žně, výmlat – `LIGHT_LABOR_TASKS`): smí ji dělat
   * i žena z domácnosti dílny, která dnes pracuje v dílně (crafts.md – Kdo dělá řemeslo).
   */
  light?: boolean;
}

/** Dospělí 14–44 let (věkové skupiny jádra – AGE). */
export const ADULTS: Pick<PersonRequest, 'from' | 'to'> = { from: AGE.adult, to: AGE.elder };
/** Výrostci 7–13 let – pasou (diet.md – Pasáci), chodí pro vodu. */
export const YOUNGSTERS: Pick<PersonRequest, 'from' | 'to'> = {
  from: AGE.olderChild,
  to: AGE.adult,
};
/** Starší od 45 let. */
export const ELDERS: Pick<PersonRequest, 'from' | 'to'> = { from: AGE.elder, to: Infinity };

/**
 * Lidé dne k rozdělení mezi postavy. `busyHomes` = domácnosti dílen, které dnes pracují v dílně
 * (crafts.md) – jejich lidé jdou jen k práci své domácnosti (`homes`), do práce vsi ne.
 */
export class DayRoster {
  private readonly order: ScenePerson[];
  private readonly taken = new Set<number>();
  private readonly byId: Map<number, ScenePerson>;

  constructor(
    persons: readonly ScenePerson[],
    seed: number,
    private readonly busyHomes: ReadonlySet<number> = new Set(),
  ) {
    const salt = (seed * 31) | 0;
    this.order = persons
      .map((p) => ({ p, k: hash01(salt, p.id, 97) }))
      .sort((a, b) => a.k - b.k || a.p.id - b.p.id)
      .map(({ p }) => p);
    this.byId = new Map(persons.map((p) => [p.id, p]));
  }

  /** Člověk podle id, když ještě nemá postavu (průvod pohřbu, tesař na cestě pro kování). */
  takeId(id: number): ScenePerson | null {
    const p = this.byId.get(id);
    if (!p || this.taken.has(id)) return null;
    this.taken.add(id);
    return p;
  }

  /**
   * Volný člověk podle požadavku: napřed z preferované domácnosti, nejbližší věk, preferované
   * pohlaví, pak podle losu. Nikdo vhodný – null.
   */
  take(request: PersonRequest): ScenePerson | null {
    let best: ScenePerson | null = null;
    let bestScore = Infinity;
    for (const p of this.order) {
      if (this.taken.has(p.id) || p.age < request.from || p.age >= request.to) continue;
      if (request.onlySex && p.sex !== request.onlySex) continue;
      // ženy domácnosti, která dnes pracuje v dílně, dělají lehčí polní práce se vsí (crafts.md)
      if (
        request.homes
          ? !request.homes.has(p.home)
          : this.busyHomes.has(p.home) && !(request.light && p.sex === 'female')
      ) {
        continue;
      }
      // skóre: domácnost (×1000), věk (×10), pohlaví (×1) – menší je lepší; při shodě los
      const score =
        (request.preferHome !== undefined && p.home !== request.preferHome ? 1000 : 0) +
        (request.age !== undefined ? Math.min(99, Math.abs(p.age - request.age)) * 10 : 0) +
        (request.sex && p.sex !== request.sex ? 1 : 0);
      if (score < bestScore) {
        best = p;
        bestScore = score;
        if (score === 0) break;
      }
    }
    if (best) this.taken.add(best.id);
    return best;
  }

  /** Je v domácnosti `home` nějaký muž od 7 let (dnes volný i obsazený)? Kojenci nepočítají. */
  hasMen(home: number): boolean {
    for (const p of this.byId.values()) {
      if (p.home === home && p.sex === 'male' && p.age >= AGE.olderChild) return true;
    }
    return false;
  }

  /** Má domácnost `home` malé dítě (pod 7 let – AGE.olderChild; i kojence)? */
  hasSmallChild(home: number): boolean {
    for (const p of this.byId.values()) {
      if (p.home === home && p.age < AGE.olderChild) return true;
    }
    return false;
  }

  /** Člověk zase volný – jeho postava nakonec není (nevyšlo jí místo). */
  release(id: number): void {
    this.taken.delete(id);
  }

  /** Domácnost dílny, která dnes pracuje v dílně (`busyHomes`)? */
  busy(home: number): boolean {
    return this.busyHomes.has(home);
  }

  /** Má člověk dnes postavu? */
  has(id: number): boolean {
    return this.taken.has(id);
  }
}
