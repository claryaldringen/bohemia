// VÝVOJOVÝ NÁSTROJ – ukázkové rozdělení práce pro lidi ve vsi na /dev/landscape (bez
// databáze a simulace). Skutečné rozdělení počítá herní jádro (labor-report.ts) – tady jen
// zhruba podle měsíce a toho, co ve vývojové vsi stojí, ať jdou vidět všechny činnosti.
import { personRoles, type RolePerson } from '@/lib/person-roles';
import type { ScenePerson } from '@/lib/person-view';
import type { LaborShare, SceneLabor, SceneVillage } from '@/lib/village-view';

/** Lidí v obydlí ukázkové vsi – podle nich chodí pro vodu (provoz na cestách). */
const PEOPLE_PER_HOME = 5;

/**
 * Ukázková práce vsi v měsíci `month` – každá činnost, která ve vsi jde, dostane pár lidí; lidé
 * v obydlích (`homes`) chodí pro vodu, k lesu a na pole po pěšinách (provoz na cestách –
 * villagers.md), tolik jich, kolik by šlo v pětičlenných domácnostech.
 */
export function demoLabor(
  village: Omit<SceneVillage, 'labor'>,
  month: number,
  day: number,
  fellTrees: readonly number[],
): SceneLabor {
  const built = village.dwellings.filter((d) => d.built);
  const homes = built.length;
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
  // pasáci (diet.md – Pasáci): dítě z každé domácnosti – stáda bez pasáka stojí u domů
  return {
    day,
    month,
    people,
    shares,
    herders: { children: homes },
    homes: built.map((d) => ({ id: d.id, people: PEOPLE_PER_HOME })),
    persons: demoPersons(built),
  };
}

/**
 * Ves ukázky s rozdělením práce bez lidí (orba přes cestu, vozy, karavana) – doplní ukázkové lidi
 * hotových obydlí (`demoPersons`); s lidmi nebo bez práce dne beze změny (tentýž objekt).
 */
export function withDemoPersons(village: SceneVillage): SceneVillage {
  const labor = village.labor;
  if (!labor || labor.persons) return village;
  const built = village.dwellings.filter((d) => d.built);
  return { ...village, labor: { ...labor, persons: demoPersons(built) } };
}

/**
 * Ukázkoví lidé obydlí (villagers.md – Výběr postavy – postavy jdou vybrat): v každém domě muž
 * a žena, výrostek a malé dítě, v každém druhém domě starší; první dům je dvorec vojvody, dílny
 * podle řemesla obydlí. Role jako ve hře (person-roles.ts).
 */
export function demoPersons(
  dwellings: readonly Pick<SceneVillage['dwellings'][number], 'id' | 'type' | 'craft'>[],
): ScenePerson[] {
  const people: RolePerson[] = [];
  dwellings.forEach((d, k) => {
    const id = 1000 + k * 10;
    const man = { id, age: 30 + (k % 9), sex: 'male' as const, home: d.id, spouse: id + 1 };
    const woman = { id: id + 1, age: 27 + (k % 7), sex: 'female' as const, home: d.id };
    people.push(
      { ...man, practice: d.craft ? { [d.craft]: 5 } : {} },
      { ...woman, spouse: id },
      {
        id: id + 2,
        age: 8 + (k % 5),
        sex: k % 2 === 0 ? 'male' : 'female',
        home: d.id,
        father: id,
        mother: id + 1,
      },
      { id: id + 3, age: 3 + (k % 3), sex: 'female', home: d.id, father: id, mother: id + 1 },
    );
    if (k % 2 === 0) {
      people.push({ id: id + 4, age: 52 + k, sex: k % 4 === 0 ? 'female' : 'male', home: d.id });
    }
  });
  const manor = dwellings.find((d) => d.type === 'dvorec') ?? dwellings[0];
  const roles = personRoles(people, {
    manor: manor?.id ?? null,
    craft: (home) => dwellings.find((d) => d.id === home)?.craft ?? null,
  });
  return people.map((p) => ({
    id: p.id,
    age: p.age,
    sex: p.sex,
    home: p.home,
    role: roles.get(p.id)!,
  }));
}
