import { createHash } from 'node:crypto';
import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import type { VillageState } from '@bohemia/game';

// Kodek stavu vsi pro sloupce `village.state_day` / `state_land` (docs/code/village-core.md –
// Uložení stavu vsi). Doménový tvar `VillageState` se nemění – stav se jen na hranici adaptéru
// rozdělí na „zem“ (velké části, které se mění jen se zemí: díly polí, vyklučené překážky, cesty,
// pohromy) a „den“ (všechno ostatní), každá část jako zstd komprimovaný JSON. Zem se zapisuje jen
// při změně (otisk `land_hash`). Nový klíč stavu patří do dne, pokud se nemění jen se zemí.

/**
 * Klíče nejvyšší úrovně, které jdou do zemské části celé. Výběr podle měření roku Vlkova den po dni
 * (2026-11-11): `parts` se mění 86 dní z 365 (osev a sklizeň), `routes` 12, `disasters` 4,
 * `clearedObstacles` a `felledTrees` ani jednou; malé části do země nepatří – každá jejich změna by
 * přepsala celou zem.
 */
export const LAND_KEYS: readonly string[] = [
  'parts',
  'clearedObstacles',
  'felledTrees',
  'disasters',
  'routes',
];

/**
 * Klíče, které se dělí o úroveň níž: vyjmenované podklíče jdou do země, ostatní do dne
 * (`roads.wear` a `roads.labor` se mění každý den, náspy, síť a stromy u cest zřídka).
 */
export const LAND_SUBKEYS: Readonly<Record<string, readonly string[]>> = {
  roads: ['earthworks', 'roads', 'trees', 'apples', 'junctions', 'swath'],
};

/** Úroveň zstd: úroveň 1 je u stavu vsi stejně malá jako 3–6 a několikrát rychlejší (měření). */
const ZSTD_LEVEL = 1;

const FORMAT = 1;

/** Denní část – nese i pořadí klíčů, aby dekódování vrátilo tentýž JSON. */
interface DayEnvelope {
  f: typeof FORMAT;
  keys: string[];
  sub: Record<string, string[]>;
  day: Record<string, unknown>;
}

type Json = Record<string, unknown>;

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

/** Rozdělí stav na den a zem; `JSON.stringify` každé části jen jednou. */
export function encodeVillageState(state: VillageState): EncodedVillageState {
  const source = state as unknown as Json;
  const keys: string[] = [];
  const sub: Record<string, string[]> = {};
  const day: Json = {};
  const land: Json = {};
  for (const key of Object.keys(source)) {
    const value = source[key];
    // JSON.stringify klíč s undefined vynechá – do pořadí nepatří
    if (value === undefined) continue;
    keys.push(key);
    const landSub = LAND_SUBKEYS[key];
    if (landSub && isPlainObject(value)) {
      const order: string[] = [];
      const dayPart: Json = {};
      const landPart: Json = {};
      for (const k of Object.keys(value)) {
        if (value[k] === undefined) continue;
        order.push(k);
        (landSub.includes(k) ? landPart : dayPart)[k] = value[k];
      }
      sub[key] = order;
      day[key] = dayPart;
      land[key] = landPart;
    } else if (LAND_KEYS.includes(key)) {
      land[key] = value;
    } else {
      day[key] = value;
    }
  }
  const envelope: DayEnvelope = { f: FORMAT, keys, sub, day };
  const landJson = JSON.stringify(land);
  let landBytes: Buffer | null = null;
  return {
    day: compress(JSON.stringify(envelope)),
    landHash: createHash('sha256').update(landJson).digest('base64url'),
    land: (): Buffer => (landBytes ??= compress(landJson)),
  };
}

function corrupted(what: string): Error {
  return new Error(`Poškozený uložený stav vsi: ${what}.`);
}

/** Opak `encodeVillageState` – tentýž objekt včetně pořadí klíčů. */
export function decodeVillageState(day: Uint8Array, land: Uint8Array | null): VillageState {
  const envelope = decompressJson(day) as DayEnvelope;
  if (envelope.f !== FORMAT) throw corrupted(`neznámý formát ${String(envelope.f)}`);
  const landPart = land === null ? {} : (decompressJson(land) as Json);
  if (!isPlainObject(landPart)) throw corrupted('zem není objekt');
  const pick = (key: string, dayObj: Json, landObj: Json, path = key): unknown => {
    if (hasOwn(dayObj, key)) return dayObj[key];
    if (hasOwn(landObj, key)) return landObj[key];
    throw corrupted(`chybí klíč ${path}`);
  };
  // `Object.fromEntries` – klíč „__proto__“ by přiřazením změnil prototyp
  const entries = envelope.keys.map((key): [string, unknown] => {
    const order = envelope.sub[key];
    if (!order) return [key, pick(key, envelope.day, landPart)];
    const dayObj = envelope.day[key] as Json;
    const landObj = (landPart[key] ?? {}) as Json;
    return [
      key,
      Object.fromEntries(order.map((k) => [k, pick(k, dayObj, landObj, `${key}.${k}`)])),
    ];
  });
  return Object.fromEntries(entries) as unknown as VillageState;
}
