// End-to-end M1 test against the live server (raw colyseus.js client, no browser).
// Verifies authoritative platformer physics over the network: gravity/grounding,
// horizontal movement, jumping, and cross-client consistency.
import { Client } from "colyseus.js";

const PORT = 2567;
const ROOM = "arena";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => {
  console.error("❌ FAIL:", m);
  process.exit(1);
};

let seq = 0;
/** Stream inputs at ~60 Hz for durationMs. getInput() returns {left,right,jump}. */
async function hold(room, getInput, durationMs) {
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    seq++;
    room.send("input", { seq, left: false, right: false, jump: false, ...getInput() });
    await sleep(16);
  }
}

// noBots: isolate movement/sync from the Horde AI.
const a = new Client(`http://localhost:${PORT}`);
const ra = await a.joinOrCreate(ROOM, { noBots: true });
ra.onMessage("shot", () => {});
const me = () => ra.state.players.get(ra.sessionId);
console.log("joined A:", ra.sessionId);

// 1) Gravity + grounding — fall from spawn and settle.
await hold(ra, () => ({}), 1500);
await sleep(200);
const restY = me().y;
console.log(`settled: y=${restY.toFixed(1)} grounded=${me().grounded}`);
if (restY < 120) fail("player did not fall under gravity");
if (!me().grounded) fail("player not grounded after settling");

// 2) Horizontal movement.
const x0 = me().x;
await hold(ra, () => ({ right: true }), 700);
await sleep(150);
const x1 = me().x;
console.log(`move right: ${x0.toFixed(1)} -> ${x1.toFixed(1)} (Δ=${(x1 - x0).toFixed(1)})`);
if (x1 - x0 < 40) fail(`did not move right (Δ=${(x1 - x0).toFixed(1)})`);

// 3) Jump — first settle on the ground (movement may have left us mid-air), then pulse jump.
for (let i = 0; i < 90; i++) {
  seq++;
  ra.send("input", { seq, left: false, right: false, jump: false });
  await sleep(16);
  if (me().grounded) break;
}
const yBefore = me().y;
let minY = yBefore;
const jStart = Date.now();
while (Date.now() - jStart < 1200) {
  seq++;
  const jump = Date.now() - jStart < 120;
  ra.send("input", { seq, left: false, right: false, jump });
  await sleep(16);
  if (me().y < minY) minY = me().y;
}
const apex = yBefore - minY;
console.log(`jump apex=${apex.toFixed(1)}px`);
if (apex < 25) fail(`jump too small (apex=${apex.toFixed(1)})`);

// 4) Cross-client consistency — second client sees A; positions match.
const b = new Client(`http://localhost:${PORT}`);
const rb = await b.joinOrCreate(ROOM, { noBots: true });
rb.onMessage("shot", () => {});
await sleep(500);
const humans = () => {
  let n = 0;
  rb.state.players.forEach((p) => {
    if (!p.isBot) n++;
  });
  return n;
};
if (humans() !== 2) fail(`client B sees ${humans()} humans, expected 2`);
await hold(ra, () => ({ right: true }), 500);
await sleep(300);
const aSelf = ra.state.players.get(ra.sessionId).x;
const bViewA = rb.state.players.get(ra.sessionId).x;
const drift = Math.abs(aSelf - bViewA);
console.log(`sync: A self x=${aSelf.toFixed(1)} | B sees A x=${bViewA.toFixed(1)} (drift=${drift.toFixed(2)})`);
if (drift > 2) fail(`A out of sync across clients (drift=${drift.toFixed(2)}px)`);

console.log("✅ M1 INTEGRATION TEST PASSED");
await ra.leave();
await rb.leave();
process.exit(0);
