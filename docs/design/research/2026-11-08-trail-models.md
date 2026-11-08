# Rešerše – modely vzniku pěšin (8. 11. 2026)

Martin 8. 11. 2026: „S pěšinami je obecně problém. Tohle přece už muselo řešit spoustu jiných lidí
a musí pro to existovat různé přístupy a matematické modely ne?“ K návrhu rešerše se srovnáním na
Vlkovu: „Ano“.

Cíl: najít známé modely vzniku pěšin a cestních sítí, změřit 2–3 nejslibnější na Vlkovu proti
dnešní síti a navrhnout, co z toho vzít. Rešerše nic nemění – pravidla jsou v [paths.md](../paths.md)
a [roads.md](../roads.md), kód v [docs/code/village-roads.md](../../code/village-roads.md).

## Shrnutí

- **Dnešní model je už známý model** – diskrétní verze modelu aktivních chodců (Helbing a kol.
  1997): vyšlapanost je „struktura půdy“, sleva za pěšinu „potenciál stezky“, zvyk 1,25 je
  parametr, který rozhoduje mezi přímými cestami a nejkratší sítí. Model měnit nemusíme.
- **Drahý je výpočetní postup, ne model:** 367 hledání (každá dvojice domácnost × cíl zvlášť).
  Stejnou síť dá **jedno hledání z brány každé domácnosti ke všem jejím cílům** (pole vzdáleností
  jako v RTS hrách) – na Vlkovu 14 hledání místo ≈ 400, **2,8–3,2× rychleji** ve stejném kódu.
- Síť se tím skoro nezmění: celková délka ± 2 %, průměrná objížďka beze změny, liší se 15–23 %
  viditelných buněk, ve Vlkově s cestami **ani jedna o víc než 1 buňku (3,75 m)**.
- Steinerův strom dá o 9–11 % kratší síť, ale objížďky 1,5–1,8× proti přímce (dnes 1,27–1,38) –
  odporuje pravidlu 1 (nejrychlejší cestou). Physarum, HPA\* a LPA\* se na Bohemii nehodí (proč níž).
- **Návrh Clauda:** „pole z domu“, domácnosti po sobě, dvě kola (P2c níž), velikost práce M.
  Sám cíl roku Vlkova pod 10 s nesplní (rok ≈ −30 %), s přepočtem 1. dne v měsíci ≈ 11–12 s.

## 1. Jak to děláme dnes

- **Mřížka** 375 × 375 buněk po 3,75 m (`PATH_GRID_PER_TILE` = 4 na políčko), 8 směrů, cena buňky
  = 1 / rychlost chůze proti louce (pole 0,6, mokřina, svah, les…); ploty, ohrady a palisáda jsou
  neprůchodné (`network-grid.ts`, `villageGrid`).
- **Kdo kam chodí:** domácnosti (Vlkov 8) × cíle – 43 skupin (pole, sad, hřbitov, posvátná místa,
  ohrady, stavby, sousedé na kraji mapy; pochůzky pro vodu a dřevo k nejbližšímu místu), 220 dvojic
  dům × cíl s vahou v cestách za den (`tripGroups`, `errandGroups`).
- **Pořadí:** skupiny od nejvytíženější; v každé skupině domácnosti od nejvytíženější a **každá
  zvlášť** hledá trasu A\* od cíle ke své bráně (`network-search.ts`, `routeAllSteps`, odhad
  `A_STAR_WEIGHT` = 0,5 × vzdušná čára); jediná domácnost – Dijkstra.
- **Šlapání hned:** po každé trase se buňkám na ní sníží cena (`treadCell` → `trodden`) – další
  trasa se k čerstvé pěšině přidá (Martin 18. 10. 2026: „Pokud už cesta vede tím směrem, lidé by
  měli použít tu, ne si prošlapat vlastní souběžnou.“).
- **Zvyk:** mimo pevnou cestu stojí buňka × 1,25 (`ROUTE_HABIT`), na pěšině úměrně méně; plná
  pěšina zrychlí 1,3× (`PATH_WALK`) – trasa obejde až ≈ 1,6× delší cestou, když vede po vyšlapané.
