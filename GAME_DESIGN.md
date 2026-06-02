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
| M1 | Ruch + arena | Matter.js platforming, 1 mapa, server-authority + prediction |
| M2 | Walka | Hitscan, HP, śmierć/respawn |
| M3 | Boty + fale | AI + spawner → pierwsza grywalna Horda |
| M4 | Klasy | 3 klasy + wybór loadoutu |
| M5 | Killstreaki | Ładowanie + aktywacja |
| M6 | Bronie + warsztat | XP/kasa/blueprinty, ulepszanie broni |
| M7 | Juice | Ragdolle, gibsy, screen shake, dźwięki, UI |
| M8 | PvP | TDM + FFA |
| M9 | 1v1 + duety | 1v1 online + tryby z botami |

## 11. Źródła / inspiracja
- Strike Force Heroes 3 Wiki (klasy): https://strike-force-heroes-3.fandom.com/wiki/Classes
- Strike Force Heroes 3 Wiki (killstreaki): https://strike-force-heroes-3.fandom.com/wiki/Killstreaks
- Strike Force Heroes 3 Wiki (ogólne): https://strikeforceheroes.fandom.com/wiki/Strike_Force_Heroes_3
