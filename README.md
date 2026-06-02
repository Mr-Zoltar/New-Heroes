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

Open `http://localhost:5173` in **two** browser windows — each spawns a player
square; move with **WASD / arrows** and watch both windows stay in sync
(server-authoritative movement).

## Status — Milestone M0 (skeleton) ✅

- Monorepo wired (shared / server / client).
- Client ↔ server connection over one Colyseus room.
- Multiple players synchronized: authoritative movement on the server,
  interpolated rendering on the client.

Next: **M1 — Matter.js movement + arena collisions** (see roadmap).