- **Dvě kola** (`PASSES` = 2): druhé kolo začne s cenami z vyhlazeného provozu prvního
  (`smoothTraffic`) – slévání i trasám, které v prvním kole šly dřív než kmen.
- **Determinismus:** ceny kroků po kvantech 1/1024 (`quantizedStep`) – součty přesné, remízu
  rozhodne předchůdce s vyšším indexem; síla pěšiny po setinách. Jen sčítání a porovnání (det-math).
- **Kdy se počítá:** jen při změně klíče mapy tras (`routeMapKey` – obydlí, stavby, pole, ohrady,
  pevné cesty, opevnění, pařezy k 1. 11.); trasy se uloží do stavu (`VillageState.routes`) a scéna
  je jen čte. Nezávisí na kouscích dopočtu – rozhodují dny změn.
- **Vyšlapanost** (stav vsi): každá trasa přidá své cesty za den, tráva ubere 1 cestu za den,
  0–1 500, od 1 000 vznikne pevná cesta; síla vyšlapanosti zlevní buňky už v prvním kole.
- **Cena (Kolo 4, [village-core.md](../../code/village-core.md)):** přepočet ≈ 1,7 s, z toho síť
  ≈ 1,1 s – 367 hledání, ≈ 5,5 mil. vyjmutí z haldy; Vlkov 9 přepočtů za rok = 78 % času roku.
  Hledání jdou po sobě a každá trasa mění ceny – nedají se rozdělit ani převzít z minula.

## 2. Přístupy

### 2.1 Model aktivních chodců (Helbing, Keltsch, Molnár 1997)

- **Princip:** půda má „strukturu“ G(r, t): stopy ji zvyšují (intenzita I, nasycení k Gmax), počasí
  ji vrací k G0 s trvanlivostí T. Chodec vidí **potenciál stezky** – G rozmazané exponenciálou
  s dosahem σ – a jde směrem součtu „k cíli“ + gradient potenciálu. Parametr κ = I·T/σ²: malé κ dá
  **přímé cesty**, velké κ **nejkratší síť** (Steinerovu), mezi nimi kompromis jako na trávnících
  kampusů. Pokus s lidmi ve virtuálním světě (Goldstone, Roberts 2006) to potvrdil.
- **Bohemia = jeho diskrétní verze:** G = vyšlapanost (+ cesty za den, − 1 za den dorůstá, strop
  1 500), potenciál = sleva ceny po pěšině (rozmazání `smoothTraffic`, ≈ 1–2 buňky), κ odpovídá
  zvyku 1,25 × zrychlení 1,3. Rozdíl: Helbingův chodec je krátkozraký (jde po gradientu), náš zná
  mapu a hledá nejlevnější trasu – proto pěšiny nekličkují.
- **Cena:** v originále simulace chodců krok za krokem – drahé. U nás jde o počet hledání.
- **Denně / přírůstkově:** přirozeně – G se mění v čase, ne v jednom přepočtu. Zkouška P4 níž ale
  ukazuje, že **slévání jen přes vyšlapanost v čase** (bez šlapání v přepočtu) se ve Vlkově
  neustálí: po 24 měsících se dál mění ≈ 230 buněk měsíčně a vznikají souběžné pěšiny.
- **Determinismus:** ano, když se G mění v pevné dny (dnes 1. v měsíci a dny přepočtu).
- **Vhodnost:** model ponechat – je to správný a ověřený model. Měnit jen výpočetní postup.

### 2.2 Síť typu Physarum (Tero a kol. 2010)

- **Princip:** hlenka na grafu; každá hrana má vodivost D, tok Q = D·Δp / L (Kirchhoffovy zákony –
  v každém kroku soustava rovnic pro tlaky mezi náhodným zdrojem a stokem), pak
  dD/dt = f(|Q|) − D, f(|Q|) = |Q|^γ / (1 + |Q|^γ). Silné hrany sílí, nepoužívané slábnou. Na
  mapě Tokia dala síť srovnatelnou s železnicí (délka, rychlost, odolnost proti výpadku).
- **Vstup:** graf, uzly-cíle, parametry I0 (síla toku) a γ. **Cena:** v každém kroku řešit
  soustavu o 140 tisících neznámých (stovky iterací CG) a kroků stovky – o řády dráž než dnes;
  použitelné jen na hrubém grafu (stovky uzlů), pak ale nevede po buňkách terénu.
