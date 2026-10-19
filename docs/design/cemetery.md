# Hřbitov (pohřebiště) vesnice

Stav: schváleno 17. 10. 2026 (Martin: „Ukazatel hygieny nebude. Prostě to bude mít vliv na
populaci. Ohledně ostatního sis to domyslel dobře.“). Implementováno 17. 10. 2026: jádro
`packages/game/src/domain/village/cemetery.ts`, umístění `cemeteryPartsFromCells`, scéna
`apps/web/lib/scene/cemetery-renderer.ts`, Hřbitov [V] v mřížce staveb; čtverce navazující
stranou na hřbitov ho rozšíří. Hřbitov se zatím nesmí
zakládat v lese (pole už ano – fields.md). Překážky z vrstvy překážek (fields.md)
zdraží čtverec po kusech jako u pole a zmizí s dostavěním hřbitova nebo rozšíření; čtverec,
do kterého zasahuje skalní výchoz, hřbitov mít nesmí – výchoz se neodstraní a hroby jdou
v pevné mřížce 56 na čtverec (návrh Clauda).

## Proč

Mrtví se musí někam pohřbít. Dobře umístěné a dost velké pohřebiště drží ves zdravou; žádné,
plné nebo moc blízko obydlí či vody zhorší hygienu a lidé víc umírají (Martin). Hráč tak řeší
další rozhodnutí o místě v krajině – vedle obydlí a polí.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** hráč postaví pohřebiště a na jeho poloze a velikosti záleží (Martin).
- **Cíl:** špatná hygiena se projeví jen statisticky na úmrtnosti – **žádný ukazatel hygieny**
  (Martin). Hráč pozná následky v kronice a na počtu lidí.
- **Ne-cíl (teď):** obřady, pohřební zvyky jako mechanika, víra, nemoci a epidemie jako
  samostatné události, znovupoužití starých hrobů.
- **Anti-cíl:** ves, která vymře jen proto, že hráč pár dní nebyl online – vliv hygieny je
  mírný a hájení prvních 30 let chrání i před ním (návrh Clauda, Martin potvrdil).

## Pravidla

- **Stavba:** hráč pohřebiště zakládá **po čtvercích** jako pole – políčka krajiny 15 × 15 m
  (návrh Clauda, Martin potvrdil). Nesmí ležet ve vodě ani na obydlí. **Na pole smí**
  (Martin, 18. 10. 2026 – [fields.md](fields.md), Pole jako krajina): čtverec pole pod hřbitovem
  z pole zmizí, překážky dílu hřbitov neplatí; u kurzoru oranžově „Pole se zmenší“. Založení stojí
  práci jako stavba ze společné práce vsi: vytyčení a ohrazení **10 člověkodní na čtverec**
  (návrh Clauda) + překážky jako u polí.
- **Natočený hřbitov** (Martin, 19. 10. 2026 – „všechny plošné stavby by měly jít natáčet,
  výslovně i hřbitovy“; [fields.md](fields.md), Natočené stavby): hřbitov má vlastní mřížku
  natočenou po 15° jako pole a sad (návrh Clauda) – [ a ] před prvním čtvercem otáčejí mřížku,
  rozšíření se chytí mřížky hřbitova a navazuje jen ve stejné mřížce. Krajina pod natočeným
  čtvercem se vzorkuje jako u pole (voda, les), skalní výchoz nebo posvátný dub v natočeném
  čtverci ho zablokují. **Vzdálenost od obydlí** (hygiena, pořadí pohřbu, varování) se měří
  k okraji čtverce v jeho osách, **vzdálenost od vody** jako nejkratší vzdálenost natočeného
  čtverce od políčka vody (návrh Clauda; u čtverce v mřížce krajiny vyjde totéž co dřív).
  Pole v jiné mřížce pod hřbitovem přijde jen o průnik ploch. Hroby jdou v mřížce 7 × 8 v osách
  čtverce, plot se zakulacenými rohy po natočeném obrysu. Staré hřbitovy leží v mřížce krajiny
  a počítají se beze změny.
- **Velikost:** každý pohřbený zabere **4 m²** i s uličkami – na čtverec se vejde 56 hrobů
  (návrh Clauda). Hroby se zatím znovu nepoužívají, pohřebiště se postupně plní a hráč ho musí
  rozšiřovat. Kdo zemře a nemá kde ležet, je to jako by ves pohřebiště neměla.
  Po rešerši zůstávají 4 m² (Martin, 17. 10. 2026): kostrová řadová pohřebiště mají 1,5–2,9 m²
  na hrob (Přezletice – Koštová a kol. 2022, Radomyšl – Blajerová a Nechvátal 2008), mohylníky
  6.–8. století 10–50 m² na mohylu (Strážovice); doba se zatím neřeší
  ([rešerše](research/2026-10-17-remesla-drevo-sad.md)).
