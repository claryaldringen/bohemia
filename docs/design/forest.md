# Les a dřevo

Stav: schváleno 17. 10. 2026 (Martin: „Takhle je to zatím ok“), čísla opravená podle
[rešerše](research/2026-10-17-remesla-drevo-sad.md) (Martin: „Ano, udělej opravy.“).
**Implementováno 18. 10. 2026:** hromada klád (`VillageState.woodLogs`),
dřevo obydlí, první zemnice i přestaveb s kácením nejbližších dospělých stromů jako částí práce
stavby, klády z mýcení (pole, hřbitov, staveniště), hnití klád, dřevo jako surovina předem
(zašedlé tlačítko), palivo podle vzdálenosti k lesu – `packages/game/src/domain/village/wood.ts`;
v rozhraní klády v horní liště, dřevo v ceně staveb a stromy ke skácení u stavby, ve scéně hromada
klád a pařezy. Staví na vrstvě překážek (stromy jako herní data, kácení s pařezem a obnovou
v `obstacles.ts`). **Pole v lese (18. 10. 2026):** pole jde zakládat i v lese a v křovinách
([fields.md](fields.md)) – mýcení dá klády za dospělé stromy dílů; scéna a minimapa vykácený
a vymýcený les přestanou kreslit jako les (`apps/web/lib/scene/cleared-forest.ts`).

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
  jako vzdálenost u polí. Počítá se po domácnostech, okraj lesa = nejbližší lesní políčko
  krajiny (vzdálenost se uloží při zahájení stavby obydlí – návrh Clauda). S krajinou se měří
  **chůzí** k nejbližšímu okraji lesa – po pěšinách a pevných cestách, mokřina ×2, brod + 30 m
  ([roads.md](roads.md) – Rychlejší chůze); přepočítá se se změnou rozložení vsi (i po vylepšení
  cesty).

### Stavby a kácení

- **Strom = velký dospělý strom** (≈ 0,7–1,5 m³ dřeva) – jedna jednotka pro stavby, uhlí
  i keramiku ([řemesla](crafts.md); oprava podle rešerše – z velkého stromu je 120 kg uhlí).
- **Stavba spotřebuje dřevo** (Martin – oprava podle rešerše 17. 10. 2026): zemnice ≈ **7 stromů**
  (sloupy, vaznice, krokve), polozemnice ≈ **18 stromů** (hlavně kmeny srubu); řemeslné dílny
  podle základu + 30 % (hrnčíř a kovář ≈ 23, uhlíř ≈ 9); přestavba stejně jako nová stavba. Dřív
  12 / 35 tenkých kmenů: polozemnice potřebuje ≈ 10–13 m³ kmenoviny, tedy ≈ 12–18 velkých stromů
  (vlastní výpočet rešerše; Chudziak 1987).
- **Nejdřív z hromady klád** (Martin): stavba bere klády ze zásoby vsi. Kácí se, jen když klády
  nestačí. Hromada se počítá v celých kládách: zásoba hnije po troškách a na kusy se
  zaokrouhluje (nahnilá kláda se počítá, dokud z ní zbývá aspoň polovina) – tolik klád hráč vidí
  a tolik jich stavba může vzít (návrh Clauda).
- **Kácení** (Martin: vesničané sami, nejbližší vhodný les): pokácí se nejbližší **dospělé**
  stromy ke staveništi – ne mladé stromky, souše ani padlé kmeny (návrh Clauda). Skácení
  a dovoz stojí **2 člověkodny za strom** a zdraží se o 1 % za každých 10 m nad 100 m od
  staveniště (Martin – oprava podle rešerše; sedí – FAO 1987, sekera a ruční doprava). Vzdálenost
  ke stromu se měří chůzí po pevných cestách s mokřinou a brody ([roads.md](roads.md) – návrh
  Clauda; pěšiny dne ne, ať cena u kurzoru sedí se serverem). Je to
  součást stavby – dostává společnou práci vsi jako ostatní stavby ([populace](population.md)).
  U blízkého lesa vychází cena staveb jako dřív: cena obydlí (60 / 220 čd) v sobě kácení
  blízkého lesa má, samotná stavba je o 7 × 2 / 18 × 2 čd levnější; klády z hromady ji zlevní,
  daleký les prodraží.
- **Kdy se kácí** (návrh Clauda): stromy ke kácení se vyberou při zahájení stavby (vyhradí se –
  jiná stavba je nevezme) a kácí se jako první část práce stavby, strom po stromu; po každém
  zůstane pařez. Staveniště ve scéně ukazuje samotnou stavbu, panel stavby kolik stromů zbývá
  skácet. **Vyhrazený strom patří své stavbě** (revize implementace 18. 10. 2026): pole,
  hřbitov ani staveniště jiného obydlí za něj kládu nedají, a když ho staveniště jiného obydlí
  odstraní, stavba ho počítá jako pokácený (bez klády z hromady). Naopak stromy na zakládaných
  dílech polí a čtvercích hřbitova ve stavbě patří té stavbě – obydlí je pro své dřevo nevyhradí.
- **Opuštěná přestavba** (obydlí zůstalo prázdné) vrátí klády, které vzala z hromady; vyhrazené
  stromy se uvolní (revize implementace 18. 10. 2026).
- **Když není z čeho kácet, stavba se nedá zahájit** (Martin, 17. 10. 2026: „Dřevo ať taky
  blokuje, dokud není z čeho kácet“): klády na hromadě + dospělé stromy v krajině sídla nestačí
  na stavbu → tlačítko stavby je zašedlé a tooltip ukáže chybějící dřevo červeně (odemykání jen
  surovinami, jako v 0 A.D.). Počítají se všechny dospělé stromy sídla bez ohledu na vzdálenost –
  daleký les stavbu jen prodraží (návrh Clauda). Rozestavěná stavba se nezastaví: dřevo se jí
  vyhradí při zahájení (návrh Clauda). Přestavbu, o které rozhodnou obyvatelé sami, ani první
  zemnici při založení vsi nedostatek dřeva nezastaví – vezmou, co je (návrh Clauda).