- **Determinismus:** iterační řešič v plovoucí čárce – jde, ale výsledek citlivý na pořadí sčítání.
- **Síť:** záměrně se smyčkami (odolnost) – pro ves zbytečné. **Vhodnost: ne.** Užitečný jen
  postřeh, že jeho pravidlo (provoz posiluje, bez provozu slábne) už máme ve vyšlapanosti.

### 2.3 Pole vzdáleností / pole proudění (RTS hry)

- **Princip:** místo hledání pro každou jednotku zvlášť jedno Dijkstrovo „integrační pole“ od cíle
  přes celou mapu; každá jednotka pak jen sleduje směr k sousedovi s nižší hodnotou (Emerson 2013,
  Supreme Commander 2; Continuum Crowds – Treuille a kol. 2006 – totéž spojitě, s polem
  „nepohodlí“, které výslovně modeluje chůzi po vyšlapaných místech).
- **Pro nás dvě podoby:** **na cíl** (P1 – jedno pole od cíle ke všem branám skupiny) a **z domu**
  (P2 – jedno pole od brány domácnosti, první dosažená buňka každého cíle je jeho konec). Ceny jsou
  souměrné, takže nejkratší trasa tam = zpět. Stromy nejkratších cest mají navíc samy společný kmen:
  trasy z jednoho domu se rozejdou až tam, kde musí.
- **Cena:** P1 – hledání = skupiny (43 na kolo), ale bez A\* pole projde kruh až k nejvzdálenější
  bráně. P2 – hledání = domácnosti (8 na kolo), pole jde k nejvzdálenějšímu cíli domácnosti; cíl
  v jiné souvislé oblasti (za plotem bez branky, za vodou) se předem vyřadí, jinak pole projde
  celou mapu.
- **Denně / přírůstkově:** stejné spouštění jako dnes (klíč mapy tras); P2 souběžně (všechny domy
  na týchž cenách) jde počítat i paralelně.
- **Determinismus:** jako dnes (kvanta, pevné pořadí domácností, pravidlo remízy) – viz bod 4.
- **Vhodnost: ano – P2 je doporučený postup.**

### 2.4 Přírůstkové hledání (LPA\*, D\* Lite)

- **Princip:** Koenig, Likhachev, Furcy 2004; Koenig, Likhachev 2002. Hledání si pamatuje hodnoty
  g a rhs z minula a po změně cen hran opraví jen část stromu, které se změna týká. D\* Lite hledá
  od cíle, aby přežil pohyb robota. Předpoklady o změnách nemá, vyplatí se, když jsou malé a blízko
  cíle.
- **Pro nás:** změna rozložení mění ceny jen v 21–3 000 buňkách, ale každá trasa pak mění ceny
  všem dalším (šlapání) – kaskáda. Paměť 367 hledání × 140 tisíc buněk ≈ 400 MB. Pro P2 (8 polí,
  ≈ 13 MB) by šlo opravit pole prvního kola, ale druhé kolo závisí na provozu prvního.
- **Determinismus:** pozor – uložený stav nesmí záviset na historii. Šlo by jen tak, že se cesta
  vybere z hotových hodnot g pevným pravidlem (ne podle průběhu opravy). **Vhodnost: ne teď**
  (velká složitost, nejistý zisk); případně později nad P2.

### 2.5 Hierarchické hledání (HPA\*)

- **Princip:** Botea, Müller, Schaeffer 2004 – mapa se rozdělí na shluky, přechody shluků
  a ceny průchodu se předpočítají; hledání jde po abstraktním grafu a pak se zjemní. Až 10× rychlejší
  než A\*, trasy do 1 % od nejkratší.
- **Pro nás:** po každé trase se mění ceny buněk podél ní (≈ 10 shluků) – předpočet by se musel
  opravovat po každé trase; trasy „skoro nejkratší“ = jiné remízy a jiné pěšiny. **Vhodnost: ne.**

### 2.6 Steinerovy stromy a sítě s mezí objížďky

- **Princip:** nejkratší síť spojující dané body. Takahashi, Matsuyama 1980: strom roste od jednoho
  bodu a vždy připojí nejbližší nepřipojený bod nejkratší cestou (nejvýš (2 − 2/n) × optimum). Hladový
  „spanner“ (Althöfer a kol. 1993) přidá spojení, jen když síť nabízí cestu delší než r × přímá.
