// Paměť hodnot úseček podle krajních bodů (a.x, a.z, b.x, b.z) – otevřená tabulka s čísly
// místo řetězcových klíčů (jen zrychlení: hodnota je funkce úsečky a toho, k čemu paměť patří).

/** Míst tabulky na začátku; zaplní se nejvýš ze tří čtvrtin, pak se zdvojí (do `maxSlots`). */
const MIN_SLOTS = 1 << 12;

export class SegmentMemo {
  private keys = new Float64Array(MIN_SLOTS * 4);
  private values = new Float64Array(MIN_SLOTS);
  private used = new Uint8Array(MIN_SLOTS);
  private size = 0;

  /** `maxSlots` – nejvýš míst (mocnina dvou); plná tabulka se vyprázdní a plní znovu. */
  constructor(private readonly maxSlots = 1 << 18) {}

  /** Hodnota úsečky, nebo undefined (v paměti není). */
  get(ax: number, az: number, bx: number, bz: number): number | undefined {
    const { keys, used } = this;
    const mask = used.length - 1;
    for (let slot = hash(ax, az, bx, bz) & mask; used[slot] !== 0; slot = (slot + 1) & mask) {
      const k = slot * 4;
      if (keys[k] === ax && keys[k + 1] === az && keys[k + 2] === bx && keys[k + 3] === bz) {
        return this.values[slot];
      }
    }
    return undefined;
  }

  /** Zapíše hodnotu úsečky, která v paměti není. */
  set(ax: number, az: number, bx: number, bz: number, value: number): void {
    if ((this.size + 1) * 4 > this.used.length * 3) {
      if (this.used.length >= this.maxSlots) this.reset(this.used.length);
      else this.grow();
    }
    const mask = this.used.length - 1;
    let slot = hash(ax, az, bx, bz) & mask;
    while (this.used[slot] !== 0) slot = (slot + 1) & mask;
    const k = slot * 4;
    this.keys[k] = ax;
    this.keys[k + 1] = az;
    this.keys[k + 2] = bx;
    this.keys[k + 3] = bz;
    this.values[slot] = value;
    this.used[slot] = 1;
    this.size++;
  }

  /** Projde všechny úsečky v paměti (v pořadí tabulky) – `visit` paměť nemění. */
  forEach(visit: (ax: number, az: number, bx: number, bz: number, value: number) => void): void {
    const { keys, values, used } = this;
    for (let s = 0; s < used.length; s++) {
      if (used[s] === 0) continue;
      const k = s * 4;
      visit(keys[k]!, keys[k + 1]!, keys[k + 2]!, keys[k + 3]!, values[s]!);
    }
  }

  private reset(slots: number): void {
    this.keys = new Float64Array(slots * 4);
    this.values = new Float64Array(slots);
    this.used = new Uint8Array(slots);
    this.size = 0;
  }

  private grow(): void {
    const { keys, values, used } = this;
    this.reset(used.length * 2);
    for (let s = 0; s < used.length; s++) {
      if (used[s] === 0) continue;
      const k = s * 4;
      this.set(keys[k]!, keys[k + 1]!, keys[k + 2]!, keys[k + 3]!, values[s]!);
    }
  }
}

const bits = new Float64Array(4);
const words = new Uint32Array(bits.buffer);

/** Místo úsečky v tabulce – rozptýlené bity čtyř souřadnic (jen pořadí hledání, ne výsledek). */
function hash(ax: number, az: number, bx: number, bz: number): number {
  bits[0] = ax;
  bits[1] = az;
  bits[2] = bx;
  bits[3] = bz;
  let h = 0x9747b28c;
  for (let q = 0; q < 8; q++) {
    h = Math.imul(h ^ words[q]!, 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
}
