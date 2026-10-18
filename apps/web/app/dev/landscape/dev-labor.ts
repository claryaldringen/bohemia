// VÝVOJOVÝ NÁSTROJ – ukázkové rozdělení práce pro lidi ve vsi na /dev/landscape (bez
// databáze a simulace). Skutečné rozdělení počítá herní jádro (labor-report.ts) – tady jen
// zhruba podle měsíce a toho, co ve vývojové vsi stojí, ať jdou vidět všechny činnosti.
import type { LaborShare, SceneLabor, SceneVillage } from '@/lib/village-view';

/** Ukázková práce vsi v měsíci `month` – každá činnost, která ve vsi jde, dostane pár lidí. */
export function demoLabor(
  village: Omit<SceneVillage, 'labor'>,
  month: number,
  day: number,
  fellTrees: readonly number[],
): SceneLabor {
  const homes = village.dwellings.filter((d) => d.built).length;
  const people = { children: homes * 2, adults: homes * 2, elders: Math.ceil(homes / 2) };
  const shares: LaborShare[] = [];
  const atVillage = { kind: 'village' } as const;
  const between = (from: number, to: number): boolean =>
    from <= to ? month >= from && month <= to : month >= from || month <= to;
  const add = (share: LaborShare): void => {
    shares.push(share);
  };
  add({ activity: 'domestic', target: atVillage, manDays: homes * 0.8 });
  for (const field of village.fields) {
    const target = { kind: 'field', id: field.id } as const;
    if (field.parts.some((p) => p.stage === 'founding')) {
      add({ activity: 'found-field', target, manDays: 2 });
    }
    if (!field.parts.some((p) => p.stage === 'sown')) continue;
    if (between(9, 11)) add({ activity: 'dig', target, manDays: 4 });
    if (between(3, 4)) {
      add({ activity: 'sow', target, manDays: 2 });
      add({ activity: 'dig', target, manDays: 2 });
    }
    if (between(5, 6)) add({ activity: 'weed', target, manDays: 4 });
    if (between(7, 8)) {
      add({ activity: 'harvest', target, manDays: 3.6 });
      add({ activity: 'carry', target, manDays: 2.4 });
    }
  }
  if (village.fields.length > 0 && between(11, 2)) {
    add({ activity: 'thresh', target: atVillage, manDays: 3 });
  }
  for (const orchard of village.orchards ?? []) {
    const target = { kind: 'orchard', id: orchard.id } as const;
    if (orchard.squares.some((s) => s.planting >= 1)) {
      if (between(9, 10)) add({ activity: 'orchard-harvest', target, manDays: 2 });
      if (between(12, 2)) add({ activity: 'orchard-care', target, manDays: 1 });
    }
    if (orchard.squares.some((s) => s.planting < 1)) {
      add({ activity: 'orchard-plant', target, manDays: 2 });
    }
  }
  const sites = village.dwellings.filter((d) => !d.built);
  for (const site of sites) {
    const target = { kind: 'site', id: site.id } as const;
    add({ activity: 'build', target, manDays: 2, construction: site.id });
  }
  // modla a svatyně ve stavbě (staveniště má id stavby jako obydlí)
  for (const sacred of (village.sacred?.buildings ?? []).filter((b) => !b.built)) {
    const target = { kind: 'site', id: sacred.id } as const;
    add({ activity: 'build', target, manDays: 1, construction: sacred.id });
  }
  if (fellTrees.length > 0) {
    // dřevo pro první staveniště – dřevorubci jsou jeho stavitelé
    const construction = sites[0]?.id;
    add({
      activity: 'fell',
      target: { kind: 'trees', ids: [...fellTrees] },
      manDays: 2,
      ...(construction === undefined ? {} : { construction }),
    });
  }
  for (const cemetery of village.cemeteries ?? []) {
    if (!cemetery.built || cemetery.squares.some((s) => s.pending)) {
      add({ activity: 'cemetery', target: { kind: 'cemetery', id: cemetery.id }, manDays: 2 });
    }
  }
  add({ activity: 'idle', target: atVillage, manDays: 1.5 });
  return { day, month, people, shares };
}