- **Hygiena** (vnitřní číslo 0–1, hráč ho nevidí – Martin):
  - **0**, když ves nemá pohřebiště s volným místem (žádné, nebo všechna plná),
  - jinak podle **vzdálenosti** nejlepšího pohřebiště s volným místem: od nejbližšího obydlí
    plně v pořádku od **150 m**, nejhorší pod **50 m**; od vody (potok) v pořádku od **100 m**,
    nejhorší pod **30 m**; mezi tím plynule; obojí se násobí (návrh Clauda).
- **Vliv na úmrtnost:** roční riziko úmrtí se násobí `1 + extra × (1 − hygiena)`, kde `extra` je
  **0,3 u dospělých a starších a 0,5 u dětí** (návrh Clauda) – stejný statistický mechanismus jako
  hlad a přeplněnost ([populace](population.md)). **Hájení** prvních 30 let platí i tady.
- **Pohřeb:** zemřelý dostane mohylu v pohřebišti s volným místem (nejbližším k obydlím) – podle
  významu (níž Mohyly podle významu); kronika zapíše, když se pohřebiště zaplní (žádné volné
  místo).
- **Opuštěný hřbitov** ([abandonment.md](abandonment.md), Martin 18. 10. 2026): ke hřbitovu, kam
  za rok nevede žádná cesta, plot chátrá a za ≈ 10 let se rozpadne – mohylky zůstanou a zarostou,
  pohřbívá se do něj dál a hygiena se nemění.
- **Oprava plotu** ([abandonment.md](abandonment.md) – Oprava; Martin 19. 10. 2026, varianta a):
  jakmile se ke hřbitovu zase chodí, **vesničané plot opraví sami – postupně, z práce vsi,
  a spadlý postaví znovu**. Roční kontrola cest (1. 11.), která chátrání zastaví, založí opravu
  jako stavbu ze společné práce (jako obnova sadu); cena podle chybějícího stavu – plot je
  třetina vytyčení a ohrazení, tedy **3 člověkodny na hotový čtverec × (1 − stav)**, spadlý plot
  celé 3 čd na čtverec (návrh Clauda). Stav plotu roste s prací, plot se ve scéně splétá zpět
  a mohylky přestanou zarůstat; po dokončení kronika a řádek „Plot hřbitova opraven“. Když
  hřbitov během opravy znovu opustí, oprava se zruší a co se spravilo, zůstane. Natočený hřbitov
  se opravuje stejně (cena jde po čtvercích, plot po natočeném obrysu).
- **Starý hřbitov bez plotu** ([abandonment.md](abandonment.md) – Následky; Martin 19. 10. 2026:
  „Úpravy hřbitova – starému hřbitovu plot zmizí úplně, zůstanou jen mohylky.“): spadlý plot
  opuštěného hřbitova nenechá ve scéně pahýly ani kůly – zmizí úplně. Mohyly zůstanou, zarůstají
  a slehnou se. Když se ke hřbitovu zase začne chodit, plot se postaví znovu (Oprava plotu).

## Mohyly podle významu

Stav: Martin 19. 10. 2026 – „Významnější lidé budou mít větší mohyly a na prominentnějších
místech. Čili zasloužilá hlava rodiny bude mít větší mohylu, než např. dítě zemřelé v dětském
věku. Největší mohyly bude mít vojvodova rodina.“ Velikosti schválil („Ano, udělej to tak.“).
**Implementováno 19. 10. 2026** – jádro `domain/village/burials.ts`, scéna `cemetery-layout.ts`
a `cemetery-renderer.ts`.

