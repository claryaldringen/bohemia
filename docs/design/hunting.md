# Lov – naháňka a souboj se zvěří (issue #12)

Stav: **schváleno** – Martin 22. 11. 2026 (po kontrole stavitelem): „Jo, schvaluji návrh lovu“. Co řekl Martin, je u bodu s datem; ostatní je návrh Clauda. Nahrazuje
oddíl Lov rodu v [divoké zvěři](wildlife.md) (kalendářní lov a lov navíc).

## Proč

Martin, issue #12 „Úprava lovu“ (22. 11. 2026): „Lov bude nově probíhat takto: tlačítko lovu bude enabled nebo disabled
s důvodem; důvod může být: 1. není lovecká sezóna 2. není dost volných člověkohodin k naháňce; Když na tlačítko kliknu,
volní muži vyrazí do lesa, odkud vyženou zvíře (jelena, laň, kance, bachyni, vlka, medvěda); Hráč ovládá knížete
a kliknutím na lovené zvíře mu dá povel na to zvíře zaútočit - bude to stejná mechanika jako při boji; Když kníže zvíře
zabije, honci ho odnesou do dvorce na tyči mezi sebou a jeho maso a kožešina se započítá jako normálně“.

## Martinova rozhodnutí (22. 11. 2026)

- **Nahrazuje dnešní lov:** na otázku, zda nový lov dnešní (kalendářní lov rodu listopad–únor a lov navíc) nahradí, nebo
  k němu přibude: „Má ho nahradit.“
- **Výcvik a umění:** „tím že je mechanika stejná jako boj, tak se tím ten boj cvičí. Pokud to bude vojvoda provozovat na
  koni, tak si tím cvičí i jízdu. Na ulovení prasete je potřeba mít určitý jezdecky a bojový skill - nováček to nezvládne,
  protože je potřeba trefit se kanci shora přímo za krk. Ještě náročnější je to z koně, protože je koně potřeba ovládat
  klasickým jezdeckým uměním podobně, jako se koně ovládají při býčích zápasech. Jelen/laň budou jednoduší - ty stačí
  uštvat, po čase zastaví a nechají se zabít.“
- **Kdo útočí:** na otázku, kdo z rodu má na lov vyrazit: „Vlastně můžu vybrat kohokoliv, s kým můžu pohybovat. Klidně
  i rolníka“.
- **Sezóna:** na doporučení „kdykoli kromě března až května, jako dnes u lovu navíc“: „ok“.
- **Délka:** „lov může trvat maximálně 1 den. Po 24 hodinách honci odejdou domů a budou se věnovat práci, které by se
  věnovali normálně“; na otázku, zda den herního času, nebo 24 skutečných hodin: „Den herního času“.
- **Které zvíře:** na otázku, zda náhoda podle počtů zvěře, nebo si hráč vybere: „Má to být náhoda“.
- **Honci:** na doporučení 6 volných mužů na celý den: „ok“.
- **Nebezpečí:** na otázku, zda vyhnané zvíře může lovce zranit nebo zabít (kanec, bachyně, vlk a medvěd se brání, jelen
  a laň ne): „Ano“.
- **Správce:** na otázku, zda má správce ve vsi bez hráče dál lovit sám: „Správce je vlastně NPC hráč, takže by měl mít
  možnost dělat téměř vše, co skutečný hráč“.
- Shrnutí návrhu (body níž 1–7) Martin potvrdil: „Takhle je to ok“.
- **Čas ve scéně** (otázka, zda má scéna lov zrychlit do herního dne, nebo smí trvat déle): „Ok, udělejme to takhle.
  Rychlost lovu zachovejme, lov může teoreticky trvat libolně dlouho, ale práce těch lidí se odečte pouze za 1 den. Když
  se dlouho nebude nic dít (lovec ovládaný hráčem bude pouze postávat), tak zvíře uteče zpět do lesa a honci se vrátí
  domů“.
- **Víc lovců** (otázka, zda smí hráč poslat na zvíře víc lidí najednou a zda i ženy a děti; doporučení Clauda: víc mužů
  od 14 let, ženy a děti ne): „Ano. Bude to zkrátka jako boj proti zvířeti“.
- **Honci a stavby** (doporučení Clauda: lov má přednost před stavbami a opravami, ne před polními pracemi v jejich oknech
  a žní): „Ano, jak navrhuješ“.
- **Ves bez hráče a bez správce** (otázka, zda má lovit sama): „Vesničané si loví jen drobnou zvěř a ryby pro vlastní
  potřebu“.
- **Poslední muž rodu** (otázka, zda ho smí lov zabít): „Správce je NPC hráč, takže na lov chodí on.“

## Pravidla

1. **Konec dnešního lovu:** kalendářní lov rodu (listopad–únor každý 7. den) a lov navíc se ruší (Martin); ruší se i to, že
   den lovu je výcvik rodu (6 h) – boj a jízdu cvičí lov sám (bod 5). Letní hlídka a obrana polí (psi, hlídky) zůstávají.
