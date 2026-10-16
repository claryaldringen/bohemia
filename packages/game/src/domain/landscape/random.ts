/** Deterministický generátor náhodných čísel – stejný seed dává vždy stejnou posloupnost. */
export interface Random {
  /** Číslo v intervalu [0, 1). */
  next(): number;
}

/** sfc32 inicializovaný ze seedu přes splitmix32 – rychlý a s dobrým rozložením. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const splitmix = (): number => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = splitmix();
  let b = splitmix();
  let c = splitmix();
  let d = splitmix();
  return {
    next(): number {
      const t = (((a + b) >>> 0) + d) >>> 0;
      d = (d + 1) >>> 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) >>> 0;
      c = ((c << 21) | (c >>> 11)) >>> 0;
      c = (c + t) >>> 0;
      return t / 4294967296;
    },
  };
}

/** Seed vrstvy odvozený z hlavního seedu a štítku (FNV-1a + závěrečné promíchání), uint32. */
export function deriveSeed(seed: number, label: string): number {
  let hash = 0x811c9dc5 ^ (seed >>> 0);
  for (let i = 0; i < label.length; i++) {
    hash = Math.imul(hash ^ label.charCodeAt(i), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}