- **Pro nás:** P3 na Vlkovu – o 9–11 % kratší síť, ale průměrná objížďka 1,54–1,77 (max 4,5×) –
  lidé by chodili oklikou po stromu, odporuje pravidlu 1. **Postřeh:** dnešní zvyk 1,25 dělá
  ze sítě právě měkký hladový spanner – trasa se přidá k síti, je-li objížďka v mezi, jinak jde
  vlastní cestou. Kompromis délka × objížďka tedy už máme a řídí ho zvyk. **Vhodnost: jen jako
  měřítko.**

### 2.7 Růst silniční sítě (Barthélemy, Flammini 2008)

- **Princip:** nová centra (domy) se připojují k existující síti; kus silnice roste od bodu sítě
  směrem k součtu jednotkových vektorů k centrům, která ho táhnou – lokální minimalizace délky,
  vznikají ohyby a skoro pravoúhlé křižovatky. Bez provozu, jen geometrie.
- **Pro nás:** model zakládání silnic, ne pěšin z provozu (pravidlo 3: cesty zakládají lidé
  chůzí). Případně inspirace pro vozové cesty a tvar křižovatek. **Vhodnost: ne pro pěšiny.**

### 2.8 Okrajem

- **Fast marching** (Sethian 1996): Dijkstra pro spojitou rovnici eikonálu – trasy bez „schodů“
  8 směrů, cena podobná Dijkstrovi. Mohl by ušetřit vyhlazování os, ale mění všechny trasy.
- **Hrubší mřížka** a **jedno kolo** (Kolo 4, návrhy c a b) jsou nezávislé úspory – dají se
  kombinovat s P2.

## 3. Prototypy a srovnání na Vlkovu

Stav Vlkova ze souboru měření výkonu (8 domácností, 43 skupin, 220 dvojic), mřížka a skupiny
přímo funkcemi jádra (`villageGrid`, `households`, `tripGroups`, `errandGroups`), stálá síť jako
`computeStableNetwork`. Prototypy mimo repo (scratchpad), bez det-math. Stroj byl silně vytížený
(zátěž 70–200), proto se varianty střídaly v jednom běhu, 5 opakování, nejlepší čas. Aby čas
nezkreslila kvalita prototypu, **P0 je dnešní postup přepsaný v kódu prototypu** – zrychlení se
počítá proti P0 (P0 je o 5–9 % pomalejší než jádro, síť má s jádrem Jaccard 0,85–0,91 – prototyp
nemá slévání pochůzek se sousedem ani remízy jádra; menší rozdíly tedy nic neznamenají).

- **P1 – pole na cíl:** jedno Dijkstrovo pole od buněk cíle ke všem branám skupiny, skupiny po
  sobě a šlape se, dvě kola.
- **P2c – pole z domu, po sobě:** jedno pole z brány domácnosti ke všem jejím cílům, domácnosti
  od nejvytíženější, šlape se po každé, dvě kola, cíle v jiné souvislé oblasti vyřazené předem.
- **P2d – pole z domu, souběžně:** totéž, ale všichni v kole na týchž cenách (pořadí nerozhoduje),
  šlape se až po kole, tři kola.
- **P3 – Steinerův strom** (Takahashi–Matsuyama) nad branami a cíli, trasy jen po stromu.

Délka = viditelné pěšiny (provoz ≥ 0,6 cesty za den), objížďka = délka trasy / přímka (vážená
cestami, trasy nad 20 m), rozdíl = viditelné buňky jen v dnešní / jen v nové síti (v závorce dál
než 1 buňku od druhé sítě).

**Vlkov, jak je (pevné cesty a vyšlapanost):**

