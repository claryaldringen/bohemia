// Milíř uhlíře v pohledu na ves (docs/design/crafts.md – Milíř u skácených buků; Martin 20. 10. 2026:
// „Vyčleň milíř jako samostatnou stavbu.“): co ukáže panel výběru milíře nebo milířiště – fáze
// a její průběh, uhlí v milíři, kdo sem dnes chodí pro uhlí (syn kováře s věkem, kovář, vůz se
// sedlákem), jak daleko je to ze zemnice uhlíře a z kovárny. Žádná nová pravidla – jen data ze
// stavu vsi a rozdělení práce posledního dne. Čistý modul – smí i do prohlížeče.
import {
  kilnCharcoalKg,
  kilnCharcoalShare,
  kilnPoint,
  kilnRemnantOvergrowth,
  kilnYieldKg,
  laborReport,
  smithHead,
  workshopKilns,
  CHARCOAL_KILN,
  type CharcoalKiln,
  type KilnStage,
  type LaborShare,
  type VillageState,
} from '@bohemia/game';

/**
 * Kdo z dvojice u tyče (workshops.md – Uhlíř, odnos na tyči): uhlíř a jeho syn, kovář nebo syn
 * kováře.
 */
export type KilnFetcherRole = 'burner' | 'burner-son' | 'smith' | 'smith-son';

/** Kdo dnes nosí uhlí od milíře do kovárny na tyči (věk v letech). */
export interface KilnFetcher {
  age: number;
  role: KilnFetcherRole;
}

/** Pořadí v panelu: uhlíř, jeho syn, kovář, syn kováře. */
const FETCHER_ORDER: readonly KilnFetcherRole[] = ['burner', 'burner-son', 'smith', 'smith-son'];

/** Milíř nebo milířiště pro panel výběru (crafts.md – Milíř u skácených buků). */
export interface VillageKiln {
  /** Id milíře – vybírá se podle něj (`{ kind: 'kiln', id }`). */
  id: number;
  /** Dílna uhlíře (id obydlí) – tlačítko „uhlíř“ ji vybere. */
  burnerId: number;
  /**
   * Fáze milíře (kácení a příprava dřeva, stavba, pálení, rozebírání); `remnant` = milířiště po
   * rozebraném milíři.
   */
  stage: KilnStage | 'remnant';
  /** Průběh fáze 0–1 (po setinách); u milířiště, jak zarostlo. */
  progress: number;
  /** Buky dávky – připravené a všechny (u milířiště 0). */
  prepared: number;
  trees: number;
  /** Uhlí, které ve vypáleném milíři zbývá, a kolik dá celý milíř (kg, po celých). */
  charcoalKg: number;
  yieldKg: number;
  /** Chůze ze zemnice uhlíře k milíři (m, po celých). */
  burnerWalkM: number;
  /** Chůze z kovárny, odkud se sem chodí pro uhlí (m, po celých – po prvním nošení); jinak null. */
  smithWalkM: number | null;
  /** Kdo sem dnes chodí pro uhlí pěšky (kovář první, pak synové od nejstaršího). */
  fetchers: KilnFetcher[];
  /** Dnes pro uhlí přijel vůz se sedlákem. */
  cart: boolean;
  /** Uhlíř tu dnes pracoval (kácení buků dávky, stavba, hlídání, vytahání). */
  burnerHere: boolean;
}

/**
 * Milíře a milířiště uhlířů vsi v den `day` – milíře v pořadí dílen a začátku, pak milířiště.
 * Kdo sem chodí, je z rozdělení práce dne `day` (jiný den – nikdo). Milíř bez polohy (ves bez
 * vrstvy překážek) se neukazuje.
 */
