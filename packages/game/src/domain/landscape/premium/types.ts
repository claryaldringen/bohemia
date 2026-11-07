/** Typy prémiových krajin (premium-landscapes.md) – krajina přidělená lidskému hráči. */
export type PremiumType =
  | 'deep-gold'
  | 'gold-stream'
  | 'navigable-river'
  | 'fertile'
  | 'ford-hill'
  | 'mountain-pass'
  | 'iron-ore'
  | 'fine-clay'
  | 'oak-beech'
  | 'floodplain'
  | 'south-slopes'
  | 'sacred-mountain'
  | 'sacred-spring'
  | 'confluence'
  | 'natural-fortress'
  | 'salt-spring'
  | 'wild-bees'
  | 'game-furs'
  | 'building-stone';

/** Kotva rozvoje – co se v prémiové krajině časem vyplatí postavit. */
export type PremiumAnchor =
  'hillfort' | 'market-town' | 'mining-town' | 'port' | 'large-village' | 'cult-site' | 'castle';

export interface PremiumTypeInfo {
  /** Název typu pro hráče. */
  readonly name: string;
  /** Typ s kostrou světa (řeka nebo stezka navazující mezi mapami). */
  readonly skeleton: boolean;
  readonly anchor: PremiumAnchor;
  /** Účinek hned podle spec (sloupec „Hned“ není „nic“), ne až s pozdější mechanikou. */
  readonly immediate: boolean;
}

export type PremiumSiteKind =
  | 'deposit'
  | 'gold-placer'
  | 'river'
  | 'port'
  | 'ford'
  | 'route'
  | 'pass'
  | 'summit'
  | 'spring'
  | 'confluence'
  | 'promontory'
  | 'salt'
  | 'bee-trees'
  | 'hunting-ground'
  | 'quarry'
  | 'iron-ore'
  | 'clay'
  | 'slope'
  | 'meadow'
  | 'woodland';

/** Prvek prémiové krajiny: poloha ve světě (m) a volitelně obrys či osa. */
export interface PremiumSite {
  readonly kind: PremiumSiteKind;
  readonly x: number;
  readonly z: number;
  readonly outline?: readonly [number, number][];
  readonly line?: readonly [number, number][];
}

export interface PremiumFeatures {
  readonly type: PremiumType;
  readonly sites: readonly PremiumSite[];
}