| Varianta     | Hledání | Vyjmutí z haldy | Čas     | Proti P0 | Délka  | Objížďka ø (max) | Rozdíl buněk  | Jaccard |
| ------------ | ------- | --------------- | ------- | -------- | ------ | ---------------- | ------------- | ------- |
| dnes (jádro) | 367     | ≈ 5,5 mil.      | 1175    | –        | 3092 m | 1,379 (3,51)     | –             | 1       |
| P0           | 397     | 4,22 mil.       | 1249    | 1,0×     | 3204 m | 1,373 (3,51)     | 54/65 (0/0)   | 0,85    |
| P1           | 81      | 3,83 mil.       | 1036    | 1,2×     | 3177 m | 1,373 (3,51)     | 29/37 (0/0)   | 0,91    |
| P2d          | 21      | 1,25 mil.       | 554     | 2,3×     | 3150 m | 1,373 (3,51)     | 54/59 (0/0)   | 0,85    |
| **P2c**      | **14**  | **0,84 mil.**   | **394** | **3,2×** | 3146 m | 1,373 (3,51)     | 54/59 (0/0)   | 0,85    |
| P3 Steiner   | 258     | 0,40 mil.       | 213     | 5,9×     | 2746 m | 1,544 (4,45)     | 148/73 (54/0) | 0,72    |

Časy v ms; „dnes“ zahrnuje i stavbu mřížky (≈ 20 ms) a čáry pěšin.

**Vlkov bez pevných cest a vyšlapanosti (čistý vznik sítě):**

| Varianta   | Vyjmutí z haldy | Čas     | Proti P0 | Délka  | Objížďka ø (max) | Rozdíl buněk      | Jaccard |
| ---------- | --------------- | ------- | -------- | ------ | ---------------- | ----------------- | ------- |
| dnes       | ≈ 5,5 mil.      | 1452    | –        | 3152 m | 1,266 (3,22)     | –                 | 1       |
| P0         | 5,71 mil.       | 1580    | 1,0×     | 3179 m | 1,265 (3,22)     | 31/38 (29/35)     | 0,91    |
| P1         | 3,93 mil.       | 1035    | 1,5×     | 3206 m | 1,265 (3,22)     | 105/120 (11/29)   | 0,73    |
| P2d        | 2,11 mil.       | 819     | 1,9×     | 3242 m | 1,263 (3,22)     | 134/159 (68/92)   | 0,66    |
| **P2c**    | **1,46 mil.**   | **574** | **2,8×** | 3197 m | 1,260 (3,22)     | 88/102 (43/56)    | 0,77    |
| P3 Steiner | 0,54 mil.       | 267     | 5,9×     | 2869 m | 1,766 (4,05)     | 589/515 (525/473) | 0,10    |

**24 měsíců od holé vsi** (přepočet 1. dne v měsíci, mezi nimi vyšlapanost podle pravidel hry –
přírůstek provoz − 1 za den, 0–1 500, síla od 50 = vyšlapanost / 1 000) – jak se síť ustálí:

| Varianta                          | Na přepočet    | Vyjmutí   | Délka (24. měs.) | Objížďka | Mění se buněk za měsíc | Proti P0 (Jaccard) |
| --------------------------------- | -------------- | --------- | ---------------- | -------- | ---------------------- | ------------------ |
| P0 – dnešní postup                | 1640 ms        | 5,64 mil. | 3197 m           | 1,264    | 9/10                   | –                  |
| **P2c – z domu, po sobě, 2 kola** | **538 (3,0×)** | 1,43 mil. | 3150 m           | 1,263    | 16/17                  | 0,81 (25/25 dál)   |
| P5 – z domu, po sobě, 1 kolo      | 283 (5,8×)     | 0,73 mil. | 2912 m           | 1,261    | 48/26                  | 0,56 (182/82 dál)  |
| P4 – z domu, souběžně, 1 kolo     | 439 (4,0×)     | 0,72 mil. | 3349 m           | 1,256    | 235/225                | 0,48 (149/169 dál) |

**Co ukazují obrázky** (mřížka shora, vlevo dnešní síť, vpravo nová; jen mimo repo):

- Ve Vlkově s cestami jsou dnešní síť a P2c na pohled stejné – trasy drží pevné cesty a vyšlapanost.
- Bez cest se P2c liší jen místy: slabé pěšiny k jednotlivým polím jdou o buňku vedle, hlavní
  kmeny (k vodě, k lesu, ke kraji mapy) jsou tytéž.
- Steinerův strom spojí vše jedním stromem: k západnímu kraji mapy jde oklikou přes jih,
  kratší a řidší síť, ale dlouhé objížďky.