- **Místa na hroby** (Martin – schváleno): čtverec má jako dřív 56 míst v mřížce 7 × 8 (místo
  ≈ 2 × 1,75 m, okraj 0,5 m od plotu). **Kapacita se počítá v místech** a mohyla zabere podle
  významu víc míst – hřbitov se zaplní dřív, když umírají významní:

  | Druh pohřbeného                                                                                                       | Mohyla                          | Míst       |
  | --------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------- |
  | **vojvodova rodina** – celá domácnost dvorce (`manorId`), i děti                                                      | největší (Ø ≈ 3,3 m, výška 1,1) | 2 × 2      |
  | **zasloužilá hlava rodiny** – nejstarší muž domácnosti nebo jeho žena (bez muže nejstarší žena), od 35 let, s dítětem | podlouhlá (≈ 1,8 × 3,2 m, 0,7)  | 2 za sebou |
  | **ostatní dospělí** (od 14 let)                                                                                       | běžná (Ø ≈ 1,8 m, 0,45)         | 1          |
  | **dítě** – zemřelé v dětském věku (do 14 let)                                                                         | malá (Ø ≈ 1,1 m, 0,26)          | 1          |

  Druhy podrobně (návrh Clauda): vojvodova rodina je celá domácnost dvorce – i dítě (Martin řekl
  „vojvodova rodina“ – u ní rozhoduje rod, ne věk). Hlava rodiny je ten, kdo domácnost vede
  (dědeček, dokud žije – jeho ženatý syn ne), „zasloužilá“ = od 35 let a s aspoň jedním dítětem
  (žijícím ve vsi, nebo odešlým). Druh určí jádro z příbuzenství v den úmrtí.

- **Prominentní místa** (návrh Clauda): od **branky** (`cemeteryEntrance` – vchod, ke kterému vede
  pěšina) vede hlavní osa dovnitř hřbitova. Prominence místa = hloubka od branky + 2 × vzdálenost
  od osy (m). **Vojvodova rodina a hlavy rodin** dostanou nejprominentnější volné místo – u branky
  na ose, a jak se plní, dál po ose. **Ostatní dospělí** co nejblíž branky, ale mimo pruh podél
  osy (2 m na každou stranu) – ten nechávají velkým mohylám, dokud mají kde jinde. **Děti** co
  nejdál – vzadu a na okrajích. Při shodě rozhoduje pořadí čtverců, řada a sloupec
  (deterministicky).
- **Když se velká mohyla nevejde** (návrh Clauda): **zmenší se** – mohyla vojvodovy rodiny na
  2 místa, pak na 1, hlavy rodiny na 1 – a dostane nejprominentnější volné místo té velikosti.
  Druh pohřbeného zůstane zapsaný. Velká mohyla nikdy nezabere místo jiné ani nepřekročí čtverec.
- **Staré hroby** (hřbitovy uložené dřív – jen počet hrobů): zůstanou jako běžné mohylky po řadách
  od prvního čtverce, přesně jak vypadaly; nové mohyly se jim vyhnou (návrh Clauda – stav se
  nepřepisuje, hřbitov se načte a vypadá stejně).
- **Panel a hygiena** počítají s místy: panel ukáže obsazená místa / všechna (v bublině kolik lidí
  je pohřbeno) a odhad na kolik let (úmrtí za rok × průměrná velikost mohyl vsi); hygiena,
  „hřbitov je plný“ a kronika `cemetery-full` – žádné volné místo.
- **Ve scéně:** mohyly různé velikosti (výška i průměr), podlouhlá mohyla hlavy rodiny leží po
  řadách čtverce, **na vrcholu mohyly vojvodovy rodiny stojí dřevěný kůl** (návrh Clauda –
  inspirace: Pověst dávných let, Vjatičové kladli ostatky na sloup u cest). Čerstvá mohyla je
  první rok po pohřbu z holé hlíny, pak zaroste. Natočený hřbitov má mohyly v osách svých
  čtverců. Ukázka na `/dev/buildings` – Hřbitov (pohřby v pořadí dospělí, děti, hlavy rodin
  a vojvodova rodina – místo vybírá herní jádro) a Rozpad staveb (starý hřbitov – plot zmizí,
  mohyly zůstanou).

## Co hráč vidí

- V nabídce staveb **Hřbitov** (cena za čtverec), umisťování po čtvercích jako pole; během
  umisťování varování, když je místo moc blízko obydlí nebo vody (důvod v bublině).
- V panelu vsi u pohřebiště **kolik místa zbývá** (obsazená místa na hroby / všechna a odhad na
  kolik let) – ne hygiena.
- Ve scéně pohřebiště ohrazené nízkým pleteným plotem – stejný druh plotu jako polský plot kolem
  pozemku polozemnice, jen s hustším pletivem; rohy zakulacené (vnitřní roh tvaru L malým
  obloukem), branka k vsi (Martin). Podle doby by mohlo vypadat jinak – v 6.–8. století žárové
  hroby a mohylky, od 9. století kostrové hroby (nápad na později).
