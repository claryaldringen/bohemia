// Čísla kostry světa – jediné místo (world-skeleton.md – Řeky, Stezky, Body na okraji, Hustota
// a stejné podmínky). Hustotu kostry (Otevřené otázky 2) mění jen tato čísla. Graf kostry
// (`world`) se po ostrém spuštění nesmí změnit – změna čísel řek nebo stezek pak znamená novou verzi.

export const SKELETON = {
  /** Řeky – odvodnění po políčkách (world-skeleton.md – Řeky – odvodnění po políčkách). */
  river: {
    /** Povodí (počet map, které do políčka odtékají, i ono samo), od kterého políčkem teče řeka. */
    minUpstream: 500,
    /**
     * Na tomto povodí se počítání proti proudu zastaví – víc nepotřebuje ani šířka řeky. Povodí
     * řek má dlouhý chvost (víc než pětina políček s řekou má přes 100 000 map), strop 12 000
     * drží výpočet výřezu levný a nejširší řeka 45 m vyjde na ≈ 3 z 10 map s řekou.
     */
    upstreamCap: 12000,
    /** Podíl odtoku bokem na každou stranu při nulovém sklonu (jen k sousedovi s nižším klidem). */
    lateralShare: 0.25,
    /** Vlna pomalého sklonu východ/západ v mapách – řeky na desítky map uhýbají. */
    biasWavelength: 16,
    /**
     * Šířka řeky v metrech podle povodí: [od povodí, šířka] (landscape.md – Typy vody, 25–45 m).
     * Prahy podle změřeného rozdělení povodí – šířky 25–40 m po ≈ 17 % map s řekou, 45 m ≈ 31 %
     * (world-skeleton.md – Řeky – odvodnění po políčkách).
     */
    widths: [
      [500, 25],
      [850, 30],
      [1600, 35],
      [3800, 40],
      [12000, 45],
    ],
  },
  /** Stezky – síť uzlů v blocích (world-skeleton.md – Stezky – síť uzlů). */
  trail: {
    /** Strana bloku v mapách – v každém bloku jeden uzel. */
    block: 20,
    /** Uzel leží aspoň tolik map od kraje bloku. */
    nodeMargin: 5,
    /** Pravděpodobnost spojení se sousedním uzlem na východě a na severu. */
    edgeShare: 0.7,
  },
  /** Body na okraji mapy (world-skeleton.md – Body na okraji). */
  port: {
    /** Bod leží na políčku `margin` … 127 − `margin` podél strany (aspoň 360 m od rohu). */
    margin: 24,
    /** Bod stezky je na hraně s řekou aspoň tolik políček od bodu řeky. */
    trailGap: 16,
  },
  /** Místo sídla hráče (world-skeleton.md – Hustota a stejné podmínky). */
  seat: {
    /** O kolik prstenců dál než první vhodný smí `placeSeat` hledat typ kostry. */
    slackRings: 1,
  },
  /** Verze grafu kostry – nese ji každý výřez (`SkeletonSlice.world`). */
  world: 1,
} as const;
