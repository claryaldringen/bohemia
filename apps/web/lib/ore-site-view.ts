// Rudiště kováře v pohledu na ves (docs/design/crafts.md – Uhlí a ruda kováře, Co hráč vidí;
// Martin 20. 10. 2026: „Půjde rudiště také označit?“): co ukáže panel výběru rudiště – kolik rudy
// v ložisku zbývá, hromada u jámy, zásoba v kovárně, cesta z kovárny, jámy a kdo tu dnes kope
// a nosí (kovář, synové, vůz se sedlákem). Žádná nová pravidla – jen data ze stavu vsi a rozdělení
// práce posledního dne. Čistý modul – smí i do prohlížeče.
import {
  SMITH_SUPPLY,
  depositLeftKg,
  laborReport,
  smithHead,
  type LaborShare,
  type VillageState,
} from '@bohemia/game';
import { oreSitePits } from './scene/ore-site-layout';

/** Kdo dnes na rudišti pracuje – kovář, nebo jeho syn (věk v letech) a co dělá. */
export interface OreSiteWorker {
  age: number;
  /** Kovář (hlava kovárny); jinak jeho syn. */
  smith: boolean;
  /** Kope rudu u jámy. */
  digs: boolean;
  /** Nosí rudu v koších do kovárny. */
  carries: boolean;
  /** Jede s vozem pro rudu (naloží hromadu u jámy). */
  rides: boolean;
}

/** Rudiště kovárny pro panel výběru (crafts.md – Uhlí a ruda kováře). */
export interface VillageOreSite {
  /** Kovárna (id obydlí) – rudiště se vybírá podle ní (`{ kind: 'ore-site', id }`). */
  smithId: number;
  /** Kolik rudy z ložiska zbývá a kolik ho bylo (kg, po celých). */
  leftKg: number;
  depositKg: number;
  /** Vykopaná ruda na hromadě u jámy (kg, po celých) – čeká na odnos nebo vůz. */
  heapKg: number;
  /** Zásoba rudy v kovárně (kg, po celých). */
  stockKg: number;
  /** Cesta z kovárny (m, po celých). */
  walkM: number;
  /** Jámy u rudiště (i zarůstající – po SMITH_SUPPLY.pitYears zmizí). */
  pits: number;
  /** Kdo tu dnes pracuje – kovář první, pak synové od nejstaršího; nikdo = prázdné. */
  workers: OreSiteWorker[];
  /** Dnes pro rudu přijel vůz se sedlákem. */
  cart: boolean;
}

/**
 * Rudiště kováren vsi v den `day` (obývané i prázdné kovárny s vybraným místem – jako scéna).
 * Kdo tu pracuje, je z rozdělení práce dne `day` (jiný den – nikdo).
 */
export function oreSiteViews(state: VillageState, day: number): VillageOreSite[] {
  const labor = laborReport(state);
  const shares = labor?.day === day ? labor.shares : [];
  return state.dwellings.flatMap((d): VillageOreSite[] => {
    const workshop = d.workshop;
    const site = workshop?.craft === 'smith' ? workshop.oreSite : null;
    if (!workshop || !site) return [];
    const here = shares.filter((s) => s.target.kind === 'ore' && s.target.id === d.id);
    return [
      {
        smithId: d.id,
        leftKg: Math.round(depositLeftKg(site)),
        depositKg: SMITH_SUPPLY.depositKg,
        heapKg: Math.round(workshop.oreBatch?.heap ?? 0),
        stockKg: Math.round(workshop.oreKg ?? 0),
        walkM: Math.round(site.walkM),
        pits: oreSitePits(site, state.orePits).length,
        workers: oreWorkers(state, d.id, day, here),
        cart: here.some((s) => s.activity === 'haul'),
      },
    ];
  });
}

/**
 * Lidé z podílů práce na rudišti (věky – `LaborShare.ages`): kopání (`ore`), nošení v koších
 * (`fetch`) a jízda s vozem (`fetch` s vozem); kovář podle věku hlavy kovárny (`smithHead`).
 */
function oreWorkers(
  state: VillageState,
  smithId: number,
  day: number,
  shares: readonly LaborShare[],
): OreSiteWorker[] {
  const headAge = smithHead(
    state.people.filter((p) => p.dwellingId === smithId),
    day,
  )?.age;
  const workers: OreSiteWorker[] = [];
  for (const share of shares) {
    if (share.activity !== 'ore' && share.activity !== 'fetch') continue;
    for (const age of share.ages ?? []) {
      const smith = age === headAge;
      let worker = workers.find((w) => w.age === age && w.smith === smith);
      if (!worker) {
        worker = { age, smith, digs: false, carries: false, rides: false };
        workers.push(worker);
      }
      if (share.activity === 'ore') worker.digs = true;
      else if (share.carts) worker.rides = true;
      else worker.carries = true;
    }
  }
  return workers.sort((a, b) => Number(b.smith) - Number(a.smith) || b.age - a.age);
}

/** Rudiště pro `VillageView.oreSites` – bez rudiště pole chybí. */
export function oreSitesField(state: VillageState, day: number): { oreSites?: VillageOreSite[] } {
  const oreSites = oreSiteViews(state, day);
  return oreSites.length > 0 ? { oreSites } : {};
}
