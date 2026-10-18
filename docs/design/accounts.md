# Účty hráčů – registrace a přihlášení

Stav: schváleno 16. 10. 2026.

## Proč

Na hráčském účtu visí všechno ostatní – první vesnice, rod, pozvánkové kódy i vazalství.
Registrace má být co nejkratší.

## Pravidla

- **Registrace:** e-mail a heslo (aspoň 8 znaků). K účtu se ukládá jazyk – zatím vždy čeština;
  výběr jazyka se do formuláře přidá, až bude víc jazyků (překlady se řeší těsně před nasazením).
- **Ověření e-mailu:** po registraci přijde e-mail s odkazem, po kliknutí je hráč ověřený
  a rovnou přihlášený. S neověřeným e-mailem se přihlásit nejde.
- **Přihlášení:** e-mail + heslo, nebo přes Google (e-mail se vezme z Google účtu). Tlačítko
  Google se zobrazí, jen když jsou nastavené přihlašovací údaje z Google Cloud Console.
- **Zapomenuté heslo:** e-mail s odkazem na nastavení nového hesla.
- **Herní plocha** (`/game`) je jen pro přihlášené – nepřihlášeného pošle na přihlášení. Zatím
  prázdná, s herním datem v rohu a tlačítkem „Odhlásit“.
- **Adresy stránek anglicky** (`/login`, `/register`, `/game`) – fungují pro všechny budoucí
  jazyky.

## Technika

- **Better Auth** – registrace, ověření e-mailu, obnova hesla, Google, sessions v databázi.
- **`packages/db`** – Drizzle + PostgreSQL, migrace jako SQL soubory v gitu.
- **E-maily** se lokálně jen vypisují do terminálu (odkaz se zkopíruje odtamtud). Skutečné
  odesílání přijde s nasazením.
- **Kdo se pokusí přihlásit s neověřeným e-mailem**, dostane nový ověřovací odkaz – nezůstane
  zaseknutý, když první e-mail ztratí.
- **Po obnově hesla** se odhlásí všechna ostatní přihlášení.
- **Omezení pokusů** (výchozí Better Auth, v produkčním režimu): přihlášení a registrace 3×
  za 10 s, žádost o obnovu hesla 3× za minutu – vše na IP adresu.
- **Registrace existujícího e-mailu** vypadá navenek stejně jako nová (nikdo nezjistí, kdo je
  zaregistrovaný).
- **Testy:** end-to-end test v prohlížeči (Playwright) celé cesty registrace → ověření →
  přihlášení → herní plocha → odhlášení a obnovy hesla, proti samostatné testovací databázi.

## Vývojový režim (Martin, 18. 10. 2026)

> „Někteří hráči – teď vlastně jenom můj profil Jarmil – budou mít tzv. dev mód. V dev módu budu
> mít vedle data dvě šipky – jedna přeskočí dál o měsíc a druhá o rok – je to proto, abych při
> testování hry nemusel čekat, až se vesnice rozroste atd.“

- **Kdo:** účty s příznakem vývojového režimu. Hráč si ho zapnout nemůže, v rozhraní se
  nepřepíná – nastavuje ho jen skript vývojového účtu (`npm run db:seed-dev`, dnes jen Jarmil).
- **Šipky vedle data v liště:** ▶ přeskočí **měsíc** (30 herních dní), ⏩ **rok** (365 dní).
  Dokud server přeskočení nedokončí, obě šipky čekají.
- **Posun času hráče:** přeskočení nehýbe světem, jen hráčem – hráč pak žije o posun napřed
  (dnešní den = den světa + posun). Posun platí pro všechno, co hráč vidí a dělá: dopočet
  a akce vsí, datum v liště, roční období a dým ve scéně. Ves se při přeskočení hned dopočítá
  do nového dne.
- **Jen dopředu:** posun jen roste – uložený stav vsi se nikdy nevrací zpět. Nejdál do
  posledního dne světa (31. 12. 1499).
- **Ostatní hráči** šipky nevidí a server jim přeskočení odmítne.

## Mimo rozsah

Pozvánkové kódy (přijdou s mechanikou vazalství), jméno rodu, odesílání skutečných e-mailů,
nastavení účtu (změna jazyka, hesla) a smazání účtu.
