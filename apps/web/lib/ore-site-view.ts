// Rudiště kováře a hliniště hrnčíře v pohledu na ves (docs/design/crafts.md – Uhlí a ruda kováře,
// Co hráč vidí, Hlína hrnčíře; Martin 20. 10. 2026: „Půjde rudiště také označit?“): co ukáže panel
// výběru místa, kde dílna kope – kolik suroviny v ložisku zbývá, hromada u jámy, zásoba v dílně,
// cesta z dílny, jámy a kdo tu dnes kope a nosí (řemeslník, synové, vůz se sedlákem). Žádná nová
// pravidla – jen data ze stavu vsi a rozdělení práce posledního dne. Čistý modul – smí i do
// prohlížeče.
import {
  CLAY,
  SMITH_SUPPLY,
  depositLeftKg,
  laborReport,
  smithHead,
  type Craft,
  type DugMaterial,
  type LaborShare,
  type OreBatch,
  type OreSite,
  type VillageState,
  type Workshop,
} from '@bohemia/game';
import { dugSitePits } from './scene/ore-site-layout';

/** Kdo dnes na rudišti či hliništi pracuje – řemeslník, nebo jeho syn (věk v letech) a co dělá. */
export interface DugSiteWorker {
  age: number;
  /** Řemeslník (hlava dílny – kovář, hrnčíř); jinak jeho syn. */
  craftsman: boolean;
  /** Kope u jámy. */
  digs: boolean;
  /** Nosí v koších do dílny. */
  carries: boolean;
  /** Jede s vozem (naloží hromadu u jámy). */
  rides: boolean;
}

/** Rudiště kovárny nebo hliniště hrnčíře pro panel výběru (crafts.md). */
export interface VillageDugSite {
  /** Dílna (id obydlí) – místo se vybírá podle ní (`{ kind: 'ore-site' | 'clay-site', id }`). */
  workshopId: number;
  /** Kolik suroviny z ložiska zbývá a kolik ho bylo (kg, po celých). */
  leftKg: number;
  depositKg: number;
  /** Vykopaná surovina na hromadě u jámy (kg, po celých) – čeká na odnos nebo vůz. */
  heapKg: number;
  /** Zásoba suroviny v dílně (kg, po celých). */
  stockKg: number;
  /** Cesta z dílny (m, po celých). */
  walkM: number;
  /** Jámy u místa (i zarůstající – po SMITH_SUPPLY.pitYears zmizí). */
  pits: number;
  /** Kdo tu dnes pracuje – řemeslník první, pak synové od nejstaršího; nikdo = prázdné. */
  workers: DugSiteWorker[];
  /** Dnes pro surovinu přijel vůz se sedlákem. */
  cart: boolean;
}

/** Kde dílna drží místo, dávku a zásobu suroviny a jak velké je ložisko. */
const DUG: Record<
  DugMaterial,
  {
    craft: Craft;
    site: (w: Workshop) => OreSite | null | undefined;
    batch: (w: Workshop) => OreBatch | null | undefined;
    stock: (w: Workshop) => number | undefined;
    depositKg: number;
  }
> = {
  ore: {
    craft: 'smith',
    site: (w) => w.oreSite,
    batch: (w) => w.oreBatch,
    stock: (w) => w.oreKg,
    depositKg: SMITH_SUPPLY.depositKg,
  },
  clay: {
    craft: 'potter',
    site: (w) => w.claySite,
    batch: (w) => w.clayBatch,
    stock: (w) => w.clayKg,
    depositKg: CLAY.depositKg,
  },
};

/**
 * Místa dílen vsi, kde se kope surovina `material` (rudiště kováren, hliniště hrnčířů), v den
 * `day` – obývané i prázdné dílny s vybraným místem (jako scéna). Kdo tu pracuje, je z rozdělení
 * práce dne `day` (jiný den – nikdo).
 */
export function dugSiteViews(
  state: VillageState,
  day: number,
  material: DugMaterial,
): VillageDugSite[] {
  const spec = DUG[material];
  const labor = laborReport(state);
  const shares = labor?.day === day ? labor.shares : [];
  return state.dwellings.flatMap((d): VillageDugSite[] => {
    const workshop = d.workshop;
    const site = workshop?.craft === spec.craft ? spec.site(workshop) : null;
    if (!workshop || !site) return [];
    const here = shares.filter((s) => s.target.kind === material && s.target.id === d.id);
    return [
      {
        workshopId: d.id,
        leftKg: Math.round(depositLeftKg(site, material)),
        depositKg: spec.depositKg,
        heapKg: Math.round(spec.batch(workshop)?.heap ?? 0),
        stockKg: Math.round(spec.stock(workshop) ?? 0),
        walkM: Math.round(site.walkM),
        pits: dugSitePits(site, state.orePits, material === 'clay').length,
        workers: dugWorkers(state, d.id, day, material, here),
        cart: here.some((s) => s.activity === 'haul'),
      },
    ];
  });
}

/**
 * Lidé z podílů práce na místě (věky – `LaborShare.ages`): kopání (činnost `ore` / `clay`),
 * nošení v koších (`fetch`) a jízda s vozem (`fetch` s vozem); řemeslník podle věku hlavy dílny
 * (`smithHead`).
 */
function dugWorkers(
  state: VillageState,
  workshopId: number,
  day: number,
  material: DugMaterial,
  shares: readonly LaborShare[],
): DugSiteWorker[] {
  const headAge = smithHead(
    state.people.filter((p) => p.dwellingId === workshopId),
    day,
  )?.age;
  const workers: DugSiteWorker[] = [];
  for (const share of shares) {
    if (share.activity !== material && share.activity !== 'fetch') continue;
    for (const age of share.ages ?? []) {
      const craftsman = age === headAge;
      let worker = workers.find((w) => w.age === age && w.craftsman === craftsman);
      if (!worker) {
        worker = { age, craftsman, digs: false, carries: false, rides: false };
        workers.push(worker);
      }
      if (share.activity === material) worker.digs = true;
      else if (share.carts) worker.rides = true;
      else worker.carries = true;
    }
  }
  return workers.sort((a, b) => Number(b.craftsman) - Number(a.craftsman) || b.age - a.age);
}

/**
 * Rudiště a hliniště pro `VillageView.oreSites` / `claySites` – bez míst pole chybí.
 */
export function dugSitesField(
  state: VillageState,
  day: number,
): { oreSites?: VillageDugSite[]; claySites?: VillageDugSite[] } {
  const oreSites = dugSiteViews(state, day, 'ore');
  const claySites = dugSiteViews(state, day, 'clay');
  return {
    ...(oreSites.length > 0 ? { oreSites } : {}),
    ...(claySites.length > 0 ? { claySites } : {}),
  };
}
