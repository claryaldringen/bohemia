# Les a dřevo

Stav: návrh k 17. 10. 2026, čeká na schválení. Implementace zatím není.

## Proč

Ves potřebuje dřevo na stavby (a později na řemesla) a les kolem ní je zároveň půda pro budoucí
pole. Dnes je dřevo schované v ceně staveb a stromy vykácené při mýcení přijdou nazmar. Tento
dokument dává dřevu a lesu skutečné místo: les kolem vsi se kácením viditelně mění, vzdálenost
k lesu stojí práci a mýcení pro pole dá klády na stavby.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** stavby spotřebují dřevo a les kolem vsi tím ustupuje – hráč to vidí v krajině.
- **Cíl:** mýcení lesa pro pole dá klády, které se pak spotřebují na stavby (Martin).
- **Cíl:** vzdálenost k lesu je znát – čím dál, tím dražší stavby a palivo.
- **Ne-cíl (teď):** řemesla (hrnčíři, uhlíři) – přijdou s vlastní mechanikou, ale počítá se
  s nimi (Martin); druhy dřeva jako surovina; obchod se dřevem; těžba jako samostatná činnost,
  kterou by hráč řídil.
- **Anti-cíl:** hráč, který musí vyznačovat, kde se kácí – vesničané si vyberou nejbližší vhodný
  les sami (Martin).
- **Anti-cíl:** zásoba dřeva jako číslo bez opory ve světě – klády leží viditelně složené
  stranou (Martin).

## Pravidla

### Palivo

- **Dřevo na topení sbírají vesničané sami** – klestí a odřezky, žádné kácení (Martin). Je to
  část domácí výroby ([fields.md](fields.md) – Práce).
- Sběr paliva se prodraží, když je ves daleko od lesa: palivová část domácí výroby (návrh Clauda:
  třetina) je o 1 % dražší za každých 10 m nad 100 m od obydlí k nejbližšímu okraji lesa – stejně
  jako vzdálenost u polí.

### Stavby a kácení

- **Stavba spotřebuje dřevo** (návrh Clauda): zemnice ≈ **12 stromů** (sloupy, vaznice, krokve),
  polozemnice ≈ **35 stromů** (hlavně kmeny srubu); přestavba stejně jako nová stavba.
- **Nejdřív z hromady klád** (Martin): stavba bere klády ze zásoby vsi. Kácí se, jen když klády
  nestačí.
- **Kácení** (Martin: vesničané sami, nejbližší vhodný les): pokácí se nejbližší **dospělé**
  stromy ke staveništi – ne mladé stromky, souše ani padlé kmeny (návrh Clauda). Skácení
  a dovoz stojí **2 člověkodny za strom** a zdraží se o 1 % za každých 10 m nad 100 m od
  staveniště (návrh Clauda). Je to součást stavby – dostává společnou práci vsi jako ostatní
  stavby ([populace](population.md)). U blízkého lesa vychází cena staveb zhruba jako dnes
  (kalibrace), se vzdáleností roste.
- **Les ustupuje:** pokácené stromy z krajiny sídla zmizí natrvalo, zůstane po nich **pařez**
  (návrh Clauda). Pokácený strom se z náletu obnoví zhruba **za 30 let** (návrh Clauda) –
  okraj lesa u vsi tak řídne a ustupuje, ale nezmizí navždy.
- Řemesla později spotřebují dřevo stejnou cestou (Martin).

### Mýcení a hromada klád

- **Mýcení lesa pro pole dá klády** (Martin): každý dospělý strom na čtvercích zakládaného pole
  přidá do zásoby vsi jednu kládu (strom = jedna jednotka dřeva – návrh Clauda).
- **Hromada klád** leží viditelně složená stranou u vsi (Martin) – vesničané ji založí u nejbližšího
  obydlí na volném místě (návrh Clauda). Ubývá podle toho, jak se staví (Martin).
- **Klády hnijí:** ležící dřevo ztratí ≈ 10 % ročně (návrh Clauda) – hromadit je do zásoby se
  nevyplácí.

### Krajina sídla

- Kácení a pařezy jsou změny krajiny sídla nad vygenerovanou krajinou (jako u polí). Stromy proto
  musí být **herní data** – staví se na plánované vrstvě překážek ([fields.md](fields.md) –
  Krajina sídla a scéna), na které server ví, kde které stromy stojí a jak jsou staré.

## Co hráč vidí

- Ve scéně: ustupující okraj lesa s pařezy, nálet na starých pasekách, hromadu klád u vsi, která
  ubývá; na staveništi dovážené kmeny.
- V panelu vsi: počet klád v zásobě; u rozestavěné stavby, kolik dřeva ještě chybí a jak daleko je
  les.

## Navazuje

- **Řemesla** (hrnčíř, uhlíř, kovář) – další spotřeba dřeva, pálení uhlí.
- **Druhy dřeva** (dub na sloupy, jedle a borovice na srub, líska na proutí).
- **Les jako zdroj** – pastva, sběr, lov.

## Rozhodnutí

| Rozhodnutí                                                                       | Kdo          |
| -------------------------------------------------------------------------------- | ------------ |
| Palivo (klestí, odřezky) sbírají vesničané sami, bez kácení                      | Martin       |
| Stromy se kácí na stavby, později na řemesla                                     | Martin       |
| Kde kácet, si vyberou vesničané sami – nejbližší vhodný les                      | Martin       |
| Dřevo z mýcení jde na hromadu klád u vsi, ubývá se stavbami                      | Martin       |
| Stavba bere nejdřív z hromady, kácí se jen při nedostatku                        | Martin       |
| 12 / 35 stromů na zemnici / polozemnici, 2 čd na strom, vzdálenost +1 % / 10 m   | návrh Clauda |
| Jen dospělé stromy, pařez po kácení, obnova z náletu ≈ 30 let                    | návrh Clauda |
| Klády hnijí ≈ 10 % ročně; strom z mýcení = 1 kláda; hromada u nejbližšího obydlí | návrh Clauda |
| Palivo jako třetina domácí výroby, dražší se vzdáleností k lesu                  | návrh Clauda |
| Stromy jako herní data (vrstva překážek) jsou předpoklad                         | návrh Clauda |
