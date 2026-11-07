// VÝVOJOVÝ NÁSTROJ – ukázka kování koní na /dev/landscape (bez databáze a simulace; horses.md –
// Kování, Ve scéně): v den kování jde kovář k brance ohrady koní a u kůlu kuje jezdecké koně jednoho
// po druhém. Vlastní kovář vychází z kovárny vsi, kovář ze sousední vsi přichází z kraje mapy
// (východně od vsi) a vrací se tam. Bez ohrady koní s jezdeckými koňmi si ji ukázka přinese
// (i kovárnu, lidi a práci dne) – bez hodin světa se den ukázky opakuje po 86,4 s (riders.ts).
import { tileCenterWorld, type Landscape } from '@bohemia/game';
import type { ScenePerson } from '@/lib/person-view';
import type { SceneLabor, SceneVillage } from '@/lib/village-view';

export type ShoeingDemoStage = 'own' | 'foreign';
export const SHOEING_DEMO_STAGES: Record<ShoeingDemoStage, string> = {
  own: 'vlastní kovář',
  foreign: 'kovář ze sousední vsi',
};

/** Další krok ukázky: vypnuto → vlastní kovář → cizí kovář → vypnuto. */
export function nextShoeingDemo(stage: ShoeingDemoStage | null): ShoeingDemoStage | null {
  if (stage === null) return 'own';
  if (stage === 'own') return 'foreign';
  return null;
}

/** Id ohrady, kovárny a kováře ukázky (mimo id vývojové vsi). */
const IDS = { pen: 9101, smithy: 9102, smith: 9103, folk: 9110 } as const;

/** Ves s kováním dne ukázky – vlastní, nebo cizí kovář. */
export function withShoeingDemo(
  village: SceneVillage,
  stage: ShoeingDemoStage | null,
  l: Landscape,
  day: number,
): SceneVillage {
  if (!stage) return village;
  const site = l.villageSite;
  const at = (dx: number, dy: number): { x: number; z: number } =>
    tileCenterWorld(l, site.x + dx, site.y + dy);
  const ridingPen = (village.pens ?? []).find(
    (p) => p.species === 'horse' && p.built && (p.horses ?? []).some((h) => h.kind === 'riding'),
  );
  const pens = [...(village.pens ?? [])];
  if (!ridingPen) {
    const p = at(4, -2);
    pens.push({
      id: IDS.pen,
      species: 'horse',
      cell: { x: site.x + 4, y: site.y - 2 },
      x: p.x,
      z: p.z,
      size: l.cellSizeM,
      built: true,
      progress: 1,
      oxen: 0,
      trainees: 0,
      cows: 0,
      horses: [
        { id: 1, kind: 'mare' },
        { id: 3, kind: 'riding' },
        { id: 4, kind: 'riding' },
      ],
    });
  }
  const pen = ridingPen ?? pens[pens.length - 1]!;
  const horses = (pen.horses ?? [])
    .filter((h) => h.kind === 'riding')
    .map((h) => ({ pen: pen.id, id: h.id }));
  const dwellings = [...village.dwellings];
  let smithy = dwellings.find((d) => d.built && d.craft === 'smith');
  if (stage === 'own' && !smithy) {
    const p = at(-2, 2);
    smithy = {
      id: IDS.smithy,
      type: 'polozemnice',
      position: { x: p.x, z: p.z, rotation: 0.3 },
      built: true,
      progress: 1,
      inhabited: true,
      craft: 'smith',
      working: true,
    };
    dwellings.push(smithy);
  }
  // obydlí pro lidi vsi (bez nich nejsou postavy) – v prázdné vsi aspoň jedno
  if (!dwellings.some((d) => d.built && !d.craft)) {
    const p = at(1, 1);
    dwellings.push({
      id: IDS.folk,
      type: 'zemnice',
      position: { x: p.x, z: p.z, rotation: 0 },
      built: true,
      progress: 1,
      inhabited: true,
    });
  }
  const smithPerson: ScenePerson[] =
    stage === 'own' && smithy
      ? [{ id: IDS.smith, age: 38, sex: 'male', home: smithy.id, role: 'smith' }]
      : [];
  const base: SceneLabor = village.labor ?? {
    day,
    month: 6,
    people: { children: 0, adults: 2, elders: 0 },
    shares: [{ activity: 'domestic', target: { kind: 'village' }, manDays: 1 }],
  };
  const center = at(0, 0);
  const half = (l.size * l.cellSizeM) / 2;
  return {
    ...village,
    dwellings,
    pens,
    labor: {
      ...base,
      shares: [
        ...base.shares.filter((s) => s.activity !== 'horse-shoeing'),
        ...(stage === 'own'
          ? [
              {
                activity: 'horse-shoeing' as const,
                target: { kind: 'pen' as const, id: pen.id },
                manDays: 0.5,
              },
            ]
          : []),
      ],
      persons: [...(base.persons ?? []), ...smithPerson],
      shoeing: {
        day: base.day,
        own: stage === 'own',
        horses,
        // cizí kovář jde krajinou od vsi ke kraji mapy na východě (jako nákup u sousedů)
        ...(stage === 'foreign' ? { line: [center, { x: half - 1, z: center.z }] } : {}),
      },
    },
  };
}