export function kilnViews(state: VillageState, day: number): VillageKiln[] {
  const labor = laborReport(state);
  const shares = labor?.day === day ? labor.shares : [];
  const kilns = state.dwellings.flatMap((d): VillageKiln[] =>
    workshopKilns(d.workshop).flatMap((kiln): VillageKiln[] => {
      if (!kiln.site || kiln.id === undefined) return [];
      const here = shares.filter(
        (s) => s.target.kind === 'kiln' && s.target.id === d.id && s.target.kiln === kiln.id,
      );
      // kácení buků dávky jde k bukům (cíl `trees`) – i to je práce uhlíře u milíře
      const beeches = new Set(kiln.trees.flatMap((t) => (t.id === null ? [] : [t.id])));
      const felling = shares.some(
        (s) =>
          s.activity === 'fell' &&
          s.target.kind === 'trees' &&
          s.target.ids.some((id) => beeches.has(id)),
      );
      const at = kilnPoint(d, kiln);
      return [
        {
          id: kiln.id,
          burnerId: d.id,
          stage: kiln.stage,
          progress: Math.round(kilnProgress(kiln) * 100) / 100,
          prepared: kiln.prepared,
          trees: kiln.trees.length,
          charcoalKg: Math.round(kilnCharcoalKg(kiln)),
          yieldKg: Math.round(kilnYieldKg(kiln)),
          burnerWalkM: Math.round(
            kiln.walkM ?? Math.hypot(at.x - d.position.x, at.z - d.position.z),
          ),
          smithWalkM: kiln.carry ? Math.round(kiln.carry.walkM) : null,
          fetchers: kilnFetchers(state, day, here),
          cart: here.some((s) => s.activity === 'haul'),
          burnerHere: felling || here.some((s) => s.activity === 'craft'),
        },
      ];
    }),
  );
  const remnants = (state.kilnRemnants ?? []).map((r): VillageKiln => ({
    id: r.id,
    burnerId: r.burnerId,
    stage: 'remnant',
    progress: Math.round(kilnRemnantOvergrowth(r, day) * 100) / 100,
    prepared: 0,
    trees: 0,
    charcoalKg: 0,
    yieldKg: 0,
    burnerWalkM: burnerWalk(state, r.burnerId, r),
    smithWalkM: null,
    fetchers: [],
    cart: false,
    burnerHere: false,
  }));
  return [...kilns, ...remnants];
}

/** Průběh fáze milíře 0–1 – jako panel dílny (summary.ts). */
function kilnProgress(kiln: CharcoalKiln): number {
  const n = kiln.trees.length;
  if (kiln.stage === 'wood') return n > 0 ? kiln.prepared / n : 1;
  if (kiln.stage === 'draw') return 1 - kilnCharcoalShare(kiln);
  const total =
    kiln.stage === 'burn' ? CHARCOAL_KILN.burnDays : CHARCOAL_KILN.buildManDaysPerTree * n;
  return total > 0 ? Math.min(1, Math.max(0, kiln.done / total)) : 1;
}

/** Vzdálenost milířiště od zemnice uhlíře (m, po celých – vzdušně); bez dílny 0. */
function burnerWalk(state: VillageState, burnerId: number, at: { x: number; z: number }): number {
  const burner = state.dwellings.find((d) => d.id === burnerId);
  if (!burner) return 0;
  return Math.round(Math.hypot(at.x - burner.position.x, at.z - burner.position.z));
}

/**
 * Dvojice z podílů nošení uhlí od milíře (`LaborShare.ages`: uhlíř, pak druhý u tyče; `pole` říká,
 * kdo to je). Podíl bez `pole` (dřívější nošení pěšky) nese kovář podle věku hlavy kovárny
 * (`smithHead`), jinak jeho syn.
 */
function kilnFetchers(
  state: VillageState,
  day: number,
  shares: readonly LaborShare[],
): KilnFetcher[] {
  const out: KilnFetcher[] = [];
  const add = (age: number, role: KilnFetcherRole): void => {
    if (!out.some((w) => w.age === age && w.role === role)) out.push({ age, role });
  };
  for (const share of shares) {
    if (share.activity !== 'fetch' || share.carts || share.target.kind !== 'kiln') continue;
    const from = share.target.from;
    if (from === undefined) continue;
    const ages = share.ages ?? [];
    if (share.pole !== undefined) {
      if (ages[0] !== undefined) add(ages[0], 'burner');
      if (ages[1] !== undefined) add(ages[1], share.pole);
      continue;
    }
    const headAge = smithHead(
      state.people.filter((p) => p.dwellingId === from),
      day,
    )?.age;
    for (const age of ages) add(age, age === headAge ? 'smith' : 'smith-son');
  }
  return out.sort(
    (a, b) => FETCHER_ORDER.indexOf(a.role) - FETCHER_ORDER.indexOf(b.role) || b.age - a.age,
  );
}

/** Milíře a milířiště pro `VillageView.kilns` – bez nich pole chybí. */
export function kilnsField(state: VillageState, day: number): { kilns?: VillageKiln[] } {
  const kilns = kilnViews(state, day);
  return kilns.length > 0 ? { kilns } : {};
}