- P4 (jen vyšlapanost) má souběžné pěšiny, které se střídají měsíc po měsíci – to je přesně to, co
  dnešní šlapání v přepočtu odstranilo.

## 4. Doporučení (návrh Clauda)

**Co:** přejít na **pole z domu (P2c)** – v každém kole domácnosti po sobě od nejvytíženější,
každá jedno Dijkstrovo hledání z brány, které skončí, když dosáhne všech jejích cílů (první
dosažená buňka cíle = konec trasy; pochůzky – nejbližší místo), pak se všechny její trasy přičtou
a vyšlapou. Dvě kola, vyhlazení a sleva jako dnes. Cíle v jiné souvislé oblasti se vyřadí předem.

**Proč:** model (aktivní chodci, zvyk, vyšlapanost) zůstává – osvědčil se a odpovídá literatuře.
Mění se jen počet hledání: 8 na kolo místo ≈ 180. Síť je skoro stejná (výše) a trasy jednoho
domu mají ze stromu nejkratších cest společný kmen samy. Ostatní přístupy buď mění vzhled
víc (P5, P4, Steiner), nebo nezrychlí dost (P1), nebo se k šlapání po každé trase nehodí (LPA\*,
HPA\*, Physarum).

**Zrychlení (odhad):** hledání sítě 2,8–3,2× (≈ 1,1 s → ≈ 0,37 s), přepočet ≈ 1,7 s → ≈ 1,0 s,
rok Vlkova ≈ 20–22 s → ≈ 14–15 s (9 přepočtů). S přepočtem až 1. dne v měsíci (Kolo 4, návrh a –
6 přepočtů) ≈ 11–12 s, s jedním kolem navíc (P5) ≈ 10 s. Hrubší mřížka (Kolo 4, návrh c) by
ubrala ještě ≈ 40 % hledání – obojí ale mění vzhled víc. Odhad z poměrů prototypu, ne měření jádra.

**Co se změní na vzhledu a pravidlech (schvaluje Martin):**

- Pravidlo slévání v [paths.md](../paths.md) – „domácnosti jdou ke společnému cíli zvlášť,
  nejvytíženější první“ se změní na „domácnosti po sobě, nejvytíženější první, každá najednou ke
  všem svým cílům; další se přidá k pěšinám těch před ní“. Uvnitř jednoho domu se trasy neslévají
  šlapáním, ale sdílejí kmen ze stromu nejkratších cest; ve druhém kole se slévají jako dnes.
- Při příštím přepočtu se v každé vsi posune 15–25 % viditelných pěšin, skoro všechny o jednu
  buňku (3,75 m); kde jsou pevné cesty, zůstane vše na místě. Pevné cesty, vyšlapanost a stavby
  se nemění.

**Co vyžaduje det-math a nezávislost na kouscích dopočtu:**

- Ceny kroků dál po kvantech 1/1024 (`quantizedStep`) – součty přesné; bez A\* (nepotřebuje ani
  odmocninu odhadu), jen sčítání a porovnání; síla pěšiny po setinách jako dnes.
- **Nové pravidlo remízy** pro hledání od brány (dnes se hledá od cíle): ze stejně drahých
  předchůdců vyhraje vyšší index; konec trasy u cíle = buňka cíle s nejmenší cenou, při rovnosti
  nejvyšší index – rozhodnout až po vyjmutí všech buněk té ceny, ne podle pořadí haldy.
- Pevné pořadí domácností (součet vah, pak index) a vyřazení cílů podle souvislých oblastí
  (4-okolí, úhlopříčka jde jen kolem průchodných rohů – tytéž oblasti jako dnešní hledání).
- Spouštění beze změny (`routeMapKey`) – výsledek závisí jen na dnech změn, ne na kouscích.
  Přestávky (`yield`) po každé domácnosti zůstanou.
- Nové zlaté otisky (otisk roku Vlkova, testy sítě) a test „jedna pěšina“ znovu.

