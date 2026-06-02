// Regression for the "bots orbit and never reach you" bug: a PASSIVE human
// (standing still, not shooting) must still get reached and damaged by bots.
import { Client } from "colyseus.js";

const PORT = 2567;
const ROOM = "arena";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => {
  console.error("❌ FAIL:", m);
  process.exit(1);
};

const client = new Client(`http://localhost:${PORT}`);
const room = await client.joinOrCreate(ROOM);
room.onMessage("shot", () => {});
const me = () => room.state.players.get(room.sessionId);
await sleep(400);

// Stand still: send idle input every tick, never move, never shoot.
let seq = 0;
let damaged = false;
const start = Date.now();
while (Date.now() - start < 14000) {
  seq++;
  room.send("input", { seq, left: false, right: false, jump: false, aim: 0 });
  await sleep(16);
  if (me().hp < me().maxHp) {
    damaged = true;
    break;
  }
}

const took = ((Date.now() - start) / 1000).toFixed(1);
console.log(`passive human: hp=${me().hp}/${me().maxHp} after ${took}s (bots reached & shot = ${damaged})`);
if (!damaged) fail("bots never reached/damaged a stationary player within 14s (pathing/orbit bug)");

console.log("✅ M3 REACH TEST PASSED");
await room.leave();
process.exit(0);
