# New Heroes — Dokument projektowy gry (GDD)

> Gra w stylu **Strike Force Heroes 3** — szybka strzelanka 2D z boku, klasy, killstreaki,
> warsztat broni — przerobiona na **multiplayer** (Colyseus).

**Status:** design v0.1 (2026-06-02)

---

## 1. Stack technologiczny
- **Klient:** Phaser 3 + Matter.js (fizyka wbudowana w Phaser), **TypeScript**
- **Serwer:** Colyseus (Node.js), **TypeScript**
- **Synchronizacja:** Colyseus state sync (`@type` schema) + messages

## 2. Model sieciowy (architektura)
**Serwer autorytatywny od początku** (lekka wersja):
- Matter.js **na serwerze** = źródło prawdy (ruch, kolizje, raycast hitscan, AI).
- **Client-side prediction** dla własnego gracza (natychmiastowy ruch/skok).
- **Interpolacja** dla innych graczy i botów.

Uzasadnienie: co-op vs AI sprawia, że server-authority jest łatwy (boty nie spierają się
o trafienia), a jest to fundament wymagany i tak pod PvP oraz 1v1.

## 3. Filary rozgrywki (czego nie gubimy z SFH3)
1. Szybka, „soczysta" akcja 2D z boku — celowanie myszką, gibsy, ragdolle (Matter.js).
2. Klasy z wyraźnym charakterem.
3. **Killstreaki** — nagroda za serię zabójstw, chwilowy power-spike.
4. Warsztat / progresja broni (ulepszanie: ammo, fire rate, accuracy, impact).

## 4. Tryby gry
- **MVP / start:** Co-op **Horda vs AI**, 1–4 graczy, fale botów na jednej arenie.
- **Docelowo:** PvP Team Deathmatch → PvP Free-for-all → areny w stylu kampanii SFH3
  → **1v1 online** oraz duety z dopełnianiem botami.

## 5. Walka
- **Hitscan** (raycast po linii celowania) — jak w SFH3; responsywne i łatwiejsze sieciowo.
- (Później opcjonalnie) granaty/rakiety jako fizyczne pociski Matter.js.

## 6. Klasy (na start 3, docelowo do 8 jak w SFH3)
| Klasa | Rola | Broń | Killstreak (przykład) |
|---|---|---|---|
| **Mercenary** | Uniwersalny DPS | Karabiny / SMG | Buff drużyny (fire rate / krytyki) |
| **Juggernaut** | Tank, dużo HP | Shotguny / miniguny | Tarcza + chwilowa odporność |
| **Sniper** | Burst z dystansu | Snajperki | Wallhack + bonus dmg na czas |

Później: **Engineer** (turrety — świetny do Hordy), **Ninja** (szybki, assassynacja).

## 7. Sterowanie
- A/D ruch, W/Spacja skok, myszka celowanie, LPM strzał, PPM/E skill, Q killstreak.

## 8. Pętla rozgrywki
1. Wybór klasy + loadout (2 bronie + skill).
2. Walka na arenie → zabójstwa ładują killstreak.
3. Po meczu: XP, kasa, blueprinty → warsztat (ulepszanie/craft broni).
4. Lepszy loadout → trudniejsze fale / wyższe rangi.

## 9. MVP (pionowy wycinek)
2 graczy w jednym pokoju, 1 arena, 1 klasa, 1 broń, boty w falach, działający killstreak.

## 10. Roadmapa
| # | Kamień | Rezultat |
|---|---|---|
| M0 ✅ | Szkielet | Phaser+TS ↔ Colyseus+TS, 2 prostokąty synchronizowane (zrobione 2026-06-02) |
| M1 ✅ | Ruch + arena | Matter.js platformer (grawitacja/skok), arena z kolizjami, server-authority + client-side prediction z rekonsiliacją (zrobione 2026-06-02) |
| M2 ✅ | Walka | Hitscan (raycast na serwerze), celowanie myszką, HP, obrażenia, śmierć + respawn, kills/deaths, tracery (zrobione 2026-06-02) |
| M3 ✅ | Boty + fale | **GOAP** + **A\* pathfinding** (nav-grid z jump-linkami) + spawner fal, co-op ludzie vs boty → grywalna Horda (zrobione 2026-06-02) |
| M4 | Klasy | 3 klasy + wybór loadoutu |
| M5 | Killstreaki | Ładowanie + aktywacja |
| M6 | Bronie + warsztat | XP/kasa/blueprinty, ulepszanie broni |
| M7 | Juice | Ragdolle, gibsy, screen shake, dźwięki, UI |
| M8 | PvP | TDM + FFA |
| M9 | 1v1 + duety | 1v1 online + tryby z botami |

## 10a. Plan M3 — boty (GOAP + pathfinding)

Wszystko **server-authoritative**, deterministyczne (stały tick). Bot = ciało Matter
jak gracz; wpis w `players` z flagą `isBot` → reużywa fizyki, walki i renderu.

1. **Nav-grid** (budowany raz przy starcie pokoju z geometrii areny):
   - węzły = pozycje „stania" (komórki tuż nad platformą/podłogą),
   - krawędzie: chód (sąsiednie po powierzchni), zejście (drop na niższą platformę),
     **jump-linki** (skok między platformami — walidowany symulacją łuku skoku z
     `shared`: jumpVelocity + grawitacja + moveSpeed).
2. **A\* pathfinding** po nav-grid → lista waypointów (chód / skok / drop). Bot tłumaczy
   waypoint na input (left/right, jump na starcie jump-linku). Re-path gdy cel zmieni komórkę.
3. **GOAP** (per bot): świat (hasLOS, inRange, hpLow, targetAlive…), cele (KillTarget,
   Survive), akcje z pre/efektami/kosztem (MoveToTarget→pathfinder, GetLOS/Flank, Shoot→
   istniejący hitscan, Retreat/TakeCover). Planner = A* po akcjach → plan; re-plan gdy świat
   się zmieni. F.E.A.R.-style: GOAP wybiera CO, pathfinder robi JAK.
4. **Celowanie**: kąt do celu (leading wg prędkości celu — pod przyszłe pociski; hitscan na razie wprost).
5. **Spawner fal**: fala N → liczba botów = f(N), spawn w czasie; po wyczyszczeniu fali → następna.
   Stan w schemie: `wave`, `botsAlive`. Co-op: ludzie vs boty.

**Zakres M3 (grywalne):** nav-grid + A* + jump-linki · GOAP ~4 akcje / 2 cele · boty w
`players` (isBot) · spawner z rosnącą liczbą · HUD fali. Skalowanie trudności = liczba (reszta M4+).

**Weryfikacja (headless):** nav-grid buduje się (węzły + jump-linki istnieją) · A* znajduje
ścieżkę przez jump-link · GOAP zwraca sensowny plan (brak LOS → MoveTo→Shoot; hpLow → Retreat)
· integracja: bot dochodzi do stojącego gracza i zadaje dmg; ubicie botów → kolejna fala.

## 11. Źródła / inspiracja
- Strike Force Heroes 3 Wiki (klasy): https://strike-force-heroes-3.fandom.com/wiki/Classes
- Strike Force Heroes 3 Wiki (killstreaki): https://strike-force-heroes-3.fandom.com/wiki/Killstreaks
- Strike Force Heroes 3 Wiki (ogólne): https://strikeforceheroes.fandom.com/wiki/Strike_Force_Heroes_3
