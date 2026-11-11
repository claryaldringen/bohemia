import { createHash } from 'node:crypto';
import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import type { VillageState } from '@bohemia/game';

// Kodek stavu vsi pro sloupce `village.state_day` / `state_land` (docs/code/village-core.md –
// Uložení stavu vsi). Doménový tvar `VillageState` se nemění – stav se jen na hranici adaptéru
// rozdělí na „zem“ (velké části, které se mění jen se zemí: díly polí, vyklučené překážky, cesty,
// pohromy) a „den“ (všechno ostatní), každá část jako zstd komprimovaný JSON. Zem se zapisuje jen
// při změně (otisk `land_hash`). Nový klíč stavu patří do dne, pokud se nemění jen se zemí.

/** Co jde do země: `true` = klíč celý, objekt = klíč se dělí o úroveň níž (zbytek jde do dne). */
export interface LandSpec {
  readonly [key: string]: true | LandSpec;
}

/**
 * Zemská část stavu. Výběr podle měření roku Vlkova den po dni (2026-11-11): `parts` se mění
 * 86 dní z 365 (osev a sklizeň), `routes` a `roads.roads` 12, `disasters` 4, `clearedObstacles`,
 * `felledTrees` a náspy cest (`roads.earthworks`) ani jednou; `roads.wear` a `roads.labor` každý
 * den (den). `wildlife.damage.risk` (ohrožené díly) se mění 1. 6. a 31. 8., ztráty dílů
 * `wildlife.damage.parts` každý den sezóny (den). Malé části do země nepatří – každá jejich změna
 * by přepsala celou zem.
 */
export const LAND: LandSpec = {
  parts: true,
  clearedObstacles: true,
  felledTrees: true,
  disasters: true,
  routes: true,
  roads: { earthworks: true, roads: true, trees: true, apples: true, junctions: true, swath: true },
  wildlife: { damage: { risk: true } },
};

/** Úroveň zstd: úroveň 1 je u stavu vsi stejně malá jako 3–6 a několikrát rychlejší (měření). */
const ZSTD_LEVEL = 1;

const FORMAT = 1;

type Json = Record<string, unknown>;

/** Pořadí klíčů objektu (`k`) a rozdělených podobjektů (`s`) – dekódování vrátí tentýž JSON. */
interface KeyOrder {
  k: string[];
  s?: Record<string, KeyOrder>;
}

/** Denní část – nese i pořadí klíčů. */
interface DayEnvelope {
  f: typeof FORMAT;
  order: KeyOrder;
  day: Json;
}

/** Zakódovaný stav – denní část vždy, zemská jen na požádání (komprimuje se až při změně). */
export interface EncodedVillageState {
  day: Buffer;
  /** sha256 zemského JSON (base64url) – shoda s uloženým = zem se nepřepisuje */
  landHash: string;
  land(): Buffer;
}

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function isPlainObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compress(json: string): Buffer {
  return zstdCompressSync(Buffer.from(json, 'utf8'), {
    params: { [constants.ZSTD_c_compressionLevel]: ZSTD_LEVEL },
  });
}

function decompressJson(bytes: Uint8Array): unknown {
  return JSON.parse(zstdDecompressSync(bytes).toString('utf8'));
}

/** Rozdělí objekt podle pravidla země; klíč s undefined vynechá jako `JSON.stringify`. */
function split(value: Json, spec: LandSpec): { order: KeyOrder; day: Json; land: Json } {
  const order: KeyOrder = { k: [] };
  const day: Json = {};
  const land: Json = {};
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (v === undefined) continue;
    order.k.push(key);
    const rule = hasOwn(spec, key) ? spec[key] : undefined;
    if (rule === true) {
      land[key] = v;
    } else if (rule !== undefined && isPlainObject(v)) {
      const inner = split(v, rule);
      (order.s ??= {})[key] = inner.order;
      day[key] = inner.day;
      land[key] = inner.land;
    } else {
      day[key] = v;
    }
  }
  return { order, day, land };
}

function corrupted(what: string): Error {
  return new Error(`Poškozený uložený stav vsi: ${what}.`);
}

/** Opak `split` – `Object.fromEntries`, protože klíč „__proto__“ by přiřazením změnil prototyp. */
function join(order: KeyOrder, day: Json, land: Json, path: string): Json {
  return Object.fromEntries(
    order.k.map((key): [string, unknown] => {
      const inner = order.s?.[key];
      if (inner) {
        const d = day[key];
        const l = land[key] ?? {};
        if (!isPlainObject(d) || !isPlainObject(l)) throw corrupted(`${path}${key} není objekt`);
        return [key, join(inner, d, l, `${path}${key}.`)];
      }
      if (hasOwn(day, key)) return [key, day[key]];
      if (hasOwn(land, key)) return [key, land[key]];
      throw corrupted(`chybí klíč ${path}${key}`);
    }),
  );
}

/** Rozdělí stav na den a zem; `JSON.stringify` každé části jen jednou. */
export function encodeVillageState(state: VillageState): EncodedVillageState {
  const { order, day, land } = split(state as unknown as Json, LAND);
  const envelope: DayEnvelope = { f: FORMAT, order, day };
  const landJson = JSON.stringify(land);
  let landBytes: Buffer | null = null;
  return {
    day: compress(JSON.stringify(envelope)),
    landHash: createHash('sha256').update(landJson).digest('base64url'),
    land: (): Buffer => (landBytes ??= compress(landJson)),
  };
}

/** Opak `encodeVillageState` – tentýž objekt včetně pořadí klíčů. */
export function decodeVillageState(day: Uint8Array, land: Uint8Array | null): VillageState {
  const envelope = decompressJson(day) as DayEnvelope;
  if (envelope.f !== FORMAT) throw corrupted(`neznámý formát ${String(envelope.f)}`);
  const landPart = land === null ? {} : decompressJson(land);
  if (!isPlainObject(landPart)) throw corrupted('zem není objekt');
  return join(envelope.order, envelope.day, landPart, '') as unknown as VillageState;
}
