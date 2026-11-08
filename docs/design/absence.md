# Dlouhá nepřítomnost hráče

Stav: **rozhodnuto 8. 11. 2026** (Martin, po bodech níž). Podrobnosti jsou návrh Clauda.

Hráč, který dva týdny nehraje, prožije ≈ 40 herních let – víc než generaci. Svět běží dál, worker
vsi dopočítává ([worker](../code/worker.md)), ves bez správce žije podle pravidel vesničanů a
správce se sám nezapne (Martin 8. 11. 2026: „Ne, správce se sám nezapne. Ves by měla nějakým
způsobem mírně růst nebo i stagnovat bez něj.“). Nástupnictví a vymření rodu řeší
[vojvodova rodina](lord.md) a [seniorát](seniorate.md).

## Jména synů

**Implementováno** (8. 11. 2026) – `docs/code/village-people.md`, `nameWaitingSons`.

- Syn, kterému hráč **do jednoho herního roku** od narození nedá jméno, dostane **jméno obvyklé
  v rodě** – Martin 8. 11. 2026: „Ať dostane nějaké jméno obvyklé v rodě, např. po dědečkovi nebo
  strýci. Pokud by žádné takové nebylo, ať se vygeneruje.“
- Pořadí (návrh Clauda): dědeček z otcovy strany → strýc (otcův bratr) → praděd po meči →
  jiný muž rodu; jméno, které v rodě právě nese žijící muž ve stejné vsi, se přeskočí. Nic
  takového → vygenerované jméno jako u vnuků ([vojvodova rodina](lord.md) – Generovaná jména
  vnuků). Volba je deterministická (seed vsi a dne).
- Hráč smí jméno později přepsat stejně jako dnes (návrh Clauda) – jméno od rodu **jednou**, pak je
  trvalé jako jméno od hráče. Zemřelí muži rodu a jejich jména se pamatují (nejvýš 40), aby šlo
  jméno dát i po zemřelém dědovi či strýci. Kronika: „Syn dostal jméno X po dědovi / strýci“
  (návrh Clauda).

## Povinnosti vazala, když hráč nehraje

Martin 8. 11. 2026: „ano“ – za nepřítomného hráče jedná jeho **formální správce** (nejstarší syn
od 16 let, bez něj vojvoda – [správce](steward.md) – Správce je šlechtic) podle dohodnutých
podmínek:

- **Roční potvrzení dávek:** neodpoví-li hráč do lhůty, potvrdí se dávky jako loni; nemá-li na ně
  ves, odvede, co může, a pán to vidí jako neplnění ([vazalství](vassalage.md)).
- **Svolání:** neodpoví-li hráč do lhůty, pošle správce dohodnuté muže, kteří jsou doma a zdraví
  (stejně jako NPC rod – `answerNpcSummons`).
- **Nová jednání** čekají na hráče; bez odpovědi do lhůty vyprší (návrh Clauda: 1 herní rok).

**Implementováno 8. 11. 2026** (kód: [vazalství](../code/vassalage.md) – Správce za nepřítomného
hráče). Podrobnosti a lhůty jsou návrh Clauda (`ABSENT_VASSAL` v `rules-absence.ts`):

| Co                  | Lhůta                                    | Skutečný čas | Co udělá správce / svět                                                                  |
| ------------------- | ---------------------------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| Roční Odvody 1. 11. | do konce roku – 60 dní (31. 12.)         | ≈ 1,4 h      | odvede domluvené, u každé vsi nejvýš přebytek (co ves může postrádat); míň = neplnění    |
| Svolání             | 30 herních dní od svolání                | ≈ 43 min     | pošle domluvený počet nejzdatnějších mužů rodu, kteří jsou doma a zdraví; míň = neplnění |
| Návrh v jednání     | 1 herní rok (365 dní) od posledního kola | ≈ 8 h 46 min | jednání vyprší – obě strany dostanou upozornění, kronika obou rodů                       |

- **Kdo jedná:** ve hře se to ukazuje jako „správce“ – formální správce rodu (nejstarší syn od 16
  let, jinak vojvoda); kterou osobu to je, se nepočítá, rod jedná vždy, dokud žije.
