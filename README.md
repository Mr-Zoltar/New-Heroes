# New Heroes

Multiplayer 2D arena shooter inspired by **Strike Force Heroes 3**.
Stack: **Phaser 3** + **Matter.js** (client) · **Colyseus** (authoritative server) · **TypeScript**.

See [`GAME_DESIGN.md`](./GAME_DESIGN.md) for the full design and roadmap.

## Monorepo layout (npm workspaces)

```
shared/   shared constants + types (arena size, speed, input, messages)
server/   Colyseus 0.16 authoritative server (rooms, schema)
client/   Phaser 3 + Vite client
```

## Requirements

- Node.js ≥ 18 (tested on 24)

## Install

```bash
npm install
```

## Run (development)

Start server + client together:

```bash
npm run dev
```

- Server: `http://localhost:2567`
- Client: `http://localhost:5173`

Or run them separately:

```bash
npm run dev:server   # Colyseus on :2567
npm run dev:client   # Vite on :5173
```

Open `http://localhost:5173` in **two** browser windows — each spawns a player.
Move with **A/D or ←/→**, jump with **W / ↑ / Space**, aim with the **mouse**,
shoot by **holding LMB**. Both windows stay in sync.

## Tests

```bash
npx tsx scripts/m1-physics-test.ts     # physics + reconciliation unit test
npx tsx scripts/m2-combat-test.ts      # hitscan raycast unit test
npx tsx scripts/m3-ai-test.ts          # nav-grid + jump-links + A* + GOAP unit test
node scripts/m1-integration-test.mjs   # movement/sync end-to-end (joins with noBots)
node scripts/m3-integration-test.mjs   # Horde end-to-end: bots, damage, kills, wave advance
```

## Status

### M0 — skeleton ✅
- Monorepo (shared / server / client), one Colyseus room, players synchronized.

### M1 — Matter.js platformer + netcode ✅
- Side-view **Matter.js** physics: gravity, jumping, arena with floor / walls /
  platforms (collision geometry shared between server and client).
- **Server-authoritative** simulation (60 Hz), players pass through each other.
- **Client-side prediction + reconciliation**: the local player predicts with an
  identical local Matter world and replays unacknowledged inputs against each
  authoritative snapshot (verified 0px reconciliation drift). Remote players
  are interpolated.

### M2 — hitscan combat ✅
- **Mouse aim**; hold **LMB** to fire (auto-fire, server-enforced fire rate).
- **Server-authoritative hitscan**: the server raycasts (ray-vs-AABB against the
  arena + alive players), applies damage, and broadcasts each shot for tracer +
  hit-spark rendering.
- **HP, death, respawn**: HP bars over every player, kill/death counters, a 2.5s
  respawn at full HP. Players are excluded from each other's raycast while dead.

### M3 — AI bots + waves (Horde) ✅
- **Co-op Horde**: humans vs waves of bots (team-filtered combat — humans hurt
  bots, bots hurt humans). Wave clears → next wave (more bots).
- **A\* nav-grid pathfinding** built from arena geometry, with **jump-links**
  validated by simulating the real jump (so bots reproduce them deterministically).
- **GOAP** per bot: plans MoveToTarget → Shoot, or Retreat when low — navigation
  (HOW) handled by the nav-grid, decisions (WHAT) by GOAP.
- Room option `{ noBots: true }` creates a bot-free room (used by movement tests).

Next: **M4 — classes + loadout selection** (see roadmap).