**Rizika:** (1) prototyp nemá slévání pochůzek se sousedem (`ERRAND_REACH`) ani remízy jádra –
skutečný rozdíl proti dnešku může být o pár buněk jiný; (2) vsi s jednou domácností a mnoha cíli
zrychlí méně (pole jde k nejvzdálenějšímu cíli); (3) časy z vytíženého stroje – zrychlení je
poměr ve stejném běhu, absolutní čísla se budou lišit; (4) úprava navazujících míst (uložené
trasy, `visits`, `ends` pochůzek, převážení `stableRouteWeights`) – rozhraní zůstává, mění se jen
vnitřek `routeAllSteps`.

**Odhad práce: M** – přepis hledání v `network-search.ts` (pole z brány, konce cílů, pochůzky,
remízy), testy determinismu a remíz, nové otisky, text v paths.md a docs/code. Varianty navíc
(jedno kolo, přepočet 1. v měsíci) jsou S, každá zvlášť na pokyn.

## 5. Otázky pro Martina

1. Smí se síť pěšin počítat „z domu“ (každá domácnost najednou ke všem cílům) místo „každá dvojice
   dům × cíl zvlášť“ – síť ≈ 3× rychleji, pěšiny se při příštím přepočtu místy posunou o 3,75 m?
2. Stačí, že se trasy ve stávajících vsích změní až při jejich dalším přepočtu (stavba, ohrada,
   cesta), nebo chceš jednorázový přepočet všech vsí hned po změně?
3. Přepočítávat mapu tras až 1. dne dalšího měsíce (změny měsíce najednou, Kolo 4 návrh a) –
   Vlkov 9 → 6 přepočtů za rok, stavba se v pěšinách projeví až od dalšího měsíce?
4. Jen kdyby rok Vlkova po bodech 1–3 trval pořád přes 10 s: jedno kolo hledání místo dvou – ještě ≈ 2×
   rychleji, ale síť o ≈ 9 % kratší a víc odlišná (Jaccard 0,56 proti dnešku)?

## Zdroje

- Helbing, D., Keltsch, J., Molnár, P. (1997): Modelling the evolution of human trail systems.
  Nature 388, 47–50. doi:10.1038/40353 (arXiv cond-mat/9805158).
- Helbing, D., Schweitzer, F., Keltsch, J., Molnár, P. (1997): Active walker model for the
  formation of human and animal trail systems. Phys. Rev. E 56, 2527–2539 (arXiv cond-mat/9806097).
- Goldstone, R. L., Roberts, M. E. (2006): Self-organized trail systems in groups of humans.
  Complexity 11(6), 43–50. doi:10.1002/cplx.20135.
- Tero, A. a kol. (2010): Rules for biologically inspired adaptive network design. Science 327,
  439–442. doi:10.1126/science.1177894; Tero, A., Kobayashi, R., Nakagaki, T. (2007): J. Theor.
  Biol. 244, 553–564. doi:10.1016/j.jtbi.2006.07.015.
- Emerson, E. (2013): Crowd Pathfinding and Steering Using Flow Field Tiles. Game AI Pro, kap. 23
  (gameaipro.com); Treuille, A., Cooper, S., Popović, Z. (2006): Continuum Crowds. ACM TOG 25(3),
  1160–1168. doi:10.1145/1141911.1142008.
- Koenig, S., Likhachev, M. (2002): D\* Lite. AAAI-02, 476–483; Koenig, S., Likhachev, M.,
  Furcy, D. (2004): Lifelong Planning A\*. Artificial Intelligence 155, 93–146.
  doi:10.1016/j.artint.2003.12.001.
- Botea, A., Müller, M., Schaeffer, J. (2004): Near Optimal Hierarchical Path-Finding. Journal of
  Game Development 1(1).
- Takahashi, H., Matsuyama, A. (1980): An approximate solution for the Steiner problem in graphs.
  Math. Japonica 24(6), 573–577; Althöfer, I. a kol. (1993): On sparse spanners of weighted graphs.
  Discrete Comput. Geom. 9, 81–100. doi:10.1007/BF02189308.
- Barthélemy, M., Flammini, A. (2008): Modeling urban street patterns. Phys. Rev. Lett. 100, 138702. doi:10.1103/PhysRevLett.100.138702; Barthélemy, M. (2011): Spatial networks. Physics
  Reports 499, 1–101.
- Sethian, J. A. (1996): A fast marching level set method for monotonically advancing fronts.
  PNAS 93(4), 1591–1595. doi:10.1073/pnas.93.4.1591.
