// Velké části pohledu jdou klientovi jen při změně (otisky kusů): díly polí (pohled i scéna, ≈ 1 MB
// u velké vsi – za den se jich změní desítky z tisíců), vstup vozových tras, valy cest, změny
// překážek a louky. Server spočítá otisk každého kusu (díly po PIECE_ITEMS), klient v dotazu na
// ves pošle otisky, které má, server shodné kusy vynechá a klient je doplní ze svého pohledu.
// Server nic nepamatuje – co klient nemá, dostane celé.

import type { VillageView } from './village-view-types';

/** Kolik položek seznamu (dílů polí, valů, luk) tvoří jeden kus s vlastním otiskem. */
export const PIECE_ITEMS = 32;

/** Otisky kusů pohledu po částech (`f0` díly pole 0 v pohledu…) a které kusy server vynechal. */
export interface ViewPieces {
  keys: Record<string, string[]>;
  /** Vynechané kusy po částech (pořadí kusu) – klient je má ze svého pohledu. */
  omitted?: Record<string, number[]>;
}

/** Část pohledu: seznam položek (po PIECE_ITEMS), nebo jedna hodnota (`single`). */
interface Part {
  name: string;
  single: boolean;
  get(view: VillageView): readonly unknown[] | null;
  set(view: VillageView, items: unknown[]): VillageView;
}

type Scene = VillageView['scene'];

const withScene = (view: VillageView, scene: Scene): VillageView => ({ ...view, scene });

/** Části pohledu `view`, které se posílají po kusech (podle jmen otisků na klientovi). */
function partsOf(view: VillageView, names?: readonly string[]): Part[] {
  const fieldCount = (prefix: string, count: number): number[] =>
    names
      ? names.flatMap((n) => (new RegExp(`^${prefix}(\\d+)$`).test(n) ? [Number(n.slice(1))] : []))
      : [...Array(count).keys()];
  const parts: Part[] = [];
  for (const i of fieldCount('f', view.fields.length)) {
    parts.push({
      name: `f${i}`,
      single: false,
      get: (v) => v.fields[i]?.parts ?? null,
      set: (v, items) => ({
        ...v,
        fields: v.fields.map((f, k) => (k === i ? { ...f, parts: items as typeof f.parts } : f)),
      }),
    });
  }
  for (const i of fieldCount('s', view.scene.fields.length)) {
    parts.push({
      name: `s${i}`,
      single: false,
      get: (v) => v.scene.fields[i]?.parts ?? null,
      set: (v, items) =>
        withScene(v, {
          ...v.scene,
          fields: v.scene.fields.map((f, k) =>
            k === i ? { ...f, parts: items as typeof f.parts } : f,
          ),
        }),
    });
  }
  const world = view.scene.cartWorld;
  if (world) {
    for (const i of fieldCount('w', world.village.fields.length)) {
      parts.push({
        name: `w${i}`,
        single: false,
        get: (v) => v.scene.cartWorld?.village.fields[i]?.parts ?? null,
        set: (v, items) => {
          const w = v.scene.cartWorld!;
          const fields = w.village.fields.map((f, k) =>
            k === i ? { ...f, parts: items as typeof f.parts } : f,
          );
          return withScene(v, {
            ...v.scene,
            cartWorld: { ...w, village: { ...w.village, fields } },
          });
        },
      });
    }
    parts.push({
      name: 'we',
      single: false,
      get: (v) => v.scene.cartWorld?.village.earthworks ?? null,
      set: (v, items) => {
        const w = v.scene.cartWorld!;
        const earthworks = items as NonNullable<typeof w.village.earthworks>;
        return withScene(v, {
          ...v.scene,
          cartWorld: { ...w, village: { ...w.village, earthworks } },
        });
      },
    });
    parts.push({
      name: 'wo',
      single: true,
      get: (v) => {
        const changes = v.scene.cartWorld?.changes;
        return changes && changes !== 'obstacles' ? [changes] : null;
      },
      set: (v, items) => {
        const w = v.scene.cartWorld!;
        const changes = (items[0] ?? null) as typeof w.changes;
        return withScene(v, { ...v.scene, cartWorld: { ...w, changes } });
      },
    });
  }
  parts.push({
    name: 'o',
    single: true,
    get: (v) => (v.scene.obstacles ? [v.scene.obstacles] : null),
    set: (v, items) => {
      const scene: Scene = { ...v.scene };
      delete scene.obstacles;
      return withScene(
        v,
        items.length > 0 ? { ...scene, obstacles: items[0] as Scene['obstacles'] } : scene,
      );
    },
  });
  parts.push({
    name: 'e',
    single: false,
    get: (v) => v.scene.earthworks ?? null,
    set: (v, items) => withScene(v, { ...v.scene, earthworks: items as Scene['earthworks'] }),
  });
  parts.push({
    name: 'h',
    single: false,
    get: (v) => v.scene.hayMeadows ?? null,
    set: (v, items) => withScene(v, { ...v.scene, hayMeadows: items as Scene['hayMeadows'] }),
  });
  return names ? parts.filter((p) => names.includes(p.name)) : parts;
}

