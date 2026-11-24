// Jména vsí v pádech pro věty kroniky (Martin 14. 11. 2026: „Kovář z Lhoty okul koně.“, „Vlkovští
// směnili … s Lhotskými.“): 2. pád s předložkou „z“ a obyvatelé v 1. a 7. pádě množného čísla.
// Vzory podle konce jména – konce jmen z generátoru (`VILLAGE_NAMES` – `suggestVillageName`)
// a jména, která konec nerozhodne, ve výčtu. Jméno, které vzor nezná (víceslovné, vlastní jméno
// hráče s jiným koncem, nejistý tvar), se opíše: „ze vsi X“, „obyvatelé vsi X“, „s obyvateli
// vsi X“ (návrh Clauda).

/** Tvary jména: 2. pád a přídavné jméno obyvatel (mužský rod, 1. pád jednotného čísla); null = neznámý. */
interface NameForms {
  genitive: string | null;
  adjective: string | null;
  /** 6. pád jednotného (nebo množného) čísla bez předložky („Lhotě“); null = neznámý. */
  locative: string | null;
}

/**
 * Jména z generátoru, která konec nerozhodne: -ice v jednotném čísle (v Libici – ne -ic jako
 * Kněžice), přídavné jméno u -á a 2. pád Brodu. Mokrá, Jasenná, Březí a Poříčí mají jen 2. pád ze
 * vzoru – obyvatele (přídavné jméno nejisté) kronika opíše (návrh Clauda).
 */
const NAME_FORMS: ReadonlyMap<string, NameForms> = new Map([
  ['Libice', { genitive: 'Libice', adjective: 'Libický', locative: 'Libici' }],
  ['Olešnice', { genitive: 'Olešnice', adjective: 'Olešnický', locative: 'Olešnici' }],
  ['Kamenice', { genitive: 'Kamenice', adjective: 'Kamenický', locative: 'Kamenici' }],
  ['Bystřice', { genitive: 'Bystřice', adjective: 'Bystřický', locative: 'Bystřici' }],
  ['Doubravice', { genitive: 'Doubravice', adjective: 'Doubravický', locative: 'Doubravici' }],
  ['Lomnice', { genitive: 'Lomnice', adjective: 'Lomnický', locative: 'Lomnici' }],
  ['Bělá', { genitive: 'Bělé', adjective: 'Bělský', locative: 'Bělé' }],
  ['Dubá', { genitive: 'Dubé', adjective: 'Dubský', locative: 'Dubé' }],
  ['Brod', { genitive: 'Brodu', adjective: 'Brodský', locative: 'Brodě' }],
]);

/** Vzory podle konce jména: konec → konec 2. pádu a přídavného jména (null – vzor ho nezná). */
const ENDINGS: readonly {
  ending: string;
  genitive: string;
  adjective: string | null;
  locative: string;
}[] = [
  // Kojetice → z Kojetic, Kojetičtí (množné číslo jako Kněžice)
  { ending: 'ice', genitive: 'ic', adjective: 'ický', locative: 'icích' },
  // Dobřany → z Dobřan, Dobřanští
  { ending: 'any', genitive: 'an', adjective: 'anský', locative: 'anech' },
  // Vlkov → z Vlkova, Vlkovští
  { ending: 'ov', genitive: 'ova', adjective: 'ovský', locative: 'ově' },
  // Radotín → z Radotína, Radotínští
  { ending: 'ín', genitive: 'ína', adjective: 'ínský', locative: 'íně' },
  // Chlumec → z Chlumce, Chlumečtí
  { ending: 'ec', genitive: 'ce', adjective: 'ecký', locative: 'ci' },
  // Mokrá → z Mokré (skloňuje se jako přídavné jméno)
  { ending: 'á', genitive: 'é', adjective: null, locative: 'é' },
  // Březí → z Březí
  { ending: 'í', genitive: 'í', adjective: null, locative: 'í' },
];

/** Jedno slovo s velkým písmenem – víceslovná a jiná jména vzory neznají. */
const SINGLE_WORD = /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+$/;

/** Ženské -a po tvrdé či obojetné souhlásce: 2. pád -y (Lhota → Lhoty). */
const HARD_BEFORE_A = /[bdfghklmnprstvz]a$/;

/**
 * Přídavné jméno u -a bez změny souhlásky (Lhota → Lhotský): souhláska, která se před -ský nemění,
 * a před ní krátká samohláska (Lípa → lipský, Praha → pražský by vzor netrefil).
 */
const PLAIN_ADJECTIVE_A = /[aeěiouy][bdlmnprtv]a$/;

/**
 * 6. pád ženského -a po tvrdé souhlásce (Lhota → Lhotě, Praha → Praze, Skála → Skále): konec kmene
 * se mění (h → z, k → c, r → ř, g → z), po s, z a l je -e, jinak -ě.
 */
