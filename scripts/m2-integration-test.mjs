// End-to-end M2 combat test against the live server (raw colyseus.js clients).
// Two players stack at the left wall; A shoots B → damage, death, kill credit,
// then B respawns at full HP after the delay.
import { Client } from "colyseus.js";

const PORT = 2567;
const ROOM = "arena";
const PI = Math.PI;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => {
  console.error("❌ FAIL:", m);
  process.exit(1);
};

const seqs = new Map();
async function stream(room, getInput, durationMs) {
  let seq = seqs.get(room) || 0;
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    seq++;
    room.send("input", { seq, left: false, right: false, jump: false, ...getInput() });
    await sleep(16);
  }
  seqs.set(room, seq);
}

const a = new Client(`http://localhost:${PORT}`);
const ra = await a.joinOrCreate(ROOM);
const b = new Client(`http://localhost:${PORT}`);
const rb = await b.joinOrCreate(ROOM);
ra.onMessage("shot", () => {});
rb.onMessage("shot", () => {});
await sleep(400);
const A = () => ra.state.players.get(ra.sessionId);
const B = () => rb.state.players.get(rb.sessionId);
console.log("joined A:", ra.sessionId, " B:", rb.sessionId);

// Drive both to the left wall (they stack — players don't collide — with clear LOS).
await Promise.all([stream(ra, () => ({ left: true }), 2200), stream(rb, () => ({ left: true }), 2200)]);
await sleep(200);
console.log(`positioned: A@(${A().x.toFixed(0)},${A().y.toFixed(0)}) B@(${B().x.toFixed(0)},${B().y.toFixed(0)}) Bhp=${B().hp}`);
if (B().hp !== 100) fail("B not at full HP before combat");

// A fires toward B; both keep holding left to stay stacked at the wall. Stop at death.
let minHp = B().hp;
let aseq = seqs.get(ra) || 0;
let bseq = seqs.get(rb) || 0;
const start = Date.now();
while (Date.now() - start < 5000) {
  aseq++;
  ra.send("input", { seq: aseq, left: true, right: false, jump: false });
  bseq++;
  rb.send("input", { seq: bseq, left: true, right: false, jump: false });
  ra.send("shoot", { angle: PI });
  await sleep(40);
  if (B().hp < minHp) minHp = B().hp;
  if (!B().alive) break;
}
console.log(`combat: minHp=${minHp} Bdeaths=${B().deaths} Akills=${A().kills} Balive=${B().alive}`);
if (minHp >= 100) fail("B took no damage");
if (B().alive || B().deaths < 1) fail("B never died");
if (A().kills < 1) fail("A was not credited the kill");

// Stop firing; poll for respawn (delay is RESPAWN_DELAY_MS = 2500).
let respawned = false;
const waitStart = Date.now();
while (Date.now() - waitStart < 4500) {
  await sleep(100);
  if (B().alive) {
    respawned = true;
    break;
  }
}
console.log(`respawn: Balive=${B().alive} Bhp=${B().hp} after ${Date.now() - waitStart}ms`);
if (!respawned) fail("B did not respawn");
if (B().hp !== B().maxHp) fail("B HP not restored on respawn");

console.log("✅ M2 COMBAT INTEGRATION TEST PASSED");
await ra.leave();
await rb.leave();
process.exit(0);
