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
Move with **A/D or ←/→**, jump with **W / ↑ / Space**. Both windows stay in sync.

## Tests

```bash
node scripts/m1-integration-test.mjs   # end-to-end vs the running server
npx tsx scripts/m1-physics-test.ts     # pure physics + reconciliation unit test
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

Next: **M2 — combat (hitscan, HP, death/respawn)** (see roadmap).