function locativeStem(stem: string): string {
  const last = stem.slice(-1);
  const head = stem.slice(0, -1);
  if (last === 'h' || last === 'g') return `${head}ze`;
  if (last === 'k') return `${head}ce`;
  if (last === 'r') return `${head}ře`;
  if (last === 's' || last === 'z' || last === 'l') return `${stem}e`;
  return `${stem}ě`;
}

function nameForms(name: string): NameForms {
  const listed = NAME_FORMS.get(name);
  if (listed) return listed;
  if (!SINGLE_WORD.test(name)) return { genitive: null, adjective: null, locative: null };
  for (const { ending, genitive, adjective, locative } of ENDINGS) {
    if (!name.endsWith(ending)) continue;
    const stem = name.slice(0, -ending.length);
    return {
      genitive: stem + genitive,
      adjective: adjective === null ? null : stem + adjective,
      locative: stem + locative,
    };
  }
  if (HARD_BEFORE_A.test(name)) {
    const stem = name.slice(0, -1);
    return {
      genitive: `${stem}y`,
      adjective: PLAIN_ADJECTIVE_A.test(name) ? `${stem}ský` : null,
      locative: `${locativeStem(stem)}`,
    };
  }
  return { genitive: null, adjective: null, locative: null };
}

/** Sykavka – před ní (i jako druhou hláskou za souhláskou) se předložka „z“ / „s“ mění na „ze“ / „se“. */
function sibilant(letter: string): boolean {
  return letter !== '' && 'szšž'.includes(letter);
}

function vowel(letter: string): boolean {
  return letter !== '' && 'aáeéěiíoóuúůyý'.includes(letter);
}

/** Předložka před slovem: „z Lhoty“, „ze Sedlce“, „ze Vsetína“; „s Lhotskými“, „se Slavětínskými“. */
function withPreposition(preposition: 'z' | 's' | 'v', word: string): string {
  const first = word.charAt(0).toLowerCase();
  const second = word.charAt(1).toLowerCase();
  // „ve Vlkově“, „ve Zlíně“, „ve Vsetíně“: před v, f a sykavkou (i jako druhou hláskou) -e
  const vocalized =
    sibilant(first) ||
    (!vowel(first) && sibilant(second)) ||
    (preposition === 'v' && (first === 'v' || first === 'f'));
  return `${vocalized ? `${preposition}e` : preposition} ${word}`;
}

/** Obyvatelé v 1. pádě množného čísla z přídavného jména: Lhotský → Lhotští, Hradecký → Hradečtí. */
function nominativePlural(adjective: string): string {
  if (adjective.endsWith('cký')) return `${adjective.slice(0, -3)}čtí`;
  return `${adjective.slice(0, -3)}ští`;
}

/** Odkud – 2. pád s předložkou: „z Lhoty“, „ze Sedlce“; jméno, které vzor nezná, „ze vsi X“. */
export function fromVillage(name: string): string {
  if (name === '') return 'ze sousední vsi';
  const { genitive } = nameForms(name);
  return genitive === null ? `ze vsi ${name}` : withPreposition('z', genitive);
}

/** Kam – 2. pád s předložkou „do“: „do Lhoty“, „do Sedlce“; jméno, které vzor nezná, „do vsi X“. */
export function toVillage(name: string): string {
  if (name === '') return 'do sousední vsi';
  const { genitive } = nameForms(name);
  return `do ${genitive ?? `vsi ${name}`}`;
}

/** Obyvatelé vsi (1. pád množného čísla): „Vlkovští“; jméno, které vzor nezná, „obyvatelé vsi X“. */
export function villagersOf(name: string): string {
  const { adjective } = nameForms(name);
  return adjective === null ? `obyvatelé vsi ${name}` : nominativePlural(adjective);
}

/** S obyvateli vsi (7. pád): „s Lhotskými“, „se Sedleckými“; jinak „s obyvateli vsi X“. */
export function withVillagersOf(name: string): string {
  const { adjective } = nameForms(name);
  return adjective === null
    ? `s obyvateli vsi ${name}`
    : withPreposition('s', `${adjective.slice(0, -1)}ými`);
}

/**
 * Kde – 6. pád s předložkou „v“: „v Lhotě“, „ve Vlkově“; jméno, které vzor nezná, „ve vsi X“.
 * Prázdné jméno (ves, kterou hráč vidět nesmí – cizí správce) je „v sousední vsi“.
 */
export function inVillage(name: string): string {
  if (name === '') return 'v sousední vsi';
  const { locative } = nameForms(name);
  return locative === null ? `ve vsi ${name}` : withPreposition('v', locative);
}
