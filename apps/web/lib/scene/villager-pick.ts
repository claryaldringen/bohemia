// Výběr postavy kliknutím (docs/design/villagers.md – Výběr postavy): nejbližší vidět postava
// člověka vsi ke kurzoru v obrazovce. Čisté funkce bez Babylonu – průmět bodu světa na plátno
// dodá scéna. Jen při kliknutí, O(postav).

/** Klik do tolika CSS px od průmětu postavy (od nohou po hlavu) ji vybere. */
export const PICK_PX = 12;
/** Výška postavy (m) při měřítku 1 – průmět od nohou po hlavu. */
export const FIGURE_HEIGHT_M = 1.7;

/** Bod světa → CSS px plátna; za kamerou null. */
export type Project = (wx: number, wy: number, wz: number) => { x: number; y: number } | null;

/**
 * Člověk (id) pod kurzorem (x, y): z postav s člověkem (`person`) ta, jejíž průmět od nohou po
 * hlavu je ke kurzoru nejblíž, nejvýš `maxPx`. `spots` = poslední polohy postav (x, y, z po
 * postavách; NaN = postava není vidět). Nic – null.
 */
export function pickPerson(
  people: readonly { person?: number; scale: number }[],
  spots: Float32Array,
  x: number,
  y: number,
  project: Project,
  maxPx = PICK_PX,
): number | null {
  return pickPersonHit(people, spots, x, y, project, maxPx)?.person ?? null;
}

/**
 * Jako `pickPerson`, i se vzdáleností průmětu od kurzoru (px) – scéna ji porovná se spřežením
 * a vozem pod kurzorem (draft-pick.ts), vybere se bližší.
 */
export function pickPersonHit(
  people: readonly { person?: number; scale: number }[],
  spots: Float32Array,
  x: number,
  y: number,
  project: Project,
  maxPx = PICK_PX,
): { person: number; distance: number } | null {
  let best: number | null = null;
  let bestD = maxPx;
  people.forEach((p, i) => {
    if (p.person === undefined) return;
    const o = i * 3;
    const wx = spots[o];
    if (wx === undefined || Number.isNaN(wx)) return;
    const wy = spots[o + 1]!;
    const wz = spots[o + 2]!;
    const foot = project(wx, wy, wz);
    const head = project(wx, wy + FIGURE_HEIGHT_M * p.scale, wz);
    if (!foot || !head) return;
    const d = distanceToSegment(x, y, foot, head);
    if (d <= bestD) {
      bestD = d;
      best = p.person;
    }
  });
  return best === null ? null : { person: best, distance: bestD };
}

/**
 * Která postava ukazuje vybraného člověka: vidět postava má přednost (karavana tam a zpátky – dvě
 * postavy, vidět nejvýš jedna); jinak první skrytá; žádná – null.
 */
export function selectedFigure(
  people: readonly { person?: number }[],
  id: number,
  hidden: (index: number) => boolean,
): { index: number; hidden: boolean } | null {
  let found: { index: number; hidden: boolean } | null = null;
  for (let i = 0; i < people.length; i++) {
    if (people[i]!.person !== id) continue;
    const isHidden = hidden(i);
    if (!isHidden) return { index: i, hidden: false };
    found ??= { index: i, hidden: true };
  }
  return found;
}

/** Vzdálenost bodu (x, y) od úsečky a–b (px). */
export function distanceToSegment(
  x: number,
  y: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}