function chunks<T>(items: readonly T[], single: boolean): T[][] {
  if (single) return [[...items]];
  const out: T[][] = [];
  for (let k = 0; k < items.length; k += PIECE_ITEMS) out.push(items.slice(k, k + PIECE_ITEMS));
  return out;
}

/**
 * Otisk kusu – cyrb53 (53 bitů) JSONu kusu a jeho délka. Změnu, kterou JSON nevidí (undefined
 * proti chybějící vlastnosti), klient nedostane – v pohledu znamená totéž.
 */
export function pieceKey(value: unknown): string {
  const text = JSON.stringify(value) ?? '';
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `${hash.toString(36)}.${text.length.toString(36)}`;
}

/**
 * Server: pohled s otisky kusů (`pieces.keys`), bez kusů, které klient už má (`known` – otisky
 * z jeho pohledu; shodný otisk na stejném místě = klient kus má).
 */
export function packViewPieces(
  view: VillageView,
  known: Readonly<Record<string, readonly string[]>> | null,
): VillageView {
  const keys: Record<string, string[]> = {};
  const omitted: Record<string, number[]> = {};
  let packed = view;
  for (const part of partsOf(view)) {
    const items = part.get(view);
    if (!items) continue;
    const pieces = chunks(items, part.single);
    const own = pieces.map(pieceKey);
    keys[part.name] = own;
    const have = known?.[part.name];
    if (!have) continue;
    const skip = own.flatMap((k, n) => (have[n] === k ? [n] : []));
    if (skip.length === 0) continue;
    omitted[part.name] = skip;
    const left = new Set(skip);
    packed = part.set(
      packed,
      pieces.flatMap((p, n) => (left.has(n) ? [] : p)),
    );
  }
  return {
    ...packed,
    pieces: { keys, ...(Object.keys(omitted).length > 0 ? { omitted } : {}) },
  };
}

/** Klient: otisky kusů pohledu, které má (příloha dotazu na ves). */
export function knownViewPieces(view: VillageView | null | undefined): Record<string, string[]> {
  return view?.pieces && !view.pieces.omitted ? view.pieces.keys : {};
}

/**
 * Klient: doplní vynechané kusy z předchozího pohledu (`previous` – musí mít týž otisk na témže
 * místě). Kus, který klient nemá (zahozený pohled), chybí – `lost` – a pohled se pak má načíst
 * celý (bez otisků).
 */
export function unpackViewPieces(
  view: VillageView,
  previous: VillageView | null | undefined,
): { view: VillageView; lost: boolean } {
  const pieces = view.pieces;
  if (!pieces?.omitted) return { view, lost: false };
  let lost = false;
  let out = view;
  const names = Object.keys(pieces.omitted);
  for (const part of partsOf(view, names)) {
    const keys = pieces.keys[part.name] ?? [];
    const skipped = new Set(pieces.omitted[part.name] ?? []);
    const sent = chunks(part.get(view) ?? [], part.single);
    const old = previous ? chunks(part.get(previous) ?? [], part.single) : [];
    const oldKeys = previous?.pieces?.keys[part.name] ?? [];
    const items: unknown[] = [];
    let next = 0;
    keys.forEach((key, n) => {
      if (!skipped.has(n)) {
        // poslané kusy jdou za sebou – kus po PIECE_ITEMS, poslední může být kratší
        const piece = part.single ? sent[0] : sent[next];
        next++;
        items.push(...(piece ?? []));
      } else if (oldKeys[n] === key && old[n]) {
        items.push(...old[n]);
      } else {
        lost = true;
      }
    });
    out = part.set(out, items);
  }
  return { view: { ...out, pieces: { keys: pieces.keys } }, lost };
}