2. **Tlačítko lovu** na panelu dvorce (ikona oštěpu jako dnes, bez popisku, důvod u kurzoru – UI jako 0 A.D.):
   zašedlé, když **není sezóna** (březen–květen – hájení mláďat; Martin „ok“), když **ves nemůže uvolnit 6 mužů na celý
   den** a když už lov běží. Honci jsou dospělí muži po denním minimu; lov má přednost před stavbami a opravami (den
   počkají), ne před polními pracemi v jejich oknech a žní (Martin „Ano, jak navrhuješ“). Vsi se odečte **práce honců za
   jeden herní den** (Martin); lov ve scéně běží normální rychlostí a smí trvat déle.
3. **Naháňka:** honci (6 mužů, se psy dvorce, jsou-li – návrh Clauda) jdou ve scéně do nejbližšího lesa a vyženou
   **jedno zvíře**: jelena, laň, kance, bachyni, vlka nebo medvěda – **náhodou podle počtu té zvěře v lese vsi** (stavy
   zvěře – wildlife.md; medvěd jen tam, kde žije; ze seedu vsi a dne – determinismus). Zvíře vyběhne z lesa a utíká.
4. **Útok:** hráč vybere kohokoli, s kým může pohybovat (muž rodu, i rolník – Martin) – **jednoho i víc mužů od 14 let**,
   ženy a děti ne (Martin: „Bude to zkrátka jako boj proti zvířeti“) – a povelem na zvíře je pošle útočit –
   **mechanika boje** ([válka](war.md) – Boj): útočník zvíře dohání (na koni rychleji), střetne se s ním a bojuje podle
   svých dovedností (luk, boj, jízda 0–100).
   - **Kanec a bachyně** (Martin): zabije je jen lovec s dost bojového umu – rána shora za krk; z koně navíc s dost jezdeckého
     umu. Nováček nezvládne – rána mine a kanec útočí. Prahy dovedností pěšky a z koně návrh Clauda (rešerše, čísla
     v `rules`).
   - **Jelen a laň** (Martin): stačí je uštvat – útočník je honí, po čase (podle tempa a vytrvalosti, návrh Clauda)
     zastaví a nechají se zabít; z koně rychleji.
   - **Vlk a medvěd** se brání jako kanec; medvěd je nejsilnější.
5. **Výcvik** (Martin): lov cvičí útočníkovi boj, z koně i jízdu – podle času v boji a honbě (návrh Clauda – jako výcvik
   rodu, čísla v `rules`).
6. **Nebezpečí** (Martin „Ano“): kanec, bachyně, vlk a medvěd mohou lovce zranit nebo zabít stejně jako v boji (zranění
   a smrt podle mechaniky boje); jelen a laň ne. Kůň může v boji s kancem nebo medvědem utrpět také (návrh Clauda).
7. **Konec lovu:** zabité zvíře odnesou honci **na tyči mezi sebou do dvorce** (ve scéně); maso a kožešina se započítají
   jako dnes (wildlife.md – Kolik, převod úlovku). Kus zvěře ubude ze stavu zvěře. **Když se dlouho nic neděje** (lovec
   jen stojí), zvíře uteče zpět do lesa a honci jdou domů (Martin). Ves dopočítává po herních dnech, proto se výsledek
   lovu (maso, kůže, úbytek zvěře, zranění a smrt, výcvik) zapíše vsi schránkou v nejbližší herní den (návrh Clauda).
8. **Správce** (Martin – NPC hráč: „Správce je NPC hráč, takže na lov chodí on.“): vyhlásí lov touž akcí, když zvěř škodí
   na polích (návrh Clauda – stejná podmínka jako dnes), a lov se mu **dopočítá bez scény**: útočníky vybere jako hráč
   (nejlepší dostupní muži podle dovedností a zvířete – na kance jen ten, kdo má umění), výsledek podle mechaniky boje
   a náhody ze seedu; riziko nese stejné jako hráč, žádná zvláštní ochrana posledního muže rodu. Když hráč vyhlásí lov
   a nikoho na zvíře nepošle, zvíře po čase uteče (bod 7).
9. **Ves bez hráče a bez správce** velkou zvěř neloví – vesničané loví jen drobnou zvěř a ryby pro vlastní potřebu jako
   dnes (Martin).
10. **Výcvik a strop:** lov cvičí, co lovec používá – boj, z koně jízdu, luk jen při střelbě; platí strop dovedností jako
    u výcviku rodu (lord.md). Šelmy na výjezdu (`journey-predators.ts`) zůstávají denním losem s dnešními čísly (návrh
    Clauda).
11. **Bez meze „jednou za 3 dny“:** Martin dal jen dva důvody zašednutí tlačítka (sezóna, honci). Lovit tak jde i každý
    herní den, zvěř doroste jen při ročním přepočtu 1. 5. (wildlife.md) – přelovená krajina se tak projeví sama.

## Co se ověří

- Vlkov a zlatá ves bez kalendářního lovu: škody zvěře na polích, maso a kožešiny, dovednosti rodu – rozdíl proti dnešku
  (lov dřív cvičil rod 17 dní v zimě).
- Lov ve scéně: honci, zvíře, útok, odnos na tyči – e2e.

## Nechává se na stavitele

Zvíře jako bojová jednotka (pohyb, útěk, obrana), útok povelem jako v boji, sjednocení se scénou boje a výjezdu, prahy
a tempa (rešerše), správcův dopočet, převod stavu (rozběhnutý lov navíc, akumulátor úlovku), rozhraní.
