# Pevné cesty – stromy podél nich a vylepšení

Stav: schváleno 18. 10. 2026 (Martin: „Ano, spusť to takhle“). Implementace zatím není. Navazuje na
[vyšlapané pěšiny](paths.md) (jen vzhled) a nahrazuje v nich stromy podél pěšin.

## Proč

Stromy podél pěšin dnes přeskakují: rozmisťují se znovu při každém přepočtu denní sítě pěšin,
která se mění s prací dne (rozbor 18. 10. 2026). Martin: stromy mají záviset na **pomalé
složce**, růst **postupně – napřed jako keř** – a kde jednou vyrostou, **stojí, dokud samy
neodumřou**. Kde vznikne taková pevná cesta, **hráč ji vybere kurzorem a vylepší** (Martin).
Cesta se tím stává herní věcí: pamatuje si, kudy vede, a zkracuje lidem chůzi.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** pevná cesta vzniká sama z dlouhodobého provozu a nehýbe se; denní pěšiny se k ní
  stahují.
- **Cíl:** stromy u pevné cesty jsou herní data – vyrostou z keře, stojí na místě a odumřou
  stářím (Martin).
- **Cíl:** hráč pevnou cestu vybere a vylepší ve **třech stupních** – vyšlapaná → upravená →
  hať a lávka (Martin) – a **nezávisle** na nich podél ní **vysadí jabloně** (Martin).
- **Cíl:** vylepšená cesta **zrychlí chůzi** – vzdálená pole, les a sady stojí méně práce
  (Martin).
- **Ne-cíl (teď):** vozy a tažná zvířata na cestách, obchod, cesty mezi vsemi a mapami (přijde
  s [válkou](war.md) a světem), mosty pro vozy, údržba cest, mýto.
- **Anti-cíl:** cesta nebo strom, které se pohnou samy od sebe; hráč, který musí cesty kreslit
  (cesty vznikají chozením, hráč je jen vylepšuje).

## Dvě vrstvy cest

- **Pěšiny dne** ([paths.md](paths.md)) zůstávají jen vzhled – vedou tam, kam ves dnes chodí,
  a mění se s prací. Nově jdou raději po pevné cestě (sleva jako po silné pěšině), takže se
  k ní stahují. Stromy podél nich zmizí – stromy mají jen pevné cesty.
- **Pevné cesty** počítá a ukládá simulace vsi (server):
  - **Jednou za rok** (1. 11., po sklizni jablek – návrh Clauda) spočítá síť z **celoroční
    práce** (člověkodny za rok po místech, voda, dřevo, sousedé – průměr na den), ne z dnešní.
    Výpočet je stejný jako u pěšin dne, jen s ročním provozem.
  - Úsek, kterým se **dva roky po sobě** chodí aspoň **3× denně** (roční průměr – zhruba síla
    0,55 dnešních pěšin), se stane **pevnou cestou** (návrh Clauda). Uloží se jeho osa
    a od té doby se nehýbe. Nová trasa, která vede blízko pevné cesty, se k ní přimkne (sleva
    za pevnou cestu), takže se síť jen rozrůstá, nepřekresluje.
  - Pevná cesta je **úsek mezi rozcestími a konci** – po ní se vybírá a vylepšuje.
  - **Zarůstání:** vyšlapaná cesta, kterou se **5 let po sobě** chodí pod polovinu prahu,
    zaroste a zmizí (návrh Clauda). Upravená cesta a hať nezarůstají. Stromy u zarostlé cesty
    stojí dál, dokud neodumřou.

## Stromy u pevných cest

- **Kde:** po obou stranách pevné cesty v polní krajině (podél pole nebo louky – ne v lese, ve
  vsi, na pozemcích, hřbitově ani v sadu), 2,5–4 m od osy, místa po 12–20 m střídavě vlevo
  a vpravo, trochu nepravidelně, dva stromy nejméně 8 m od sebe (jako dnes – návrh Clauda).
  Místa se určí jednou, když cesta vznikne, deterministicky ze seedu vsi a polohy.
- **Uchycení:** na volném místě u cesty starší **5 let** se strom uchytí s pravděpodobností
  **10 % ročně** (náletem na neoraném okraji – návrh Clauda; los z seedu vsi a roku).
- **Druhy:** polovina dubů, zbytek jilmy a topoly (jako dnes).
- **Růst (Martin – napřed keř):** **keř** do 8 let (model keře), pak **mladý strom** (30 %
  velikosti), plná velikost ve **40 letech** (návrh Clauda).
- **Stojí, dokud neodumře (Martin):** délka života podle druhu – **topol 60–100 let, jilm
  100–200, dub 200–400** (los při uchycení – návrh Clauda). Po smrti zbude **souš** na 10 let,
  pak **pařez** na 10 let a místo je znovu volné.
- **Vesničané je na dřevo nekácí** – stojí, dokud neodumřou (Martin). Výjimka: když přes strom
  hráč postaví pole, dům, sad nebo hřbitov, skácí se jako ostatní stromy a dá kládu (návrh
  Clauda).

## Vylepšení cesty (staví hráč)