- **Pěšina vede k brance** (Martin, 19. 10. 2026: „každá budova by měla mít nějaký vchod, od
  kterého cesta povede“): branka stojí na rovném úseku plotu nejblíž k nejbližšímu hotovému
  obydlí (od středu hotových čtverců), aspoň kůl od zakulaceného rohu; počítá ji herní jádro
  (`cemeteryEntrance`) pro síť pěšin i pro scénu. Návštěvy hrobů chodí brankou, práce na plotu
  (založení, rozšíření, oprava) ze všech stran. Rozšíření ve stavbě branku nemá – zůstává
  v plotu hotových čtverců ([paths.md](paths.md) – Vchody).

## Naměřeno

`measure-village.ts 200 60` (17. 10. 2026). Hráč, který staví, založí hřbitov hned po první
zemnici (200 m od obydlí, 150 m od vody) a rozšíří ho o čtverec, když je z 80 % plný: na konci
60 let medián 31 lidí a 6 domácností, nasycení ≥ 0,95 celý rok 94,1 % let, vymření žádné
(0 z 200) – stejně jako před zavedením hřbitova (31, 6, 94,0 %). Jediná domácnost bez staveb
(ani hřbitova – po 30 letech hájení hygiena 0) vymře do 60 let ve 2 % vsí místo 0,5 %;
nasycení ≥ 0,95 u ní 97,6 % let místo 98,2 %. Čísla se neladila.

Mohyly podle významu – `measure-village.ts 20 20` (19. 10. 2026, jen krátká kontrola): pohřeb
zabere průměrně **2,6 místa** (dřív 1); mohyly vojvodovy rodiny 53 %, děti 47 %, hlavy rodin
a ostatní dospělí zatím žádné – v prvních 20 letech dospělé chrání hájení a mladá ves je skoro
celá domácností dvorce. Hřbitov hráče, který staví, má po 20 letech pořád medián 1 čtverec;
vymření 0 z 20, nasycení ≥ 0,95 celý rok 97,1 % let. Ve starší vsi s víc domácnostmi podíl
vojvodovy rodiny klesne. Dlouhá kalibrace (200 × 60) zatím neběžela.

## Rozhodnutí

| Rozhodnutí                                                                                 | Kdo                           |
| ------------------------------------------------------------------------------------------ | ----------------------------- |
| Hráč staví hřbitov; musí být dobře umístěný a dost velký                                   | Martin                        |
| Blízko vsi, blízko vody, plný nebo žádný → horší hygiena → vyšší úmrtnost                  | Martin                        |
| Žádný ukazatel hygieny, jen vliv na populaci                                               | Martin                        |
| Po čtvercích jako pole; vzdálenosti 150 / 50 m od obydlí a 100 / 30 m od vody              | návrh Clauda, Martin potvrdil |
| Hrob 4 m², hroby se neopakují; extra úmrtnost 0,3 / 0,5; hájení chrání; 10 čd/čtverec      | návrh Clauda, Martin potvrdil |
| Plot hřbitova = pletený plot jako polský plot (hustší), rohy zakulacené                    | Martin, 18. 10. 2026          |
| Hřbitov smí na pole – čtverec pole pod ním z pole zmizí                                    | Martin, 18. 10. 2026          |
| Plot opuštěného hřbitova vesničané opraví sami, když se k němu zase chodí – i spadlý       | Martin, 19. 10. 2026          |
| Oprava plotu 3 čd na hotový čtverec × chybějící stav, stavba ze společné práce             | návrh Clauda                  |
| Starému hřbitovu plot zmizí úplně, zůstanou jen mohylky                                    | Martin, 19. 10. 2026          |
| Významnější lidé větší mohyly na prominentnějších místech; největší vojvodova rodina       | Martin, 19. 10. 2026          |
| Vojvodova rodina 2 × 2 místa, hlava rodiny 2, ostatní 1, dítě 1 malá; kapacita v místech   | Martin schválil, 19. 10. 2026 |
| Vojvodova rodina = celá domácnost dvorce; hlava rodiny od 35 let s dítětem                 | návrh Clauda                  |
| Prominence = hloubka od branky + 2 × od osy; dospělí mimo pruh osy, děti vzadu na okrajích | návrh Clauda                  |
| Velká mohyla, která se nevejde, se zmenší; staré hroby zůstanou po řadách jako dřív        | návrh Clauda                  |
| Kůl na mohyle vojvodovy rodiny; čerstvá mohyla první rok z holé hlíny                      | návrh Clauda                  |
| Pěšina vede k brance hřbitova; branku počítá jádro pro síť i scénu                         | Martin, 19. 10. 2026          |
