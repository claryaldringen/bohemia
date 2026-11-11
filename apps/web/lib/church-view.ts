// Kostely pro scénu a panel (churches.md – Scéna, Stavba): typy odvozené z jádra, bez vlastních
// rozměrů a čísel.
import {
  churchBlocked,
  churchCapacity,
  churchProgress,
  churchStartProblem,
  churchTypesFor,
  churchWorkProgress,
  churchyardGraves,
  type Church,
  type ChurchDims,
  type ChurchSite,
  type ChurchType,
  type ChurchWork,
  type MasonCraft,
  type MasonryCircle,
  type Position,
  type VillageState,
} from '@bohemia/game';

/** Postup stavby po fázích, 0–1 (základy, zdi, střecha, výzdoba). */
export interface SceneChurchProgress {
  foundation: number;
  walls: number;
  roof: number;
  decor: number;
}

/** Kostel ke kreslení – hotový i staveniště. */
export interface SceneChurch {
  id: number;
  type: ChurchType;
  dims: ChurchDims;
  /** Střed hlavní lodi; `rotation` = směr osy vstup → kněžiště. */
  position: Position;
  progress: SceneChurchProgress;
  /** Omítnutý (výzdoba hotová); jinak holý kámen. */
  decorated: boolean;
}

const DONE: SceneChurchProgress = { foundation: 1, walls: 1, roof: 1, decor: 1 };

/** Postup po tisícinách – scéna kostel přestaví jen při viditelné změně. */
const thousandths = (n: number): number => Math.round(n * 1000) / 1000;

/** Dostavěný kostel vsi pro scénu: vše hotové, omítnutý podle `decoratedDay`. */
export function sceneChurchOf(church: Church): SceneChurch {
  const decorated = church.decoratedDay !== undefined;
  return {
    id: church.id,
    type: church.type,
    dims: church.dims,
    position: church.position,
    progress: { ...DONE, decor: decorated ? 1 : 0 },
    decorated,
  };
}

/** Staveniště kostela pro scénu – postup z hotové práce (`churchProgress`). */
export function sceneChurchSiteOf(id: number, site: ChurchSite, position: Position): SceneChurch {
  const p = churchProgress(site);
  return {
    id,
    type: site.type,
    dims: site.dims,
    position,
    progress: {
      foundation: thousandths(p.foundation),
      walls: thousandths(p.walls),
      roof: thousandths(p.roof),
      decor: thousandths(p.decor),
    },
    decorated: false,
  };
}

/** Staveniště kostelů vsi (stavba i výzdoba po střeše). */
function churchSites(
  state: Pick<VillageState, 'constructions'>,
): { id: number; site: ChurchSite; position: Position }[] {
  return state.constructions.flatMap((c) =>
    c.kind === 'church' && c.church && c.position
      ? [{ id: c.id, site: c.church, position: c.position }]
      : [],
  );
}

/**
 * Kostely vsi pro scénu: staveniště podle postupu a dostavěné kostely (po střeše má kostel stejné
 * id jako staveniště výzdoby – kreslí se jednou, podle staveniště). Ves bez kostela – prázdný seznam.
 */
export function sceneChurches(
  state: Pick<VillageState, 'churches' | 'constructions'>,
): SceneChurch[] {
  const sites = churchSites(state);
  const siteIds = new Set(sites.map((s) => s.id));
  return [
    ...(state.churches ?? []).filter((c) => !siteIds.has(c.id)).map(sceneChurchOf),
    ...sites.map((s) => sceneChurchSiteOf(s.id, s.site, s.position)),
  ];
}

/** Kostel nebo staveniště kostela pro panel výběru (churches.md – Stavba, Co kostel dává). */
export interface VillageChurch {
  /** Id kostela = id stavby (vybírá se podle něj – `{ kind: 'church', id }`). */
  id: number;
  type: ChurchType;
  dims: ChurchDims;
  /** Střecha hotová – kostel slouží (je ve `VillageState.churches`). */
  built: boolean;
  /** Výzdoba hotová. */
  decorated: boolean;
  /** Staveniště ještě běží (stavba, nebo výzdoba po střeše). */
  site?: {
    /** Postup po druzích práce 0–1 (`churchWorkProgress`, po tisícinách). */
    work: Record<ChurchWork, number>;
    /** Obor, jehož mistr chybí – práce stojí (`churchBlocked`); bez údaje se staví. */
    blocked?: MasonCraft;
  };
  /** Kolik lidí se do lodí vejde (`churchCapacity`). */
  capacity: number;
  /** Hroby na hřbitůvku – obsazené a celkem (`churchyardGraves`). */
  graves: { used: number; total: number };
  /** Kněz kostela – je (true), nebo na cestě / chybí (false); jen dostavěný kostel. */
  priest?: boolean;
}

/** Kostely a staveniště kostelů pro panel výběru; ves bez kostela bez údaje. */
export function churchesOf(state: VillageState): { churches?: VillageChurch[] } {
  const sites = churchSites(state);
  const finished = state.churches ?? [];
  if (sites.length === 0 && finished.length === 0) return {};
  const byId = new Map(finished.map((c) => [c.id, c]));
  const ids = [...new Set([...finished.map((c) => c.id), ...sites.map((s) => s.id)])];
  const churches = ids.map((id): VillageChurch => {
    const church = byId.get(id);
    const site = sites.find((s) => s.id === id)?.site;
    const type = (church ?? site)!.type;
    const dims = (church ?? site)!.dims;
    const blocked = site ? churchBlocked(state, site) : null;
    const work = site ? churchWorkProgress(site) : null;
    return {
      id,
      type,
      dims,
      built: church !== undefined,
      decorated: church?.decoratedDay !== undefined,
      ...(site && work
        ? {
            site: {
              work: Object.fromEntries(
                Object.entries(work).map(([k, v]) => [k, thousandths(v)]),
              ) as Record<ChurchWork, number>,
              ...(blocked ? { blocked } : {}),
            },
          }
        : {}),
      capacity: churchCapacity(type, dims),
      graves: { used: church?.graves?.length ?? 0, total: churchyardGraves(type, dims) },
      ...(church ? { priest: church.priestId !== undefined } : {}),
    };
  });
  return { churches };
}

/** Kostel v nabídce staveb – malý a velký typ okruhu huti (churches.md – Typy podle okruhu huti). */
export type ChurchBuildKind = 'church-small' | 'church-large';

/** Malý a velký kostel nabídky staveb: typ podle okruhu huti a proč nejde začít (null = jde). */
export interface ChurchBuildChoice {
  kind: ChurchBuildKind;
  type: ChurchType;
  blocked: string | null;
}

/**
 * Kostely do nabídky staveb: typy okruhu huti (bez huti okruh `fallback` – tlačítka jen zašedlá
 * s důvodem `CHURCH_NO_LODGE`), důvod z `churchStartProblem` jako na serveru.
 */
export function churchBuildChoices(
  state: Pick<VillageState, 'people' | 'lodge' | 'quarries'>,
  fallback: MasonryCircle = 'adriatic',
): ChurchBuildChoice[] {
  const [small, large] = churchTypesFor(state.lodge?.circle ?? fallback);
  return [
    { kind: 'church-small', type: small, blocked: churchStartProblem(state, small) },
    { kind: 'church-large', type: large, blocked: churchStartProblem(state, large) },
  ];
}