Hráč klikne na pevnou cestu – vybere se úsek, v panelu je stupeň, délka, stáří, stromy
a jabloně a tlačítka vylepšení (ikony, cena v popisku – jako v 0 A.D.). Vylepšení je stavba ze
společné práce vsi; stromy bere jako obydlí (klády z hromady, pak nejbližší dospělé stromy).

| Stupeň                       | Co se udělá                                                                 | Cena (návrh Clauda)                       | Rychlost chůze (návrh Clauda)               |
| ---------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------- |
| 1. **Vyšlapaná cesta**       | vznikne sama                                                                | –                                         | 1,2× proti louce                            |
| 2. **Upravená cesta**        | vyrovnaná, odvodňovací strouha po straně, kameny do bláta a do brodu        | **15 člověkodní na 100 m**                | 1,5×                                        |
| 3. **Hať a lávka** (po 2.)   | povalový chodník přes mokřinu, lávka z kmenů přes potok                     | hať **1 strom a 2 čd na 2 m**, lávka **4 stromy a 15 čd** | mokřina 1,5× místo 0,5×; brod bez zdržení |

- **Stupeň 3** jde jen na úseku, který vede mokřinou (rovina podél potoka) nebo brodí potok –
  jinak se nenabízí.
- **Vysazení jabloní** (nezávislé na stupni – Martin): podél úseku po obou stranách po
  **10 m** (střídavě, na volných místech – kde stojí strom, jabloň nebude). Jako
  [sad](orchard.md) na strom: výsadba **0,45 čd** (80 čd/ha při ≈ 180 stromech/ha) jen v oknech
  jara a podzimu, péče v zimě, sklizeň v září–říjnu, úroda **≈ 17 kg jablek na strom** při plné
  úrodě (≈ 3 t/ha), plody od 6. roku, život ≈ 60 let – pak souš a místo je volné; „Vysadit
  jabloně“ znovu doplní mezery (návrh Clauda). Jablka jdou do zásoby ovoce jako ze sadu.

## Rychlejší chůze (Martin – efekt vylepšení)

- Dnes práce zdražuje **vzdušná vzdálenost** od obydlí: +1 % za každých 10 m nad 100 m (pole
  a sad – [fields.md](fields.md); kácení a palivo – [forest.md](forest.md)).
- Nově se měří **chůzí** (návrh Clauda): délka trasy, kudy lidé skutečně jdou (roční síť),
  a úsek po cestě se započítá zkráceně podle rychlosti (po upravené cestě 300 m jako 200 m).
  Mokřina se počítá dvojnásobně (bahno), brod + 30 m (zout se, přebrodit). Vzdálenosti se
  přepočítají jednou za rok a po dokončení vylepšení.
- Pole za potokem nebo za mokřinou tak bez cesty zdraží, s hatí a lávkou zlevní. Pole 400 m
  daleko bez cesty ≈ +30 %, s upravenou cestou ≈ +20 % (příklad).

## Co hráč vidí

- **Pevná cesta** je silnější a stálá – vyšlapaná hlína (dnešní silná pěšina), upravená cesta
  širší se strouhou po straně a kameny, hať z kmenů napříč, lávka přes potok (modely nové).
- **Stromy** u cest od keře po plný strom, souše a pařezy; jabloně s jablky od srpna.
- **Výběr** pevné cesty kliknutím (zvýrazní se úsek), panel: stupeň (ikona), délka, stáří,
  stromy a jabloně (ikony + čísla), tlačítka vylepšení.
- Kronika: vznikla pevná cesta, vylepšení dokončeno, jabloně vysazeny.

## Rozhodnutí

| Rozhodnutí                                                                                   | Kdo          |
| -------------------------------------------------------------------------------------------- | ------------ |
| Stromy jen u pevných cest z pomalé složky; růst od keře; stojí, dokud samy neodumřou         | Martin       |
| Pevnou cestu hráč vybere kurzorem a vylepší                                                  | Martin       |
| Tři stupně: vyšlapaná → upravená → hať a lávka; efekt rychlejší chůze                        | Martin       |
| Nezávislé vylepšení: vysazení jabloní podél cesty                                            | Martin       |
| Roční síť k 1. 11., práh 3 cesty za den 2 roky, zarůstání vyšlapané po 5 letech              | návrh Clauda |
| Uchycení 10 %/rok po 5 letech cesty, keř 8 let, plný strom 40 let, životy topol/jilm/dub     | návrh Clauda |
| Ceny a rychlosti stupňů, jabloně po 10 m jako sad na strom                                   | návrh Clauda |
| Vzdálenost práce chůzí místo vzdušnou čarou, mokřina ×2, brod +30 m                          | návrh Clauda |

## Na stavitelích

- Výpočet sítě (dnes `apps/web/lib/scene/path-network.ts`, `path-terrain.ts`) se přesune do
  herního jádra, ať ho volá simulace (roční síť) i scéna (pěšiny dne) – herní logika jednou.
- Stav vsi dostane pevné cesty, jejich stromy a jabloně a roční součty práce po místech; staré
  vsi začnou bez pevných cest (vzniknou do dvou let).
- Pořadí implementace: (1) pevné cesty a stromy, (2) výběr, vylepšení a chůze, (3) jabloně.
