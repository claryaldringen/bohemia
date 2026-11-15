import { describe, expect, it } from 'vitest';
import { VILLAGE_NAMES } from '@bohemia/game';
import { fromVillage, villagersOf, withVillagersOf } from '../village-name-cases';

// Jména vsí v pádech pro kroniku (Martin 14. 11. 2026: „Kovář z Lhoty okul koně.“, „Vlkovští
// směnili … s Lhotskými.“).

/** Každé jméno generátoru: odkud, obyvatelé a s obyvateli. */
const GENERATOR_FORMS: Record<string, [string, string, string]> = {
  // -ice v jednotném čísle (výčet)
  Libice: ['z Libice', 'Libičtí', 's Libickými'],
  Olešnice: ['z Olešnice', 'Olešničtí', 's Olešnickými'],
  Kamenice: ['z Kamenice', 'Kameničtí', 's Kamenickými'],
  Bystřice: ['z Bystřice', 'Bystřičtí', 's Bystřickými'],
  Doubravice: ['z Doubravice', 'Doubravičtí', 's Doubravickými'],
  Lomnice: ['z Lomnice', 'Lomničtí', 's Lomnickými'],
  // -ice v množném čísle (vzor)
  Kojetice: ['z Kojetic', 'Kojetičtí', 's Kojetickými'],
  Bohušice: ['z Bohušic', 'Bohušičtí', 's Bohušickými'],
  Drahotice: ['z Drahotic', 'Drahotičtí', 's Drahotickými'],
  Úhonice: ['z Úhonic', 'Úhoničtí', 's Úhonickými'],
  // -any
  Dobřany: ['z Dobřan', 'Dobřanští', 's Dobřanskými'],
  Lužany: ['z Lužan', 'Lužanští', 's Lužanskými'],
  Lipany: ['z Lipan', 'Lipanští', 's Lipanskými'],
  Bukovany: ['z Bukovan', 'Bukovanští', 's Bukovanskými'],
  Olšany: ['z Olšan', 'Olšanští', 's Olšanskými'],
  Dolany: ['z Dolan', 'Dolanští', 's Dolanskými'],
  // -ov, -ín, -ec (ze / se před sykavkou)
  Hrušov: ['z Hrušova', 'Hrušovští', 's Hrušovskými'],
  Vlkov: ['z Vlkova', 'Vlkovští', 's Vlkovskými'],
  Chotěšov: ['z Chotěšova', 'Chotěšovští', 's Chotěšovskými'],
  Radotín: ['z Radotína', 'Radotínští', 's Radotínskými'],
  Slavětín: ['ze Slavětína', 'Slavětínští', 'se Slavětínskými'],
  Chlumec: ['z Chlumce', 'Chlumečtí', 's Chlumeckými'],
  Sedlec: ['ze Sedlce', 'Sedlečtí', 'se Sedleckými'],
  // -á a -í: 2. pád ze vzoru, obyvatelé jen u jistých tvarů
  Bělá: ['z Bělé', 'Bělští', 's Bělskými'],
  Dubá: ['z Dubé', 'Dubští', 's Dubskými'],
  Mokrá: ['z Mokré', 'obyvatelé vsi Mokrá', 's obyvateli vsi Mokrá'],
  Jasenná: ['z Jasenné', 'obyvatelé vsi Jasenná', 's obyvateli vsi Jasenná'],
  Březí: ['z Březí', 'obyvatelé vsi Březí', 's obyvateli vsi Březí'],
  Poříčí: ['z Poříčí', 'obyvatelé vsi Poříčí', 's obyvateli vsi Poříčí'],
  // Brod (2. pád -u)
  Brod: ['z Brodu', 'Brodští', 's Brodskými'],
};

describe('jména vsí v pádech (kronika)', () => {
  it('každé jméno generátoru má 2. pád i obyvatele', () => {
    expect(Object.keys(GENERATOR_FORMS).sort()).toEqual([...VILLAGE_NAMES].sort());
    for (const [name, forms] of Object.entries(GENERATOR_FORMS)) {
      expect([fromVillage(name), villagersOf(name), withVillagersOf(name)], name).toEqual(forms);
    }
  });

  it('vzory i mimo generátor: Lhota, Kněžice, Hradec', () => {
    expect([fromVillage('Lhota'), villagersOf('Lhota'), withVillagersOf('Lhota')]).toEqual([
      'z Lhoty',
      'Lhotští',
      's Lhotskými',
    ]);
    expect([fromVillage('Kněžice'), villagersOf('Kněžice'), withVillagersOf('Kněžice')]).toEqual([
      'z Kněžic',
      'Kněžičtí',
      's Kněžickými',
    ]);
    expect([fromVillage('Hradec'), villagersOf('Hradec'), withVillagersOf('Hradec')]).toEqual([
      'z Hradce',
      'Hradečtí',
      's Hradeckými',
    ]);
    // ze / se i před souhláskou se sykavkou za ní
    expect(fromVillage('Vsetín')).toBe('ze Vsetína');
    expect(withVillagersOf('Zlín')).toBe('se Zlínskými');
  });

  it('-a: 2. pád vždy po tvrdé souhlásce, obyvatelé jen bez změny souhlásky', () => {
    expect([fromVillage('Praha'), villagersOf('Praha')]).toEqual([
      'z Prahy',
      'obyvatelé vsi Praha',
    ]);
    expect([fromVillage('Lípa'), villagersOf('Lípa')]).toEqual(['z Lípy', 'obyvatelé vsi Lípa']);
    expect(villagersOf('Sázava')).toBe('Sázavští');
  });

  it('jméno, které vzor nezná: ze vsi X, obyvatelé vsi X, s obyvateli vsi X', () => {
    for (const name of ['Nová Ves', 'Tábor', 'vlkov', 'Kladno', 'Hradiště', 'constructor']) {
      expect([fromVillage(name), villagersOf(name), withVillagersOf(name)], name).toEqual([
        `ze vsi ${name}`,
        `obyvatelé vsi ${name}`,
        `s obyvateli vsi ${name}`,
      ]);
    }
  });
});