- **Roční Odvody** zahrnují i řádek splátky půjčky a tribut z míru – oba chodí 1. 11. ve stejném
  dialogu (návrh Clauda). Správce posílá předvyplněné rozdělení po vsích, ale u každé vsi nejvýš
  její přebytek – pojistku jídla a osiva na 2 roky nesáhne. Vsi se před odpovědí dopočítají do
  dneška (i uspané). Protože správce odpoví do konce roku, dialog už další 1. 11. nenaroste.
- **Svolání:** správce své vazaly nesvolává (vazal vazala); po konci války nejedná – svolání
  propadne jako dřív. Svolání NPC rodu splní server hned, jako dosud.
- **Jednání:** vypršení není odmítnutí – pauza po odmítnutí se nezapisuje a nový návrh smí kdokoli
  poslat hned. Žádost odříznutého nováčka o pána nevyprší – má vlastní týden a los
  ([nováčci](newcomers.md)).
- **Kdo dřív:** vše hlídá krok světa (worker) podle herního dne, ne podle toho, kdo je online.
  Hráč, který odpoví do lhůty, má přednost – odpověď uzavře dialog podmíněně, druhá neprojde.
- **Když správce nemůže** (návrh Clauda): selže-li odvod nebo svolání důvodem, který se sám
  nespraví (pán nemá cílovou ves, ves zanikla), uzavře se dialog jako „nic neodvedl / nikoho
  neposlal“ – neplnění, bez opakování; přechodná chyba (souběh) se zkusí v příštím kroku světa.
- **Co hráč vidí:** v dialogu Odvody přesýpací hodiny s datem, kdy odvede správce; u Svolání
  datum v popisku rohu. Po lhůtě upozornění „Správce za tebe poslal …“; pán vidí u odvodu i mužů
  „za nepřítomného … správce“.

## Návrat

Žádné zvláštní shrnutí – Martin 8. 11. 2026: „Ne, může si přece sám zobrazit panel s notifikacemi
a kroniku.“

- **Panel Kronika** (implementováno, návrh Clauda): kniha v liště vedle praporu rodu otevře
  zápisy kroniky zobrazené vsi od nejnovějších, po herních letech; starší roky se načítají po
  stránkách ze serveru. Kód: `docs/code/web-ui.md` – Panel Kronika.
- **Panel Upozornění** (implementováno, návrh Clauda): zvonek vedle knihy kroniky otevře uložená
  upozornění mezi hráči (jednání, vazalství, válka, odvody…) od nejnovějších, s herním datem, po
  stránkách ze serveru; nová od posledního otevření jsou zvýrazněná a jejich počet je číslem u
  ikony. Upozornění vsi (hlad, nedostatek surovin…) se neukládají – odvozují se z pohledu a stav
  vsi ukazují řádky nahoře. Kód: `docs/code/web-ui.md` – Panel Upozornění.

## Opuštěný rod

Martin 8. 11. 2026: „A“ – rod hráče, který měsíce nehraje, **zůstane ve světě napořád**: žije jen
podle pravidel vesničanů, ostatní ho smějí podrobit nebo vyplenit jako kohokoli; když vymře,
zanikne a jeho vsi připadnou podle odúmrti ([vazalství](vassalage.md)). Žádné zvláštní pravidlo
nečinnosti.

## Zátěž serveru

**Implementováno** (8. 11. 2026) – `docs/code/worker.md`, Uspání nečinných. Návrh Clauda 8. 11.: spící vsi worker počítá s nejnižší předností, když nemá jinou práci – ušetří jen při
nedostatku kapacity; čeká na Martina.

Martin 8. 11. 2026: „A“ – ves hráče, který nehraje **déle než 3 skutečné dny** (návrh Clauda),
se **uspí**: worker ji průběžně nepočítá a dopočítá ji, až se jí něco dotkne (hráč se vrátí,
nájezd, obchod, dávky, rozvoz jídla domény, pohled jiného hráče). Výsledek je díky determinismu
**stejný** jako při průběžném výpočtu (výsledek nezávisí na kouscích dopočtu); jen server ušetří
práci. Plánované události, které se dějí bez dotyku (svolání, roční potvrzení dávek, nástupnictví),
si ves dopočítá při jejich kroku světa.