- **Les ustupuje:** pokácené stromy z krajiny sídla zmizí natrvalo, zůstane po nich **pařez**
  (návrh Clauda). Z náletu je pokácený strom zhruba **za 30 let** mladý stromek a **za 70 let**
  zase dospělý strom, který jde kácet (Martin, oprava podle rešerše; dřív dospělý za 30 let:
  pařeziny se těžily ve věku 7–40 let – Kadavý a Kneifl 2016, kmen na srub nebo do milíře roste
  podle odhadu rešerše 60–100 let) – okraj lesa u vsi tak řídne a ustupuje, ale nezmizí navždy.
- Řemesla později spotřebují dřevo stejnou cestou (Martin).

### Mýcení a hromada klád

- **Mýcení lesa pro pole dá klády** (Martin): každý dospělý strom na čtvercích zakládaného pole
  přidá do zásoby vsi jednu kládu (strom = jedna jednotka dřeva – návrh Clauda), až osadníci díl
  založí. Stejně dospělé stromy na čtvercích hřbitova (po ohrazení) a na vyklízené ploše obydlí
  (při zahájení stavby – ta je pak hned spotřebuje).
- **Hromada klád** leží viditelně složená stranou u vsi (Martin) – vesničané ji založí u obydlí
  nejblíž okraji lesa na volném místě vedle něj (návrh Clauda): hranice po 21 kládách, ve scéně
  nejvýš tři. Ubývá podle toho, jak se staví (Martin).
- **Klády hnijí:** ležící dřevo ztratí ≈ **4 % ročně** (Martin – oprava podle rešerše 17. 10.
  2026, dřív 10 %: ležící kmeny ztrácejí ≈ 2–5 % hmoty ročně – Petrillo a kol. 2016 a rozklad
  buku v rezervacích, FEM 2016), den po dni – hromadit je do zásoby se dlouhodobě nevyplácí.

### Krajina sídla

- Kácení a pařezy jsou změny krajiny sídla nad vygenerovanou krajinou (jako u polí). Stromy proto
  musí být **herní data** – staví se na plánované vrstvě překážek ([fields.md](fields.md) –
  Krajina sídla a scéna), na které server ví, kde které stromy stojí a jak jsou staré.

## Co hráč vidí

- Ve scéně: ustupující okraj lesa s pařezy, nálet na starých pasekách, hromadu klád u vsi, která
  ubývá (bez volného místa vedle obydlí se nekreslí – nikdy do vody ani na pole). Na pasece se
  tráva pod vykácenými stromy neztmaví a plocha korun nad vymýceným lesem zapadne pod zem;
  na minimapě les s podílem vykácených stromů řídne do barvy paseky.
- V panelu staveb: zašedlé tlačítko, když není z čeho kácet (tooltip s chybějícím dřevem).
- V horní liště počet klád na hromadě; u rozestavěné stavby a přestavby, kolik stromů ještě zbývá
  skácet.
- **Zatím ne:** dovážené kmeny na staveništi podle kácení (staveniště má jen pevnou hromádku
  trámů) a vzdálenost k lesu v panelu stavby.

## Navazuje

- **Řemesla** (hrnčíř, uhlíř, kovář) – další spotřeba dřeva, pálení uhlí.
- **Druhy dřeva** (dub na sloupy, jedle a borovice na srub, líska na proutí).
- **Les jako zdroj** – pastva, sběr, lov.

## Rozhodnutí

| Rozhodnutí                                                                     | Kdo                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------ |
| Palivo (klestí, odřezky) sbírají vesničané sami, bez kácení                    | Martin                                     |
| Stromy se kácí na stavby, později na řemesla                                   | Martin                                     |
| Kde kácet, si vyberou vesničané sami – nejbližší vhodný les                    | Martin                                     |
| Dřevo z mýcení jde na hromadu klád u vsi, ubývá se stavbami                    | Martin                                     |
| Stavba bere nejdřív z hromady, kácí se jen při nedostatku                      | Martin                                     |
| Když není z čeho kácet (klády + dospělé stromy nestačí), stavba je zašedlá     | Martin                                     |
| Strom = velký strom; 7 / 18 stromů na zemnici / polozemnici, dílny + 30 %      | Martin – oprava podle rešerše 17. 10. 2026 |
| Kácení a dovoz 2 čd na strom, nad 100 m od staveniště +1 % / 10 m              | Martin – oprava podle rešerše 17. 10. 2026 |
| Jen dospělé stromy, pařez po kácení; nálet: mladý strom ≈ 30 let, dospělý ≈ 70 | Martin – oprava podle rešerše 17. 10. 2026 |
| Klády hnijí ≈ 4 % ročně                                                        | Martin – oprava podle rešerše 17. 10. 2026 |
| Strom z mýcení = 1 kláda; hromada u obydlí nejblíž lesu                        | návrh Clauda                               |
| Stromy se vyhradí při zahájení, kácí se jako první část práce stavby           | návrh Clauda                               |
| Přestavbu a první zemnici dřevo neblokuje – vezmou, co je                      | návrh Clauda                               |
| Vyhrazený strom patří své stavbě; opuštěná přestavba vrátí klády z hromady     | revize implementace 18. 10. 2026           |
| Palivo jako třetina domácí výroby, dražší se vzdáleností k lesu                | návrh Clauda                               |
| Stromy jako herní data (vrstva překážek) jsou předpoklad                       | návrh Clauda                               |
